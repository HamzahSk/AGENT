
import { fetchThumbnail, frame, greeting } from '../../lib/Utilities.js'

export default {
   command: ['credits', 'script', 'thanksto'],
   hidden: 'sc',
   category: 'other',
   async run(m) {
      const printCredits = frame('CREDITS', [
         'itsliaaa — Project Maintainer & Creator'
      ], '👤')
      const printDonateUrl = frame('DONATE', [
         donateUrl
      ], '💰')
      const printAPIs = frame('THIRD-PARTY SERVICES', [
         'rynn-k — Nekolabs API',
         'elrayyxml — Nexray API',
         'faa — Faa API',
         'Deline Clarissa — Deline API',
         'ZenzzXD — Zennz API'
      ], '🌐')
      const printSourceCode = frame('SOURCE CODE', [
         'https://github.com/itsliaaa/starseed#readme'
      ], '🧩')
      m.reply(printCredits + '\n\n' +
         printDonateUrl + '\n\n' +
         printAPIs + '\n\n' +
         printSourceCode, {
         externalAdReply: {
            title: botName,
            body: greeting(),
            thumbnail: await fetchThumbnail(),
            largeThumbnail: true
         }
      })
   }
}