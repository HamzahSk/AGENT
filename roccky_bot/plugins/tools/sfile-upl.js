import { randomHex } from '#utils'

export default {
   command: 'sfileupl',
   category: 'tools',
   async run(m, {
      sock,
      command,
      text,
      func,
      scrap,
      utils
   }) {
      try {
         const q = m.quoted?.url ? m.quoted : m
         const mimetype = (q.msg || q).mimetype
         if (!mimetype)
            return m.reply('💭 Reply media to upload.')

         m.react('🕒')

         const buffer = await q.download()
         const desc = text || 'ROCCKYREC'

         // Generate nama file dari timestamp dan mimetype
         const ext = mimetype.split('/')[1] || 'bin'
         const filename = q.fileName || `upload_${randomHex().replace('#', '')}.${ext}`

         // Upload ke SfileMobi (via namespace scrap)
         const result = await scrap.SfileMobi.upload(filename, buffer, desc)

         if (result.status === 'success') {
            m.react('✅')
            const print = func.frame('TO URL (Sfile.co)', [result.share_url], '💾')
            m.reply(utils.isURL(result.share_url) ? print : result.share_url)
         } else if (result.chunk_received) {
            m.react('✅')
            m.reply('✅ Upload successful (chunk received)\n⚠️ Please wait for processing...')
         } else {
            m.react('❌')
            let errorMsg = result.message || 'Upload failed'
            if (result.reason === 'duplicate_hash') {
               errorMsg = 'File already exists on your account'
            } else if (result.reason === 'daily_limit_reached') {
               errorMsg = 'Daily upload limit reached'
            }
            m.reply('❌ ' + errorMsg)
         }
      }
      catch (error) {
         console.error(error)
         m.react('❌')
         m.reply('❌ ' + error.message)
      }
   },
   limit: 1
}