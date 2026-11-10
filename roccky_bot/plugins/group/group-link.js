import { frame } from '../../lib/Utilities.js'

export default {
   command: 'gclink',
   category: 'group',
   async run(m, {
      sock
   }) {
      const code = await sock.groupInviteCode(m.chat)
      const print = frame('GROUP LINK', [
         'https://chat.whatsapp.com/' + code
      ], '🏷️')
      await m.reply(print)
   },
   group: true,
   botAdmin: true
}