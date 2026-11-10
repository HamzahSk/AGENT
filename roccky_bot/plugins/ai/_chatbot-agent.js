import { createPluginAgentIntegration } from '../../agent/plugin.js?runtime=owner-auth-v2'

const RUNTIME_KEY = Symbol.for('roccky.owner-agent.runtime')

const previousRuntime = globalThis[RUNTIME_KEY]
const runtime = globalThis[RUNTIME_KEY] = {
   activeChats: previousRuntime?.activeChats || new Set(),
   recentMessages: previousRuntime?.recentMessages || new Map(),
   // Recreate the integration on hot reload so provider/environment changes
   // are applied without losing the active owner chat sessions.
   integration: createPluginAgentIntegration(),
   version: 4
}

const isActive = m => runtime.activeChats.has(m.chat)

const isOwnMessage = (m, sock) => {
   if (m?.fromMe === true || m?.isMe === true || m?.key?.fromMe === true) return true

   const ownIds = new Set([
      sock?.user?.id,
      sock?.user?.decodedId,
      sock?.user?.decodedLid
   ].filter(Boolean).map(String))

   return [m?.sender, m?.senderLid]
      .filter(Boolean)
      .some(sender => ownIds.has(String(sender)))
}

const isDuplicateMessage = m => {
   const id = m?.id || m?.key?.id
   if (!id) return false

   const now = Date.now()
   const key = `${m?.chat || ''}:${id}`
   const previous = runtime.recentMessages.get(key)
   const duplicate = previous !== undefined && now - previous <= 5 * 60_000

   runtime.recentMessages.set(key, now)

   // Keep this hot-reload-persistent cache bounded and short lived.
   if (runtime.recentMessages.size > 500) {
      const cutoff = now - 5 * 60_000
      for (const [messageKey, seenAt] of runtime.recentMessages) {
         if (seenAt < cutoff || runtime.recentMessages.size > 500)
            runtime.recentMessages.delete(messageKey)
      }
   }

   return duplicate
}

const messageStyle = () => String(process.env.AGENT_MESSAGE_STYLE || 'text').trim().toLowerCase()

const sessionPrompt = value => {
   const text = String(value || '').trim()
   const normalized = text.toLowerCase()

   if (normalized === 'status')
      return 'Inspect the live bot and current project, then give me a concise status report including important errors or risks.'

   if (normalized === 'tasks')
      return 'List the current persistent development tasks, their status, and the most useful next action.'

   if (normalized === 'audit')
      return 'Perform a focused security and reliability audit of the bot project. Inspect current files first and report concrete findings.'

   if (normalized.startsWith('confirm ')) {
      const id = text.slice(8).trim()
      return `I explicitly approve pending confirmation ${id}. Execute that exact pending action now, then report the real result.`
   }

   return text
}

const isCloseRequest = value => /^(?:close|exit|stop|keluar|tutup)(?:\s+(?:agent|mode agent))?$/i.test(String(value || '').trim())

const sendWelcome = async (m, context) => {
   const { sock, isPrefix } = context
   const provider = runtime.integration.agent.config.provider
   return sock.sendButton(m.chat, {
      header: 'Owner Development Agent',
      text: [
         '🤖 *Agent owner aktif.*',
         '',
         'Kirim instruksi biasa untuk membaca, memperbaiki, menguji, atau mengembangkan bot. Agent menyimpan konteks dan akan meminta konfirmasi sebelum tindakan berisiko.',
         '',
         `Untuk menutup sesi, kirim *tutup agent* atau gunakan tombol di bawah.`
      ].join('\n'),
      footer: `Owner only · ${provider.model} · ${provider.apiMode}`,
      buttons: [
         { type: 'reply', displayText: '📊 Status Bot', id: `${isPrefix}agent status` },
         { type: 'reply', displayText: '📋 Development Tasks', id: `${isPrefix}agent tasks` },
         { type: 'reply', displayText: '🛡️ Security Audit', id: `${isPrefix}agent audit` },
         { type: 'reply', displayText: '✖️ Close Agent', id: `${isPrefix}agent close` }
      ],
      quoted: m
   })
}

