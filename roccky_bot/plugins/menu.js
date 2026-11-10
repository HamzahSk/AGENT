import { CATEGORY_DESCRIPTIONS, CATEGORY_EMOJIS, FAKE_QUOTE, POPULAR_CATEGORIES } from '../lib/Constants.js'

import { Func } from '#func'
import { CommandIndex, ModuleCache } from '../lib/Watcher.js'

const HIGHLIGHT_LABEL = { highlight_label: 'Most Used' }

// Mimetype dokumen PPT modern (Open XML Presentation).
const DOC_MIMETYPE = 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
// Mimetype dokumen PPT legacy.
const PPT_MIMETYPE = 'application/vnd.ms-powerpoint'

let CACHED_REGISTRY = null,
   LAST_REGISTRY_SIZE = 0

const getCommandRegistry = () => {
   const commandIndexSize = CommandIndex.size
   if (CACHED_REGISTRY && LAST_REGISTRY_SIZE === commandIndexSize)
      return CACHED_REGISTRY

   const commandsSet = new Set()
   const categoriesSet = new Set()
   const grouped = {}

   // ModuleCache berisi campuran array (hasil load file) dan objek tunggal
   // (hasil registrasi game). Normalisasi keduanya agar semua tag/kategori
   // terdeteksi (bukan ter-filter satu saja).
   for (const modules of ModuleCache.values()) {
      const moduleList = Array.isArray(modules) ? modules : [modules]
      for (const module of moduleList) {
         const { command: cachedCommand, category } = module

         if (cachedCommand)
            for (const cmd of Func.toArray(cachedCommand))
               commandsSet.add(cmd)

         if (category && cachedCommand) {
            categoriesSet.add(category)
            grouped[category] ??= []
            grouped[category].push(...Func.toArray(cachedCommand))
         }
      }
   }

   const commands = [...commandsSet].sort()
   const categories = [...categoriesSet].sort()

   for (const key in grouped)
      grouped[key].sort()

   CACHED_REGISTRY = { commands, categories, grouped }
   LAST_REGISTRY_SIZE = commandIndexSize

   return CACHED_REGISTRY
}

// Ringkasan status bot yang disisipkan di header/caption menu utama.
const buildStatusHeader = (db, setting, commandCount) =>
   Func.frame('BOT STATUS', [
      `👥 *Users*: ${db.users?.size || 0}`,
      `📚 *Commands*: ${commandCount}`,
      `⏱ *Uptime*: ${Func.toTime(process.uptime() * 1000)}`,
      `🧠 *RAM*: ${Func.formatSize(process.memoryUsage().rss)}`,
      `🔀 *Mode*: ${setting.self ? 'Self' : 'Public'}`
   ], '🤖')

const buildSections = (categories, grouped, isPrefix, command) =>
   categories.map(category => ({
      title: Func.toTitleCase(category),
      ...(POPULAR_CATEGORIES[category] ? HIGHLIGHT_LABEL : {}),
      rows: [{
         title: (CATEGORY_EMOJIS[category] ?? '📁') + ' ' + Func.toTitleCase(category),
         description: `📦 There are ${grouped[category].length} commands`,
         id: `${isPrefix + command} ${category}`
      }]
   }))

// Header dokumen (PPT/PPTX) untuk menuStyle 6 & 8. Buffer PPT/PPTX dibangkitkan
// lokal sehingga tidak bergantung pada ketersediaan URL eksternal dan tidak
// memicu error pembatalan media attachment.
const buildDocumentHeader = async (title = '', mimetype = DOC_MIMETYPE) => {
   try {
      const buffer = await Func.createMenuDocument(title || botName)
      const jpegThumbnail = await Func.resizeImage(botThumbnail, 300).catch(() => undefined)
      const extension = mimetype === PPT_MIMETYPE ? 'ppt' : 'pptx'
      return {
         document: buffer,
         fileName: `${title || botName} - Menu.${extension}`,
         mimetype,
         ...(jpegThumbnail ? { jpegThumbnail } : {})
      }
   }
   catch (error) {
      console.error('❌ buildDocumentHeader error:', error)
      return {}
   }
}

// Bungkus pengiriman pesan interaktif dengan try-catch dan fallback teks biasa.
const safeSend = async (m, fallbackText, sendFn) => {
   try {
      return await sendFn()
   }
   catch (error) {
      console.error('❌ Interactive menu send failed:', error)
      return m.reply(fallbackText.trim())
   }
}

