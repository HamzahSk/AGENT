import { isMimeAudio } from '../../lib/Utilities.js'

export default {
   command: 'getgcsw',
   category: 'group',
   async run(m, {
      sock
   }) {
      const q = m.quoted
      if (!q || !m.msg.contextInfo.quotedMessage.groupStatusMessageV2)
         return m.reply('💭 Reply group status.')
      const mimetype = (q.msg || q).mimetype
      if (!mimetype)
         return m.reply('💭 Reply media message in group status.')
      await m.react('🕒')
      await sock.sendMedia(m.chat, await q.download(), q.text || '', m, {
         audio: isMimeAudio(mimetype),
         ptt: q.ptt
      })
   },
   group: true
}