/// lib/functions/jid.js
import { Func } from '#func'

Func.isJidGroup = (jid) =>
   typeof jid === 'string' &&
   jid.endsWith('@g.us')

Func.isJidBroadcast = (jid) =>
   typeof jid === 'string' &&
   jid.endsWith('@broadcast')

Func.isJidNewsletter = (jid) =>
   typeof jid === 'string' &&
   jid.endsWith('@newsletter')

Func.isJidUser = (jid) =>
   typeof jid === 'string' &&
   jid.endsWith('@s.whatsapp.net')

Func.isJidBot = (jid) =>
   typeof jid === 'string' &&
   jid.endsWith('@bot')

Func.isJidStatus = (jid) =>
   jid === 'status@broadcast'

Func.decodeJid = (jid) => {
   if (!jid || typeof jid !== 'string')
      return jid

   // 628xxx:12@s.whatsapp.net
   if (jid.includes(':')) {
      const [user] = jid.split(':')
      const server = jid.split('@')[1]

      return `${user}@${server}`
   }

   return jid
}

Func.areJidsSameUser = (jid1, jid2) => {
   if (!jid1 || !jid2)
      return false

   return Func.decodeJid(jid1) === Func.decodeJid(jid2)
}