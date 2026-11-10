
export default {
   command: ['tiktok', 'tikwm', 'ttmp3', 'ttvn'],
   hidden: ['tt', 'ttmp4', 'ttwm'],
   category: 'download',
   async run(m, {
      sock,
      isPrefix,
      command,
      args, 
      func
   }) {
      try {
         if (!args[0])
            return m.reply(`👉🏻 *Example*: ${isPrefix + command} https://vt.tiktok.com/ZSUYJLQfg/`)
         if (!args[0].includes('tiktok.com'))
            return m.reply('❌ Invalid URL.')

         m.react('🕒')

         // Mengambil data dari API baru
         const apiUrl = `https://tiktok-downloader-kohl-eight.vercel.app/api/tiktok?url=${encodeURIComponent(args[0])}`
         const response = await fetch(apiUrl)
         const res = await response.json()

         if (!res.ok) throw new Error('Gagal mengambil data dari API.')

         const data = res
         const isNeedAudio = command === 'ttmp3' || command === 'ttvn'
         
         // Membuat Caption Statistik yang Lengkap
         let caption = `🎬 *TIKTOK DOWNLOADER*\n\n`
         caption += `📝 *Title*: ${data.title || 'No Title'}\n`
         caption += `👤 *Author*: ${data.author.nickname} (@${data.author.username})\n`
         caption += `⏱️ *Duration*: ${data.duration}s\n\n`
         caption += `📊 *Statistics*:\n`
         caption += ` └  👁️ *Views*: ${data.stats.plays.toLocaleString()}\n`
         caption += ` └  ❤️ *Likes*: ${data.stats.likes.toLocaleString()}\n`
         caption += ` └  💬 *Comments*: ${data.stats.comments.toLocaleString()}\n`
         caption += ` └  🔁 *Shares*: ${data.stats.shares.toLocaleString()}\n\n`
         caption += `🎵 *Music*: ${data.music.title}\n`
         caption += `🔗 *Source*: ${args[0]}`

         // Menentukan URL media yang akan dikirim
         let mediaUrl = ''
         if (isNeedAudio) {
            mediaUrl = data.media.audio
         } else {
            // Default ke video tanpa watermark (HD jika ada)
            mediaUrl = data.media.video_no_watermark || data.media.video_with_watermark
         }

         // Membersihkan judul video agar aman digunakan sebagai nama file
         const cleanTitle = data.title ? data.title.replace(/[^a-zA-Z0-9]/g, '_') : 'tiktok_media'

         // Cek ukuran file media
         const sizeInBytes = await func.getFileSize(mediaUrl)
         const limit = 50 * 1024 * 1024 // 50 MB
         const isOver = sizeInBytes.bytes > limit

         // Kirim Media (Otomatis menjadi dokumen jika melebih batas ukuran)
         await sock.sendMedia(
            m.chat,
            mediaUrl,
            caption,
            m,
            {
               fileName: `${cleanTitle}.${isNeedAudio ? 'mp3' : 'mp4'}`,
               mimetype: isNeedAudio ? 'audio/mpeg' : 'video/mp4',
               toStream: true,
               document: isOver, 
               ...(isOver ? {} : (isNeedAudio ? { audio: true, ptt: command === 'ttvn' } : { type: 'video' }))
            }
         )

         m.react('✅')
      }
      catch (error) {
         console.error(error)
         m.react('❌')
         m.reply('❌ Error: ' + error.message)
      }
   },
   limit: 1
}
