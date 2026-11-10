const EPHEMERAL_MAP = {
   off: 0,
   '1d': 86400,
   '7d': 604800,
   '90d': 7776000
}

export default {
   command: 'ephemeral',
   hidden: 'disappearing',
   category: 'group',
   async run(m, {
      sock,
      isPrefix,
      args
   }) {
      try {
         const [option] = args
         if (!option || !(option in EPHEMERAL_MAP))
            return m.reply(`👉🏻 *Example*: ${isPrefix + command} 7d\n*Option*: off | 1d | 7d | 90d`)
         const seconds = EPHEMERAL_MAP[option]
         await sock.groupToggleEphemeral(m.chat, seconds)
         m.reply(seconds === 0 ?
            '✅ Successfully turned off disappearing messages.' :
            `✅ Successfully set disappearing messages to *${option}*.`)
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