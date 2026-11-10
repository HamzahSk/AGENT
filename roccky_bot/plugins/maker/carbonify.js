import { nexray } from '../../lib/Request.js'

export default {
   command: 'carbonify',
   category: 'maker',
   async run(m, {
      sock,
      isPrefix,
      command,
      text: code
   }) {
      try {
         if (!code)
            return m.reply(`👉🏻 *Example*: ${isPrefix + command} console.log('Starseed')`)
         await m.react('🕒')
         const data = await nexray('maker/codesnap', {
            code
         })
         if (!Buffer.isBuffer(data))
            return m.reply('❌ Failed to get data.')
         await sock.sendMedia(m.chat, data, '', m)
      }
      catch (error) {
         console.error(error)
         await m.reply('❌ ' + error.message)
      }
   },
   limit: 1
}