
export default {
   command: ['ytmp3', 'ytmp4'],
   hidden: ['yta', 'ytv'],
   category: 'download',
   async run(m, { sock, isPrefix, command, args, func, scrap }) {
      try {
         if (!args[0]) return m.reply(`👉🏻 *Example*: ${isPrefix + command} https://youtube.com/watch?v=xxxx`)
         if (!func.isURL(args[0])) return m.reply('❌ Invalid URL.')

         m.react('🕒')

         const isAudio = ['ytmp3', 'yta'].includes(command)
         // Menentukan target kualitas berdasarkan tipe media
         const quality = isAudio ? '128KBPS' : '360P'

         // 1. Eksekusi Scraper dari vidsave.js
         const result = await scrap.vidSave(args[0], quality)

         if (!result || !result.success || !result.data?.download?.download_url) {
            return m.reply(`❌ Failed to get media: ${result?.message || 'Unknown Error'}`)
         }

         const mediaData = result.data
         const fileUrl = mediaData.download.download_url
         const sizeInBytes = mediaData.selected_resource.size || 0

         // 2. Cek batasan ukuran file (50 MB)
         const limit = 50 * 1024 * 1024 
         const isOver = sizeInBytes > limit

         // 3. Susun Caption Informasi Video
         let caption = `*Title*: ${mediaData.metadata.title}\n`
         caption += `*Duration*: ${mediaData.metadata.duration_formatted}\n`
         caption += `*Quality*: ${mediaData.selected_resource.quality}\n`
         caption += `*Size*: ${mediaData.selected_resource.size_formatted}`
         
         if (isOver) caption += `\n\n_File besar terdeteksi, mengirim via dokumen..._`
         
         // Membersihkan karakter ilegal untuk nama file penyiapan berkas
         const cleanTitle = mediaData.metadata.title.replace(/[\/\\?%*:|"<>]/g, '').trim()

         // 4. Kirim media menggunakan sendMedia
         await sock.sendMedia(
            m.chat,
            fileUrl,
            caption,
            m,
            {
               fileName: `${cleanTitle}.${isAudio ? 'mp3' : 'mp4'}`,
               mimetype: isAudio ? 'audio/mpeg' : 'video/mp4',
               toStream: true,
               document: isOver, 
               ...(isOver ? {} : (isAudio ? { audio: true } : { type: 'video' }))
            }
         )

      } catch (error) {
         console.error(error)
         m.reply('❌ Error: ' + error.message)
      }
   },
   limit: 1
}
