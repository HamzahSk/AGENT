export default {
   command: 'play',
   category: 'explore',
   async run(m, {
      sock,
      isPrefix,
      command,
      text,
      func,
      scrap
   }) {
      try {
         if (!text)
            return m.reply(`👉🏻 *Example*: ${isPrefix + command} you say run\n👉🏻 *Random*: ${isPrefix + command} -r you say run`)

         // Cek apakah ada flag -r untuk random
         const isRandom = text.toLowerCase().includes('-r')
         // Hapus flag -r dari teks pencarian agar tidak masuk ke query API
         const query = text.replace(/-r/gi, '').trim()

         if (!query) return m.reply(`❌ Masukkan judul lagu yang ingin dicari.`)

         m.react('🕒')

         // SEARCH API PERTAMA (Tanpa Filter Link)
         let searchUrl = `https://youtube-search-rocky.vercel.app/api/search?q=${encodeURIComponent(query)}&limit=20`
         let search = await fetch(searchUrl)
         let result = await search.json()

         if (!result.success || !result.results?.length)
            return m.reply('❌ Failed to get search result.')

         // FILTER VALID VIDEO
         let validItems = result.results.filter(v => v?.url)

         if (!validItems.length)
            return m.reply('❌ No valid result found.')

         let selectedVideo;

         if (isRandom) {
            // JIKA ADA -r, AMBIL RANDOM
            selectedVideo = validItems[Math.floor(Math.random() * validItems.length)]
         } else {
            // JIKA TIDAK ADA -r, AMBIL TERATAS
            selectedVideo = validItems[0]

            // Cek jika durasi lebih dari 12 menit (720 detik)
            if (selectedVideo.durationSeconds > 720) {
               // Ambil ulang menggunakan filter dari API
               searchUrl = `https://youtube-search-rocky.vercel.app/api/search?q=${encodeURIComponent(query)}&filter=durasi(3,10)&limit=20`
               search = await fetch(searchUrl)
               result = await search.json()

               if (result.success && result.results?.length) {
                  const filteredItems = result.results.filter(v => v?.url)
                  if (filteredItems.length) {
                     // Ambil yang teratas dari hasil yang sudah difilter
                     selectedVideo = filteredItems[0] 
                  }
               }
            }
         }
            
         // Print Caption
         const printCaption = func.frame('YOUTUBE PLAY', [
            `*Title*: ${selectedVideo.title}`,
            `*Views*: ${func.formatNumber(selectedVideo.views || 0)}`,
            `*Duration*: ${selectedVideo.duration || '0:00'}`,
            `*Uploaded*: ${selectedVideo.uploadedAt || 'Unknown'}`,
            `*Channel*: ${selectedVideo.author?.name || 'Unknown'}`,
            `*Source*: ${selectedVideo.url}`
         ], '🎵')

         await sock.sendMessage(m.chat, {
            text: printCaption,
            contextInfo: {
               externalAdReply: {
                  title: selectedVideo.title,
                  body: selectedVideo.author?.name || 'YouTube Audio',
                  thumbnailUrl: selectedVideo.thumbnail,
                  sourceUrl: selectedVideo.url,
                  mediaType: 1,
                  renderLargerThumbnail: true
               }
            }
         }, {
            quoted: m
         })
         
         // --- PERUBAHAN: MENGGUNAKAN SCRAPER Scrap.vidSave ---
         const dlResult = await scrap.vidSave(selectedVideo.url, '128KBPS')

         if (!dlResult || !dlResult.success || !dlResult.data?.download?.download_url) {
            return m.reply(`❌ Gagal mengunduh audio: ${dlResult?.message || 'Unknown Error'}`)
         }

         const mediaData = dlResult.data
         const fileUrl = mediaData.download.download_url
         const sizeInBytes = mediaData.selected_resource.size || 0

         // Cek batasan ukuran file (50 MB) jika seandainya audionya terlalu besar
         const limit = 50 * 1024 * 1024 
         const isOver = sizeInBytes > limit

         // Membersihkan karakter ilegal untuk nama file penyiapan berkas
         const cleanTitle = mediaData.metadata.title.replace(/[\/\\?%*:|"<>]/g, '').trim()

         // Mengirim audio menggunakan sendMedia (bisa handle tipe dokumen jika over-limit)
         await sock.sendMedia(
            m.chat,
            fileUrl,
            isOver ? `_File audio besar terdeteksi (${mediaData.selected_resource.size_formatted}), mengirim via dokumen..._` : '',
            m,
            {
               fileName: `${cleanTitle}.mp3`,
               mimetype: 'audio/mpeg',
               toStream: true,
               document: isOver, 
               ...(isOver ? {} : { audio: true })
            }
         )
         // ----------------------------------------------------

      }
      catch (error) {
         console.error(error)
         m.reply('❌ ' + error.message)
      }
   },
   limit: 1
}
