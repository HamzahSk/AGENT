import { frame } from '../../lib/Utilities.js'

export default {
   command: 'revokelink',
   hidden: 'revoke',
   category: 'group',
   async run(m, {
      sock
   }) {
      try {
         const code = await sock.groupRevokeInvite(m.chat)
         const print = frame('GROUP LINK', [
            '✅ Link baru berhasil dibuat.',
            '',
            'https://chat.whatsapp.com/' + code
         ], '🏷️')
         await m.reply(print)
      }
      catch (error) {
         console.error(error)
         await m.reply('❌ ' + error.message)
      }
   },
   group: true,
   admin: true,
   botAdmin: true
}