
export default {
   command: ['aio', 'alldl'],
   hidden: ['anydl'],
   category: 'download',
   async run(m, { sock, isPrefix, command, args, func, scrap }) {
      try {
         // 1. Cari URL dan ekstrak argumen custom
         const targetUrl = args.find(v => v.match(/^https?:\/\//))
         if (!targetUrl) {
             return m.reply(`👉🏻 *Example*: ${isPrefix + command} https://tiktok.com/xxx\n👉🏻 *Custom Format*: ${isPrefix + command} https://tiktok.com/xxx -t mp3`)
         }

         m.react('🕒')

         // Cari flag -t untuk format
         const typeIndex = args.indexOf('-t')
         const customType = typeIndex !== -1 && args[typeIndex + 1] ? args[typeIndex + 1].toLowerCase() : null

         // 2. Ambil info media langsung menggunakan modul scraper internal (Ganti Step 1 API)
         const json = await scrap.socialDl(targetUrl);

         if (!json?.success || !json?.result?.medias?.length) {
             return m.reply('❌ Gagal mendapatkan metadata atau media tidak ditemukan.')
         }

         const medias = json.result.medias
         let selectedMedia = null

         // 3. Filter media sesuai request atau default (Video HD > Audio > Gambar)
         if (customType) {
            selectedMedia = medias.find(media => 
               media.extension?.toLowerCase() === customType ||
               (customType === 'mp3' && media.quality?.toLowerCase().includes('audio')) ||
               (customType === 'mp4' && !media.quality?.toLowerCase().includes('audio'))
            )
            if (!selectedMedia) return m.reply(`❌ Format ${customType} tidak tersedia untuk link ini.`)
         } else {
            // Memisahkan video dan audio berdasarkan penanda teks atau ekstensi
            const videos = medias.filter(media => !media.quality?.toLowerCase().includes('audio'))
            const audios = medias.filter(media => media.quality?.toLowerCase().includes('audio'))
            
            if (videos.length > 0) {
               // Prioritaskan HD, jika tidak ada ambil video pertama
               selectedMedia = videos.find(media => media.quality?.toLowerCase().includes('hd')) || videos[0]
            } else if (audios.length > 0) {
               selectedMedia = audios[0]
            } else {
               selectedMedia = medias[0] // Fallback
            }
         }

         // 4. Resolve URL menggunakan fungsi internal jika memerlukan rendering (Ganti Step 2 API)
         let downloadUrl = selectedMedia.url
         if (selectedMedia.requires_rendering || downloadUrl.startsWith('savenow:')) {
            const resolveJson = await scrap.resolveSaveNow(targetUrl, selectedMedia.url);
            
            if (!resolveJson?.success || !resolveJson?.downloadUrl) {
                return m.reply('❌ Gagal meresolve link download via SaveNow.')
            }
            downloadUrl = resolveJson.downloadUrl
         }

         // 5. Setup data untuk dikirim
         const title = json.result.title || 'Media Downloader'
         const cleanTitle = title.replace(/[\/\\?%*:|"<>]/g, '').trim()
         const ext = selectedMedia.extension?.toLowerCase() || 'mp4'

         const isAudio = ext === 'mp3' || ext === 'm4a' || ext === 'opus' || selectedMedia.quality?.toLowerCase().includes('audio')
         const isVideo = ext === 'mp4' || !isAudio
         
         let mimetype = 'application/octet-stream'
         if (isAudio) mimetype = 'audio/mpeg'
         else if (isVideo) mimetype = 'video/mp4'
         else if (['jpg', 'jpeg', 'png', 'webp'].includes(ext)) mimetype = `image/${ext === 'jpg' ? 'jpeg' : ext}`

         // Cek ukuran file
         const sizeInBytes = await func.getFileSize(downloadUrl)
         const limit = 50 * 1024 * 1024 // 50 MB
         const sizeText = sizeInBytes && sizeInBytes.bytes 
            ? (sizeInBytes.bytes / (1024 * 1024)).toFixed(2) + ' MB' 
            : (selectedMedia.size_formatted || 'Unknown Size')
            
         const isOver = sizeInBytes && sizeInBytes.bytes ? sizeInBytes.bytes > limit : false

         let caption = `*Title*: ${cleanTitle}\n*Source*: ${json.result.source.toUpperCase()}\n*Quality*: ${selectedMedia.quality || 'Unknown'}\n*Size*: ${sizeText}`
         if (isOver) caption += `\n\n_File besar detected, mengirim via dokumen..._`

         // 6. Kirim via sendMedia
         let sendOptions = {
            fileName: `${cleanTitle}.${ext}`,
            mimetype: mimetype,
            toStream: true,
            document: isOver
         }

         if (!isOver) {
             if (isAudio) sendOptions.audio = true
             else if (isVideo) sendOptions.type = 'video'
         }

         await sock.sendMedia(
            m.chat,
            downloadUrl,
            caption,
            m,
            sendOptions
         )

      } catch (error) {
         console.error(error)
         m.reply('❌ Error: ' + error.message)
      }
   },
   limit: 1
}
