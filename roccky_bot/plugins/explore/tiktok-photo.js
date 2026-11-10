import { nexray } from '../../lib/Request.js'
import { frame, resizeImage } from '../../lib/Utilities.js'

export default {
   command: 'ttphoto',
   category: 'explore',
   async run(m, {
      sock,
      isPrefix,
      command,
      text
   }) {
      try {
         const keyCache = m.sender + 'tiktok-photo'
         const userPreviousResult = ExploreSession.get(keyCache)
         if (
            text &&
            !isNaN(text) &&
            userPreviousResult
         ) {
            const result = userPreviousResult[Number(text) - 1]
            if (!result)
               return m.reply(`❌ Invalid input.`)
            await m.react('🕒')
            const musicUrl = result.music_info?.url
            if (result.images.length < 2) {
               const buffer = await resizeImage(
                  result.images[0],
                  720, null
               )
               await sock.sendMedia(m.chat, buffer, result.title, m)
            }
            else {
               const album = []
               for (let i = 0; i < result.images.length; i++) {
                  const url = result.images[i]
                  album.push({
                     image: url.includes('webp') ?
                        await resizeImage(
                           url,
                           720, null
                        ) :
                        { url }
                  })
               }
               await sock.sendMessage(m.chat, {
                  album
               }, {
                  quoted: m
               })
            }
            if (musicUrl)
               await sock.sendMedia(m.chat, musicUrl, '', m, {
                  audio: true
               })
         }
         else {
            if (!text)
               return m.reply(`👉🏻 *Example*: ${isPrefix + command} nature`)
            await m.react('🕒')
            const data = await nexray('search/tiktokphoto', {
               q: text
            })
            if (!data.status)
               return m.reply('❌ Failed to get data.')
            const flattedResult = data.result.flatMap((result, index, array) => {
               const lines = [
                  `${index + 1}. ${result.id}`,
                  `*Author*: ${result.author?.fullname || '-'}`
               ]
               if (index !== array.length - 1)
                  lines.push('')
               return lines
            })
            const printHowTo = frame('HOW TO GET', [
               `To show the lyric use \`${isPrefix + command} <number>\` command`,
               `*Example*: ${isPrefix + command} 1`
            ], '📄')
            const printList = frame('TIKTOK PHOTO', flattedResult, '🖼️')
            ExploreSession.set(keyCache, data.result)
            await m.reply(printHowTo + '\n\n' +
               printList)
         }
      }
      catch (error) {
         console.error(error)
         await m.reply('❌ ' + error.message)
      }
   },
   limit: 1
}