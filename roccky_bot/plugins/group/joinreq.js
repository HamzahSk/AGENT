import { frame } from '../../lib/Utilities.js'

export default {
   command: ['joinreq', 'accjoin', 'rejjoin'],
   hidden: ['pendingjoin', 'approvejoin', 'rejectjoin'],
   category: 'group',
   async run(m, {
      sock,
      isPrefix,
      command,
      args
   }) {
      try {
         if (command === 'joinreq') {
            const requests = await sock.groupRequestParticipantsList(m.chat)
            if (!requests?.length)
               return m.reply('❌ No pending join requests.')
            const printRequests = requests.flatMap((request, index, array) => {
               const lines = [
                  `${index + 1}. @${request.jid.split('@')[0]}`,
                  `*JID*: ${request.jid}`
               ]
               if (index !== array.length - 1)
                  lines.push('')
               return lines
            })
            const printHowTo = frame('HOW TO', [
               `*Approve*: ${isPrefix}accjoin 1`,
               `*Reject*: ${isPrefix}rejjoin 1`
            ], '📄')
            return m.reply(printHowTo + '\n\n' +
               frame('JOIN REQUESTS', printRequests, '📩'))
         }
         const [number] = args
         if (!number)
            return m.reply(`👉🏻 *Example*: ${isPrefix + command} 1`)
         const requests = await sock.groupRequestParticipantsList(m.chat)
         const target = requests[Number(number) - 1]
         if (!target)
            return m.reply('❌ Request not found.')
         const action = command === 'accjoin' ? 'approve' : 'reject'
         await sock.groupRequestParticipantsUpdate(m.chat, [target.jid], action)
         m.reply(`✅ Successfully ${action}d @${target.jid.split('@')[0]}.`)
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