const sendAIRichResponse = async (m, context, text) => {
   if (messageStyle() !== 'airich') return false

   try {
      const { MB } = await import('baileys')
      if (!MB?.AIRich) return false

      const rich = new MB.AIRich(context.sock)
         .setTitle('Owner Development Agent')
         .setFooter('Private owner session')
         .addText(text)

      // DOCS_BAILEYS: AIRich must be sent by its own builder, uses two
      // relay stanzas, and must not be combined with interactiveMessage.
      await rich.send(m.chat, {
         quoted: m,
         verification: 'auto'
      })
      return true
   }
   catch (error) {
      console.warn('[OwnerAgent] AIRich unavailable, falling back to text:', error.message || error)
      return false
   }
}

const sendAgentResponse = async (m, context, text) => {
   if (await sendAIRichResponse(m, context, text)) return
   await context.func.sendAI(context.sock, m.chat, text, { quoted: m })
}

const sendConfirmation = async (m, context, pending) => {
   const { sock, isPrefix } = context
   return sock.sendButton(m.chat, {
      header: 'Confirmation Required',
      text: `⚠️ *${pending.tool}*\n\n${pending.reason}\n\nID: \`${pending.id}\``,
      footer: `Expires: ${new Date(pending.expiresAt).toLocaleString('id-ID', { timeZone: globalThis.localTimezone || 'Asia/Jakarta' })}`,
      buttons: [
         { type: 'reply', displayText: '✅ Confirm Action', id: `${isPrefix}agent confirm ${pending.id}` },
         { type: 'reply', displayText: '✖️ Close Agent', id: `${isPrefix}agent close` }
      ],
      quoted: m
   })
}

const runAgent = async (m, context, prompt) => {
   if (!prompt) return sendWelcome(m, context)

   await m.react('🕒')
   const result = await runtime.integration.handleMessage(m, {
      ...context,
      body: prompt
   })

   await sendAgentResponse(m, context, result.text)
   await m.react('✅')

   const pending = result.newPendingConfirmations?.at(-1)
   if (pending) await sendConfirmation(m, context, pending)

   return result
}

const commandHandler = {
   command: 'agent',
   hidden: ['devagent', 'owneragent'],
   category: 'owner',
   owner: true,
   private: true,
   async run(m, context) {
      if (isDuplicateMessage(m)) return

      const input = String(context.text || '').trim()

      if (isCloseRequest(input)) {
         runtime.activeChats.delete(m.chat)
         return m.reply('✅ Owner development agent dinonaktifkan untuk chat ini.')
      }

      runtime.activeChats.add(m.chat)

      try {
         return await runAgent(m, context, sessionPrompt(input))
      }
      catch (error) {
         console.error('[OwnerAgent] Command error:', error)
         await m.react('❌')
         return m.reply(`❌ Agent gagal memproses permintaan: ${error.message || String(error)}`)
      }
   }
}

const conversationHandler = {
   owner: true,
   private: true,
   async run(m, context) {
      // Responses, reactions, AIRich relay stanzas, and protocol messages sent
      // by this bot can come back through Baileys as ordinary owner events.
      // Never feed them into the agent or it will answer itself indefinitely.
      if (isOwnMessage(m, context.sock)) return
      if (isDuplicateMessage(m)) return
      if (!isActive(m)) return
      if (typeof context.body !== 'string' || !context.body.trim()) return

      if (isCloseRequest(context.body)) {
         runtime.activeChats.delete(m.chat)
         return m.reply('✅ Owner development agent dinonaktifkan untuk chat ini.')
      }

      try {
         await runAgent(m, context, context.body.trim())
      }
      catch (error) {
         console.error('[OwnerAgent] Conversation error:', error)
         await m.react('❌')
         await m.reply(`❌ Agent gagal memproses permintaan: ${error.message || String(error)}`)
      }
   }
}

export default [commandHandler, conversationHandler]

