import { nexray } from '../../lib/Request.js'
import { uguu } from '../../lib/Scraper.js'
import { isMimeImage } from '../../lib/Utilities.js'

export default {
   command: 'removewm',
   hidden: 'nowatermark',
   category: 'tools',
   async run(m, {
      sock,
      isPrefix,
      command
   }) {
      try {
         const q = m.quoted?.url ? m.quoted : m
         const mimetype = (q.msg || q).mimetype
         if (!isMimeImage(mimetype))
            return m.reply('💭 Provide an image to remove watermark.')
         await m.react('🕒')
         const upload = await uguu(
            await q.download()
         )
         const data = await nexray('tools/dewatermark', {
            url: upload
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
   premium: true,
   limit: 1
}