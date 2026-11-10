import { extractNumber } from '../../lib/Serialize.js'
import { frame } from '../../lib/Utilities.js'

export default {
   command: 'cekstatus',
   hidden: 'about',
   category: 'tools',
   async run(m, {
      sock,
      isPrefix
   }) {
      try {
         const userId = extractNumber(m)
         if (!userId)
            return m.reply(`👉🏻 *Example*: ${isPrefix + command} 6281234567890`)
         if (userId.startsWith(ownerNumber))
            return m.reply('❌ Can\'t get owner status.')
         m.react('🕒')
         const status = await sock.fetchStatus(userId)
         if (!status?.status)
            return m.reply('❌ User didn\'t set a status.')
         const print = frame('ABOUT', status.status.split(/\r?\n/), '💭')
         m.reply(print)
      }
      catch (error) {
         console.error(error)
         m.reply('❌ ' + error.message)
      }
   },
   limit: 1
}