const formatCount = value => {
   const count = Number(value)
   return value != null && Number.isFinite(count) && count >= 0
      ? count.toLocaleString('id-ID')
      : '-'
}

const sendActions = async (m, sock, options) => {
   if (typeof sock.sendButton === 'function') {
      try {
         return await sock.sendButton(m.chat, {
            ...options,
            fallbackText: options.text,
            fallback: false
         })
      }
      catch {
         // Satu fallback teks, termasuk jika klien tidak mendukung tombol.
      }
   }
   return m.reply(options.text)
}

export default {
   command: ['tiktok', 'tikwm', 'ttmp3', 'ttvn'],
   hidden: ['tt', 'ttmp4', 'ttwm'],
   category: 'download',
   async run(m, {
      sock,
      isPrefix,
      command,
      args = [],
      func
   }) {
      const prefix = isPrefix || ''
      const exampleUrl = 'https://vt.tiktok.com/ZSUYJLQfg/'
      const usage = `👉🏻 *Contoh*: ${prefix + command} ${exampleUrl}\n\n` +
         `🎬 ${prefix}tiktok <url> — video tanpa watermark\n` +
         `🎞️ ${prefix}tikwm <url> — video dengan watermark\n` +
         `🎵 ${prefix}ttmp3 <url> — audio MP3\n` +
         `🎙️ ${prefix}ttvn <url> — voice note`
      let sourceUrl

      try {
         if (!args[0])
            return m.reply(usage)

         try {
            const url = new URL(args[0].includes('://') ? args[0] : `https://${args[0]}`)
            if (!['http:', 'https:'].includes(url.protocol) ||
               !(url.hostname === 'tiktok.com' || url.hostname.endsWith('.tiktok.com')) ||
               url.username || url.password)
               return m.reply(`❌ Gunakan tautan TikTok yang valid.\n\n${usage}`)
            sourceUrl = url.href
         }
         catch {
            return m.reply(`❌ Gunakan tautan TikTok yang valid.\n\n${usage}`)
         }

         await m.react('🕒')

         const apiUrl = `https://tiktok-downloader-kohl-eight.vercel.app/api/tiktok?url=${encodeURIComponent(sourceUrl)}`
         const response = await fetch(apiUrl, { signal: AbortSignal.timeout(30000) })
         if (!response.ok)
            throw new Error('Layanan TikTok sedang tidak tersedia. Coba lagi sebentar.')
         const data = await response.json()
         if (!data?.ok)
            throw new Error('Gagal mengambil data TikTok. Pastikan unggahan masih tersedia.')

         const isNeedAudio = command === 'ttmp3' || command === 'ttvn'
         const isNeedWatermark = command === 'tikwm' || command === 'ttwm'
         const media = data.media || {}
         const formats = [
            { command: 'ttmp3', label: '🎵 Audio MP3', title: 'Audio MP3', url: media.audio, audio: true },
            { command: 'ttvn', label: '🎙️ Voice Note', title: 'Voice note', url: media.audio, audio: true },
            { command: 'ttmp4', label: '🎬 Tanpa Watermark', title: 'Video tanpa watermark', url: media.video_no_watermark },
            { command: 'tikwm', label: '🎞️ Dengan Watermark', title: 'Video dengan watermark', url: media.video_with_watermark }
         ].filter(format => typeof format.url === 'string' && format.url.length > 0)
         const requestedFormat = isNeedAudio ? command : isNeedWatermark ? 'tikwm' : 'ttmp4'
         const selectedFormat = formats.find(format => format.command === requestedFormat) ||
            (!isNeedAudio && formats.find(format => !format.audio))

         if (!selectedFormat)
            throw new Error(isNeedAudio ? 'Audio untuk tautan ini tidak tersedia.' : 'Video untuk tautan ini tidak tersedia.')

         const duration = Number(data.duration)
         const durationText = data.duration != null && Number.isFinite(duration) && duration >= 0 ? `${duration}s` : '-'
         const author = data.author || {}
         let caption = `🎬 *TIKTOK DOWNLOADER*\n\n`
         caption += `📝 *Title*: ${data.title || 'Tanpa judul'}\n`
         caption += `👤 *Author*: ${author.nickname || author.username || 'Tidak diketahui'}${author.username ? ` (@${author.username})` : ''}\n`
         caption += `⏱️ *Duration*: ${durationText}\n`
         caption += `📥 *Format*: ${selectedFormat.title}\n\n`
         caption += `📊 *Statistics*:\n`
         caption += ` └  👁️ *Views*: ${formatCount(data.stats?.plays)}\n`
         caption += ` └  ❤️ *Likes*: ${formatCount(data.stats?.likes)}\n`
         caption += ` └  💬 *Comments*: ${formatCount(data.stats?.comments)}\n`
         caption += ` └  🔁 *Shares*: ${formatCount(data.stats?.shares)}\n\n`
         caption += `🎵 *Music*: ${data.music?.title || 'Tidak diketahui'}\n`
         caption += `🔗 *Source*: ${sourceUrl}`

         const cleanTitle = String(data.title || 'tiktok_media').replace(/[^a-zA-Z0-9]+/g, '_').slice(0, 80)

         const sizeInBytes = await func.getFileSize(selectedFormat.url)
         const limit = 50 * 1024 * 1024 // 50 MB
         const isOver = Number(sizeInBytes?.bytes) > limit
         if (Number(sizeInBytes?.bytes) > 0 && sizeInBytes.size)
            caption += `\n📦 *Size*: ${sizeInBytes.size}`
         if (isOver)
            caption += '\n\n_Berkas lebih dari 50 MB dikirim sebagai dokumen._'

         // Unduhan langsung dan fallback dokumen tetap dipertahankan.
         const sentMedia = await sock.sendMedia(
            m.chat,
            selectedFormat.url,
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

         await m.react('✅')

         // DOCS_BAILEYS.md: quick_reply tanpa campuran CTA/list agar kompatibel di Web.
         const buttons = formats.filter(format => format !== selectedFormat).map(format => ({
            type: 'reply',
            displayText: format.label,
            id: `${prefix + format.command} ${sourceUrl}`
         }))
         if (buttons.length) {
            // sendMedia tidak menampilkan caption pada audio/voice note biasa.
            const text = (isNeedAudio && !isOver ? `${caption}\n\n` : '') +
               `✅ *${selectedFormat.title} terkirim${isOver ? ' sebagai dokumen' : ''}.*\n\n` +
               'Pilih format lain untuk tautan ini.\nJika tombol tidak muncul, ketik:\n' +
               buttons.map(button => `${button.displayText}: ${button.id}`).join('\n')
            try {
               await sendActions(m, sock, {
                  header: '📥 Format TikTok',
                  text,
                  footer: 'Pilih format yang ingin diunduh',
                  buttons,
                  quoted: sentMedia || m
               })
            }
            catch (error) {
               // Kegagalan menu opsional tidak membatalkan unduhan yang sudah terkirim.
               console.error('[TikTok] Gagal mengirim pilihan format:', error)
            }
         }
      }
      catch (error) {
         console.error(error)
         await m.react('❌')
         const reason = ['TimeoutError', 'AbortError'].includes(error?.name)
            ? 'Layanan TikTok terlalu lama merespons. Coba lagi sebentar.'
            : error?.message || 'Gagal mengunduh TikTok. Coba lagi sebentar.'
         const retryCommand = `${prefix + command} ${sourceUrl}`
         await sendActions(m, sock, {
            text: `❌ ${reason}\n\n🔄 Coba lagi:\n${retryCommand}`,
            buttons: [{ type: 'reply', displayText: '🔄 Coba Lagi', id: retryCommand }],
            quoted: m
         })
      }
   },
   limit: 1
}
