export default {
   command: 'addmode',
   hidden: 'addmember',
   category: 'group',
   async run(m, {
      sock,
      isPrefix,
      args
   }) {
      try {
         const [option] = args
         if (!option || !['all', 'admin'].includes(option))
            return m.reply(`👉🏻 *Example*: ${isPrefix + command} all\n*Option*: all | admin`)
         const mode = option === 'all' ? 'all_member_add' : 'admin_add'
         await sock.groupMemberAddMode(m.chat, mode)
         m.reply(`✅ Successfully set add member mode to *${option === 'all' ? 'all members' : 'admins only'}*.`)
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