export default {
   command: 'buatgc',
   hidden: 'creategc',
   category: 'owner',
   async run(m, {
      sock,
      isPrefix,
      text
   }) {
      try {
         const [title, ...rest] = text
            .split('|')
            .map(x => x.trim())
         if (!title || !rest.length)
            return m.reply(`👉🏻 *Example*: ${isPrefix + command} Grup Test|6281234567890|6289876543210`)
         const participants = rest.map(number =>
            number.replace(/\D/g, '') + '@s.whatsapp.net'
         )
         m.react('🕒')
         const group = await sock.groupCreate(title, participants)
         await m.reply(`✅ Successfully created group *${title}*.`)
         sock.sendText(group.id, `👋 Halo! Grup ini dibuat oleh *${botName}*.`)
      }
      catch (error) {
         console.error(error)
         m.reply('❌ ' + error.message)
      }
   },
   owner: true
}