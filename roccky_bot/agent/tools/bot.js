import { AgentError, PolicyError } from '../errors.js'
import { requireConfirmation } from './helpers.js'

const BOOLEAN_SETTINGS = new Set([
   'self', 'afkNotifier', 'autoDownload', 'commandSuggestions', 'chatBot',
   'noPrefix', 'groupOnly', 'menuMusic', 'notifier', 'reactStatus',
   'readMessage', 'rejectCall', 'secureLabel', 'slowMode', 'typingPresence'
])

const HIGH_IMPACT_SETTINGS = new Set(['self', 'noPrefix', 'groupOnly'])

const runtimeFor = context => {
   const runtime = context.input?.runtime
   if (!runtime) throw new AgentError('Live bot runtime is unavailable in this integration.', 'BOT_RUNTIME_UNAVAILABLE')
   return runtime
}

export function registerBotTools(registry) {
   registry.register({
      name: 'inspect_bot_runtime',
      description: 'Inspect the live WhatsApp bot connection, uptime, safe settings, and aggregate database counts without exposing user records or credentials.',
      parameters: { type: 'object', properties: {} },
      async execute(_args, context) {
         const { sock, db, setting } = runtimeFor(context)
         const safeSettings = {}
         for (const key of BOOLEAN_SETTINGS) safeSettings[key] = setting?.[key]
         return {
            connected: Boolean(sock?.user),
            bot: { name: sock?.user?.name || globalThis.botName || null, jid: sock?.user?.decodedId || sock?.user?.id || null },
            uptimeMs: globalThis._connectedAt ? Date.now() - globalThis._connectedAt : null,
            users: db?.users?.size ?? null,
            groups: db?.groups?.size ?? null,
            settings: safeSettings,
            disabledCommands: Array.isArray(setting?.disabledCommand) ? [...setting.disabledCommand] : []
         }
      }
   })

   registry.register({
      name: 'set_bot_setting',
      description: 'Change one allowlisted live boolean bot setting and persist it through the existing database write mechanism. High-impact availability modes require confirmation.',
      parameters: {
         type: 'object', required: ['name', 'value'],
         properties: { name: { type: 'string' }, value: { type: 'boolean' } }
      },
      async execute(args, context) {
         if (!BOOLEAN_SETTINGS.has(args.name)) throw new PolicyError(`Bot setting is not allowlisted: ${args.name}`)
         if (typeof args.value !== 'boolean') throw new AgentError('value must be boolean.', 'INVALID_TOOL_ARGUMENTS')
         const runtime = runtimeFor(context)
         if (!runtime.setting) throw new AgentError('The live bot setting object is unavailable.', 'BOT_RUNTIME_UNAVAILABLE')
         if (HIGH_IMPACT_SETTINGS.has(args.name)) {
            const pending = await requireConfirmation(context, 'set_bot_setting', args, `Change high-impact bot setting ${args.name} to ${args.value}`)
            if (pending) return pending
         }
         const previous = runtime.setting?.[args.name]
         runtime.setting[args.name] = args.value
         runtime.db?.requestWrite?.()
         return { ok: true, setting: args.name, previous, value: args.value }
      }
   })

   registry.register({
      name: 'set_command_enabled',
      description: 'Enable or disable a bot command using the existing disabledCommand setting.',
      parameters: {
         type: 'object', required: ['command', 'enabled'],
         properties: { command: { type: 'string' }, enabled: { type: 'boolean' } }
      },
      async execute(args, context) {
         const command = String(args.command || '').trim().toLowerCase()
         if (!/^[\p{L}\p{N}_+-]{1,64}$/u.test(command)) throw new AgentError('Invalid command name.', 'INVALID_TOOL_ARGUMENTS')
         const runtime = runtimeFor(context)
         if (!Array.isArray(runtime.setting.disabledCommand)) runtime.setting.disabledCommand = []
         const disabled = runtime.setting.disabledCommand
         const index = disabled.indexOf(command)
         if (args.enabled && index >= 0) disabled.splice(index, 1)
         if (!args.enabled && index < 0) disabled.push(command)
         runtime.db?.requestWrite?.()
         return { ok: true, command, enabled: Boolean(args.enabled) }
      }
   })

   registry.register({
      name: 'restart_bot',
      description: 'Request a controlled bot-process restart through the existing IPC launcher. Always requires explicit owner confirmation.',
      parameters: { type: 'object', properties: { reason: { type: 'string' } } },
      async execute(args, context) {
         runtimeFor(context)
         const pending = await requireConfirmation(context, 'restart_bot', args, `Restart the WhatsApp bot${args.reason ? `: ${args.reason}` : ''}`)
         if (pending) return pending
         if (typeof process.send !== 'function') throw new AgentError('The bot is not running under its IPC launcher.', 'IPC_UNAVAILABLE')
         const timer = setTimeout(() => process.send({ action: 'reset', reason: args.reason || 'Requested by the authenticated owner agent' }), 10_000)
         timer.unref?.()
         return { ok: true, restartScheduled: true, delayMs: 10_000 }
      }
   })
}

