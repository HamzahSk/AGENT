import { frame } from '../../lib/Utilities.js'

const CHAT_WHATSAPP_URL = 'https://chat.whatsapp.com/'

export default {
   command: 'inviteinfo',
   hidden: 'ceklink',
   category: 'tools',
   async run(m, {
      sock,
      isPrefix,
      args
   }) {
      try {
         let code = (args[0] || '').trim()
         if (!code)
            return m.reply(`👉🏻 *Example*: ${isPrefix + command} https://chat.whatsapp.com/AbCdEfGhIjK`)
         if (code.includes(CHAT_WHATSAPP_URL))
            code = code.replace(CHAT_WHATSAPP_URL, '').trim()
         m.react('🕒')
         const metadata = await sock.groupGetInviteInfo(code)
         if (!metadata)
            return m.reply('❌ Invite code is invalid or has been revoked.')
         const print = frame('GROUP INFO', [
            `*Name*: ${metadata.subject || '-'}`,
            `*Owner*: @${metadata.owner?.split('@')[0] || '-'}`,
            `*Size*: ${metadata.size || metadata.participants?.length || '-'}`
         ], '👥')
         m.reply(print)
      }
      catch (error) {
         console.error(error)
         m.reply('❌ ' + error.message)
      }
   },
   limit: 1
}