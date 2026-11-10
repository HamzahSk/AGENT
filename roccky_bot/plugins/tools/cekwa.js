import { extractNumber } from '../../lib/Serialize.js'
import { frame } from '../../lib/Utilities.js'

export default {
   command: 'cekwa',
   hidden: 'onwa',
   category: 'tools',
   async run(m, {
      sock,
      isPrefix
   }) {
      try {
         const userId = extractNumber(m)
         if (!userId)
            return m.reply(`👉🏻 *Example*: ${isPrefix + command} 6281234567890`)
         const number = userId.split('@')[0]
         m.react('🕒')
         const [result] = await sock.onWhatsApp(number)
         if (!result?.exists)
            return m.reply(frame('CEK WA', [
               `*Number*: ${number}`,
               `*Status*: ❌ Belum terdaftar di WhatsApp`
            ], '📱'))
         const print = frame('CEK WA', [
            `*Number*: ${result.jid?.split('@')[0] || number}`,
            `*Status*: ✅ Terdaftar di WhatsApp`
         ], '📱')
         m.reply(print)
      }
      catch (error) {
         console.error(error)
         m.reply('❌ ' + error.message)
      }
   },
   limit: 1
}