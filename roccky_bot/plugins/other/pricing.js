import { toArray } from '../../lib/Utilities.js'
import { ModuleCache } from '../../lib/Watcher.js'

const INNER_TEXT = 'There\'s affordable price\'s!'

const PREMIUM_PACKAGE = [
   ['Day(s)', 'Price'],
   ['1', 'Rp 2.500'],
   ['3', 'Rp 5.000'],
   ['7', 'Rp 10.000'],
   ['15', 'Rp 20.000'],
   ['30', 'Rp 25.000']
]

const RENTAL_PACKAGE = [
   ['Day(s)', 'Price'],
   ['7', 'Rp 10.000'],
   ['14', 'Rp 20.000'],
   ['28', 'Rp 25.000']
]

// Helper sederhana untuk mengonversi array tabel menjadi format tabel Markdown murni
const formatTable = (tableData) => {
   return tableData.map((row, i) => {
      const items = row.items || row
      // Jika ini baris pertama atau ditandai sebagai heading, tambahkan garis batas tabel
      if (i === 0 || row.isHeading) {
         return `| ${items.join(' | ')} |\n| ${items.map(() => '---').join(' | ')} |`
      }
      return `| ${items.join(' | ')} |`
   }).join('\n')
}

export default {
   command: ['premium', 'rental'],
   hidden: ['prem', 'rent'],
   category: 'other',
   async run(m, {
      sock,
      isPrefix,
      command
   }) {
      const isRentCommand = command === 'rental' || command === 'rent'
      
      // 1. Konstruksi Teks Markdown
      let responseText = isRentCommand 
         ? `# 🏡 RENTAL PRICING\n---\n${INNER_TEXT}\n\n✨ Pricing\n`
         : `# ✨ PREMIUM PRICING\n---\n${INNER_TEXT}\n\n✨ Pricing\n`

      const packageData = isRentCommand ? RENTAL_PACKAGE : PREMIUM_PACKAGE
      responseText += formatTable(packageData.map((items, index) => ({
         isHeading: index === 0,
         items
      }))) + '\n\n'

      if (!isRentCommand) {
         responseText += `---\nYou can access all of these premium commands after buying premium package:\n\n📋 Premium Commands\n`
         const tableCommands = [{
            isHeading: true,
            items: ['Commands', 'Premium', 'Free']
         }]
         
         for (const modules of ModuleCache.values()) {
            const moduleList = Array.isArray(modules) ? modules : [modules]
            for (const { command, premium } of moduleList) {
               if (!premium) continue
               const isPremium = premium ? '✅' : '❌'
               const isFree = premium ? '❌' : '✅'
               const commands = toArray(command)
               for (let i = 0; i < commands.length; i++) {
                  tableCommands.push({
                     isHeading: false,
                     items: [commands[i], isPremium, isFree]
                  })
               }
            }
         }
         responseText += formatTable(tableCommands) + '\n\n'
      }

      responseText += `If you want to buy please contact \`${isPrefix}owner\``

      // 2. Error Handling & Safe Fallback Mechanism
      try {
         // Kirim menggunakan payload murni { text } tanpa key asing
         await sock.sendMessage(m.chat, {
            text: responseText
         }, {
            quoted: m
         })
      } catch (error) {
         console.error('❌ Failed to send pricing message:', error?.message || error)
         
         // Fallback: Kirim string mentah sebagai penyelamat agar pengguna tetap mendapat balasan
         try {
            await sock.sendMessage(m.chat, {
               text: String(responseText)
            }, {
               quoted: m
            })
         } catch (fallbackError) {
            console.error('❌ Fallback pricing message also failed:', fallbackError?.message || fallbackError)
         }
      }
   }
}
