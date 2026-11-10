import { nexray } from '../../lib/Request.js'

export default {
   command: 'emojito',
   hidden: 'emogif',
   category: 'tools',
   async run(m, {
      sock,
      isPrefix,
      command,
      args
   }) {
      try {
         if (!args[0])
            return m.reply(`👉🏻 *Example*: ${isPrefix + command} 😁`)
         await m.react('🕒')
         const data = await nexray('tools/emojigif', {
            emoji: args[0]
         })
         if (!Buffer.isBuffer(data))
            return m.reply('❌ Failed to get data.')
         await sock.sendMedia(m.chat, data, '', m, {
            sticker: true,
            mimetype: 'image/webp'
         })
      }
      catch (error) {
         console.error(error)
         await m.reply('❌ ' + error.message)
      }
   },
   limit: 1
}