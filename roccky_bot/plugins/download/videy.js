import { nexray } from '../../lib/Request.js'

export default {
   command: 'videy',
   category: 'download',
   async run(m, {
      sock,
      isPrefix,
      command,
      args
   }) {
      try {
         if (!args[0])
            return m.reply(`👉🏻 *Example*: ${isPrefix + command} https://videy.co/v?id=7ZH1ZRIF`)
         if (!args[0].includes('videy.co'))
            return m.reply('❌ Invalid URL.')
         await m.react('🕒')
         const data = await nexray('downloader/videy', {
            url: args[0]
         })
         if (!data.status)
            return m.reply('❌ Failed to get data.')
         await sock.sendMedia(m.chat, data.result, '', m)
      }
      catch (error) {
         console.error(error)
         await m.reply('❌ ' + error.message)
      }
   },
   limit: 1
}