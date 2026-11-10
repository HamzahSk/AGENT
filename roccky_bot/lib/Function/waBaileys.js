/// lib/functions/wa.js
import { Func } from '#func'
import { Boom } from '@hapi/boom'

// Default disappearing message WhatsApp (7 hari)
Func.WA_DEFAULT_EPHEMERAL = 7 * 24 * 60 * 60

// Delay / sleep
Func.delay = (ms = 0) =>
   new Promise(resolve => setTimeout(resolve, Number(ms)))

// Normalize jid
Func.jidNormalizedUser = (jid = '') => {
   return jid
      ?.replace(/:\d+@/gi, '@')
      ?.trim()
}

// PN User
Func.isPnUser = (jid = '') => {
   jid = Func.jidNormalizedUser(jid)

   return (
      jid.endsWith('@s.whatsapp.net') &&
      /^\d+@s\.whatsapp\.net$/i.test(jid)
   )
}

// Hosted PN User
Func.isHostedPnUser = (jid = '') => {
   jid = Func.jidNormalizedUser(jid)

   return (
      jid.includes('@hosted') &&
      jid.includes('.s.whatsapp.net')
   )
}

// LID User
Func.isLidUser = (jid = '') => {
   jid = Func.jidNormalizedUser(jid)

   return jid.endsWith('@lid')
}

// Hosted LID User
Func.isHostedLidUser = (jid = '') => {
   jid = Func.jidNormalizedUser(jid)

   return (
      jid.includes('@hosted') &&
      jid.endsWith('@lid')
   )
}