export default {
   command: ['menu', 'command', 'help', 'allmenu'],
   async run(m, {
      sock,
      db,
      user,
      setting,
      isPrefix,
      command,
      text,
      scrap
   }) {
      try {
         const { commands, categories, grouped } = getCommandRegistry()
         let message = setting.menuMessage
            .replace('+tag', '@' + m.sender.split('@')[0])
            .replace('+name', m.pushName)
            .replace('+greeting', Func.greeting()) +
            '\n\n' +
            buildStatusHeader(db, setting, commands.length) +
            '\n\n'

         if (command === 'allmenu') {
            message += String.fromCharCode(8206).repeat(1000)
            for (const category in grouped) {
               message += Func.frame(category.toUpperCase(), grouped[category].map(cmd => isPrefix + cmd), CATEGORY_EMOJIS[category] ?? '📁') +
                  '\n\n'
            }
            return m.reply(message.trim(), {
               externalAdReply: {
                  title: botName,
                  body: Func.greeting(),
                  thumbnail: await Func.fetchThumbnail(),
                  largeThumbnail: true
               }
            })
         }
         else if (categories.includes(text)) {
            const print = buildStatusHeader(db, setting, commands.length) +
               '\n\n' +
               Func.frame(text.toUpperCase(), grouped[text].map(cmd => isPrefix + cmd), CATEGORY_EMOJIS[text] ?? '📁')
            return m.reply(print.trim())
         }
         else if (setting.menuStyle == 1) {
            message += Func.frame('CATEGORIES', categories.map(cmd => isPrefix + command + ' ' + cmd), '📋')
            m.reply(message.trim(), {
               externalAdReply: {
                  title: botName,
                  body: Func.greeting(),
                  thumbnail: await Func.fetchThumbnail(),
                  largeThumbnail: true
               }
            })
         }
         else if (setting.menuStyle == 2) {
            return safeSend(m, message.trim(), () => sock.sendList(m.chat, {
               title: '📚 Daftar Kategori',
               text: message.trim(),
               buttonText: 'Pilih Kategori',
               footer,
               sections: buildSections(categories, grouped, isPrefix, command),
               quoted: m
            }))
         }
         else if (setting.menuStyle == 3) {
            // Karena tombol list tidak didukung bersamaan dengan button biasa, kita tambahkan list ke pesan teks
            message += Func.frame('CATEGORIES', categories.map(cmd => isPrefix + command + ' ' + cmd), '📋')
            return safeSend(m, message.trim(), () => sock.sendCard(m.chat, {
               header: 'Menu Utama',
               text: message.trim(),
               image: botThumbnail,
               footer,
               buttons: [
                  { type: 'reply', displayText: '📃 All Menu', id: `${isPrefix}allmenu` },
                  { type: 'reply', displayText: '📊 Statistic', id: `${isPrefix}statistic` },
                  { type: 'url', displayText: '💰 Donate', url: donateUrl }
               ],
               quoted: m
            }))
         }
         else if (setting.menuStyle == 4) {
            message += Func.frame('CATEGORIES', categories.map(cmd => isPrefix + command + ' ' + cmd), '📋')
            return safeSend(m, message.trim(), () => sock.sendCard(m.chat, {
               header: 'Menu Utama',
               text: message.trim(),
               image: botThumbnail,
               footer,
               buttons: [
                  { type: 'reply', displayText: '📃 All Menu', id: `${isPrefix}allmenu` },
                  { type: 'url', displayText: '💰 Donate', url: donateUrl }
               ],
               quoted: m
            }))
         }
         else if (setting.menuStyle == 5) {
            message += Func.frame('CATEGORIES', categories.map(cmd => isPrefix + command + ' ' + cmd), '📋')
            return safeSend(m, message.trim(), () => sock.sendCard(m.chat, {
               header: 'Menu Utama',
               text: message.trim(),
               image: botThumbnail,
               footer,
               buttons: [
                  { type: 'reply', displayText: '📃 All Menu', id: `${isPrefix}allmenu` },
                  { type: 'url', displayText: '💰 Donate', url: donateUrl }
               ],
               quoted: m
            }))
         }
         else if (setting.menuStyle == 6) {
            message += Func.frame('CATEGORIES', categories.map(cmd => isPrefix + command + ' ' + cmd), '📋')
            const documentHeader = await buildDocumentHeader()
            return safeSend(m, message.trim(), () => sock.sendButton(m.chat, {
               text: message.trim(),
               footer,
               ...documentHeader,
               buttons: [
                  { type: 'reply', displayText: '📃 All Menu', id: `${isPrefix}allmenu` },
                  { type: 'reply', displayText: '📊 Statistic', id: `${isPrefix}statistic` }
               ],
               quoted: m
            }))
         }
         else if (setting.menuStyle == 7) {
            message += Func.frame('CATEGORIES', categories.map(cmd => isPrefix + command + ' ' + cmd), '📋')
            const profilePicture = await sock.profilePicture(m.sender)
            return safeSend(m, message.trim(), () => sock.sendCard(m.chat, {
               header: 'Menu Utama',
               text: message.trim(),
               image: profilePicture,
               footer,
               buttons: [
                  { type: 'reply', displayText: '📃 All Menu', id: `${isPrefix}allmenu` },
                  { type: 'reply', displayText: '📊 Statistic', id: `${isPrefix}statistic` }
               ],
               quoted: m
            }))
         }
         else if (setting.menuStyle == 8) {
            message += Func.frame('CATEGORIES', categories.map(cmd => isPrefix + command + ' ' + cmd), '📋')
            const documentHeader = await buildDocumentHeader('', PPT_MIMETYPE)
            return safeSend(m, message.trim(), () => sock.sendButton(m.chat, {
               text: message.trim(),
               footer,
               ...documentHeader,
               buttons: [
                  { type: 'reply', displayText: '📃 All Menu', id: `${isPrefix}allmenu` },
                  { type: 'reply', displayText: '📊 Statistic', id: `${isPrefix}statistic` }
               ],
               quoted: m
            }))
         }
         else if (setting.menuStyle == 9) {
            return safeSend(m, message.trim(), () => sock.sendCarousel(m.chat, {
               text: message.trim(),
               footer,
               cards: categories.map(category => ({
                  title: (CATEGORY_EMOJIS[category] ?? '📁') + ' ' + Func.toTitleCase(category),
                  text: Func.frame(category.toUpperCase(), [CATEGORY_DESCRIPTIONS[category]], CATEGORY_EMOJIS[category] ?? '📁'),
                  image: botThumbnail,
                  buttons: [{
                     type: 'reply',
                     displayText: 'Pilih',
                     id: `${isPrefix + command} ${category}`
                  }]
               })),
               quoted: m
            }))
         }
         if (setting.menuMusic)
            sock.sendMedia(m.chat, botMenuMusic, '', FAKE_QUOTE, {
               ptt: true
            })
      }
      catch (error) {
         console.error(error)
         m.reply('❌ ' + error.message)
      }
   }
}
