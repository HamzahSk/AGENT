// plugins/tools/interactive-demo.js
// Contoh penggunaan helper pengiriman pesan interaktif (Native Flow).

export default {
   command: 'button',
   hidden: ['interactive', 'demo'],
   category: 'tools',
   async run(m, {
      sock,
      isPrefix,
      command,
      text
   }) {
      const type = text?.toLowerCase() || 'button'

      try {
         // 1) TOMBOL QUICK REPLY + CTA
         if (type === 'button') {
            return sock.sendButton(m.chat, {
               text: '👋 Halo *' + m.pushName + '*!\nPilih aksi di bawah ini:',
               footer: 'Native Flow · Quick Reply',
               header: 'Menu Aksi',
               buttons: [
                  { type: 'reply', displayText: '✅ Ya', id: 'yes' },
                  { type: 'reply', displayText: '❌ Tidak', id: 'no' },
                  { type: 'url', displayText: '🌐 Kunjungi', url: 'https://github.com/itsliaaa/starseed' },
                  { type: 'call', displayText: '📞 Telepon', phoneNumber: '6281234567890' }
               ],
               quoted: m
            })
         }

         // 2) LIST / SINGLE SELECT (SECTIONS)
         if (type === 'list') {
            return sock.sendList(m.chat, {
               title: '📚 Daftar Kategori',
               text: 'Silakan pilih kategori untuk melihat command:',
               buttonText: 'Pilih Kategori',
               footer: 'Native Flow · Single Select',
               sections: [
                  {
                     title: '📥 Download',
                     rows: [
                        { title: 'YouTube', description: 'Download video/audio YouTube', id: isPrefix + 'youtube' },
                        { title: 'TikTok', description: 'Download video TikTok', id: isPrefix + 'tiktok' },
                        { title: 'Instagram', description: 'Download media Instagram', id: isPrefix + 'instagram' }
                     ]
                  },
                  {
                     title: '🤖 AI',
                     rows: [
                        { title: 'Chatbot', description: 'Ngobrol dengan AI', id: isPrefix + 'ai' },
                        { title: 'Generate Gambar', description: 'Buat gambar dari teks', id: isPrefix + 'gpt-image' }
                     ]
                  }
               ],
               quoted: m
            })
         }

         // 3) SECTIONS (alias sock.sendList)
         if (type === 'sections') {
            return sock.sendSections(m.chat, {
               title: '🎮 Game',
               text: 'Pilih game favoritmu:',
               buttonText: 'Pilih Game',
               sections: [
                  {
                     title: 'Games',
                     rows: [
                        { title: 'Tebak Angka', id: isPrefix + 'tebak' },
                        { title: 'Kuis', id: isPrefix + 'kuis' }
                     ]
                  }
               ],
               quoted: m
            })
         }

         // 4) KARTU DENGAN MEDIA
         if (type === 'card') {
            return sock.sendCard(m.chat, {
               text: '✨ Kartu dengan media di header.',
               header: 'Info Bot',
               image: botThumbnail,
               footer: 'Native Flow · Card',
               buttons: [
                  { type: 'reply', displayText: 'Menu', id: isPrefix + 'menu' },
                  { type: 'url', displayText: 'Donasi', url: donateUrl }
               ],
               quoted: m
            })
         }

         // 5) CAROUSEL
         if (type === 'carousel') {
            return sock.sendCarousel(m.chat, {
               text: '🖼️ Carousel menu:',
               cards: [
                  {
                     title: '📥 Download',
                     text: 'YouTube, TikTok, Instagram, dll',
                     image: botThumbnail,
                     buttons: [{ type: 'reply', displayText: 'Pilih', id: isPrefix + 'menu download' }]
                  },
                  {
                     title: '🤖 AI',
                     text: 'Chatbot & image generation',
                     image: botThumbnail,
                     buttons: [{ type: 'reply', displayText: 'Pilih', id: isPrefix + 'menu ai' }]
                  },
                  {
                     title: '⚒️ Tools',
                     text: 'Berbagai utility tools',
                     image: botThumbnail,
                     buttons: [{ type: 'reply', displayText: 'Pilih', id: isPrefix + 'menu tools' }]
                  }
               ],
               quoted: m
            })
         }

         // 6) RAW INTERACTIVE
         if (type === 'raw') {
            return sock.sendInteractiveMessage(m.chat, {
               text: '🔧 Raw interactive message.',
               footer: 'sock.sendInteractiveMessage',
               buttons: [
                  { name: 'quick_reply', buttonParamsJson: { display_text: 'Halo', id: 'halo' } }
               ],
               quoted: m
            })
         }

         return m.reply(
            `👉🏻 *Example*: ${isPrefix + command} [button|list|sections|card|carousel|raw]\n\n` +
            `Contoh: ${isPrefix + command} list`
         )
      }
      catch (error) {
         console.error(error)
         m.reply('❌ ' + error.message)
      }
   }
}