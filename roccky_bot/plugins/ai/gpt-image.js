export default {
   command: ['aiimg', 'openaiimg'],
   category: 'ai',
   async run(m, {
      sock,
      isPrefix,
      command,
      text,
      scrap
   }) {
      try {
         if (!text) {
            return m.reply(`👉🏻 *Example:*\n- Generate: ${isPrefix + command} cat eating banana\n- Edit: Balas/reply gambar dengan caption "${isPrefix + command} jadikan background taman"`)
         }

         m.react('🕒')

         const quoted = m.quoted || m
         const mime = (quoted.msg || quoted).mimetype || ''

         let imageUrl = ''

         // 🔥 1. CEK MODE EDIT (Kalau user me-reply/mengirim gambar)
         if (/image/.test(mime)) {
            // Download gambar yang di-reply menjadi Buffer
            const media = await quoted.download() 
            
            // Karena Scrap sudah support Buffer, langsung masukkan 'media' ke argumen pertama
            const result = await scrap.processEzCreateJob(media, text)
            
            // Cek apakah hasilnya valid
            if (!result || !result[0]) throw new Error("Gagal mengedit gambar.")
            
            // Ambil URL dari array index ke-0
            imageUrl = result[0]
         } 
         // 🔥 2. MODE GENERATE (Hanya teks)
         else {
            const prompt = encodeURIComponent(text)
            // Menggunakan API gratis Pollinations untuk generate
            imageUrl = `https://image.pollinations.ai/prompt/${prompt}?width=1024&height=1024&nologo=true`
         }

         // 🔥 3. AMBIL HASIL GAMBAR DARI URL JADI BUFFER
         const response = await fetch(imageUrl)
         if (!response.ok) throw new Error("Gagal mengunduh gambar hasil dari server.")
         
         const arrayBuffer = await response.arrayBuffer()
         const finalBuffer = Buffer.from(arrayBuffer)

         // ✅ 4. KIRIM GAMBAR KE WHATSAPP
         const caption = `✅ *Prompt:* ${text}`
         await sock.sendMedia(m.chat, finalBuffer, caption, m)

         m.react('✅')

      } catch (error) {
         console.error(error)
         m.react('❌')
         m.reply('❌ ' + error.message)
      }
   },
   limit: 1
}
