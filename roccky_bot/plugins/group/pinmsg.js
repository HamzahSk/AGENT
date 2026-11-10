export default {
   command: 'pinmsg',
   category: 'group',
   async run(m, {
      sock,
      isPrefix,
      args
   }) {
      try {
         const q = m.quoted
         if (!q?.key?.id)
            return m.reply(`💭 Reply a message to pin/unpin it.\n*Example*: ${isPrefix + command} off`)
         const isRemove = args[0] === 'off'
         const time = isRemove ? null : 86400
         await sock.sendMessage(m.chat, {
            pin: {
               type: isRemove ? 0 : 1,
               time,
               key: q.key
            }
         })
         m.reply(isRemove ?
            '✅ Successfully unpinned the message.' :
            '✅ Successfully pinned the message for 24 hours.')
      }
      catch (error) {
         console.error(error)
         m.reply('❌ ' + error.message)
      }
   },
   group: true,
   admin: true,
   botAdmin: true
}