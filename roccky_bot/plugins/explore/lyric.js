import { deline } from '../../lib/Request.js'
import { frame } from '../../lib/Utilities.js'

export default {
   command: 'lyric',
   hidden: 'lirik',
   category: 'explore',
   async run(m, {
      isPrefix,
      command,
      text
   }) {
      try {
         const keyCache = m.sender + 'lyric'
         const userPreviousResult = ExploreSession.get(keyCache)
         if (
            text &&
            !isNaN(text) &&
            userPreviousResult
         ) {
            const result = userPreviousResult[Number(text) - 1]
            if (!result)
               return m.reply(`❌ Invalid input.`)
            await m.reply(result.plainLyrics)
         }
         else {
            if (!text)
               return m.reply(`👉🏻 *Example*: ${isPrefix + command} Army dreamers`)
            await m.react('🕒')
            const data = await deline('tools/lyrics', {
               title: text
            })
            if (!data.status)
               return m.reply('❌ Failed to get data.')
            const flattedResult = data.result.flatMap((result, index, array) => {
               const lines = [
                  `${index + 1}. ${result.trackName}`,
                  `*Artist*: ${result.artistName}`
               ]
               if (index !== array.length - 1)
                  lines.push('')
               return lines
            })
            const printHowTo = frame('HOW TO GET', [
               `To show the lyric use \`${isPrefix + command} <number>\` command`,
               `*Example*: ${isPrefix + command} 1`
            ], '📄')
            const printList = frame('LYRICS', flattedResult, '🎼')
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