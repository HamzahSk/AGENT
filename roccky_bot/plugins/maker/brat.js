import { bratSticker, bratVideoSticker } from '../../lib/Utilities.js'

export default {
   command: ['brat', 'bratvid'],
   category: 'maker',
   async run (m, {
      sock,
      isPrefix,
      command,
      text
   }) {
      try {
         if (!text)
            return m.reply(`👉🏻 *Example*: ${isPrefix + command} i'm here`)
         if (text.length > 150)
            return m.reply('❌ Maximum 150 characters.')
         await m.react('🕒')
         const data = await (
            command === 'brat' ?
               bratSticker(text) :
               bratVideoSticker(text)
         )
         await sock.sendMedia(m.chat, data, '', m, {
            sticker: true
         })
      }
      catch (error) {
         console.error(error)
         await m.reply('❌ ' + error.message)
      }
   },
   limit: 1
}