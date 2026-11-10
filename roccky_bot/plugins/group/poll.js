export default {
   command: 'poll',
   hidden: 'buatpoll',
   category: 'group',
   async run(m, {
      sock,
      isPrefix,
      text
   }) {
      try {
         const [question, ...options] = text
            .split('|')
            .map(x => x.trim())
         if (!question || options.length < 2)
            return m.reply(`👉🏻 *Example*: ${isPrefix + command} Menu favorit?|Mie Ayam|Nasi Goreng|Bakso`)
         if (options.length > 10)
            return m.reply('❌ Maximum 10 options.')
         if (question.length > 150)
            return m.reply('❌ Question is too long, maximum 150 characters.')
         await sock.sendMessage(m.chat, {
            poll: {
               name: question,
               values: options,
               selectableCount: 1,
               toAnnouncementGroup: false
            }
         })
      }
      catch (error) {
         console.error(error)
         m.reply('❌ ' + error.message)
      }
   },
   group: true,
   limit: 1
}