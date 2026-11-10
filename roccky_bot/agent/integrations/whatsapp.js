export function createWhatsAppHandler(agent) {
   if (!agent?.handleMessage) throw new TypeError('A configured OwnerAgent instance is required.')

   return async function handleWhatsAppMessage(m, context = {}) {
      const key = m?.key || {}
      let resolvedPn = key.senderPn || key.participantPn || key.remoteJidAlt || key.participantAlt || m?.senderPn

      if (!resolvedPn && (m?.sender?.endsWith('@lid') || m?.senderLid?.endsWith('@lid'))) {
         try {
            const resolved = await context.sock?.findUserId?.(m.senderLid || m.sender)
            resolvedPn = resolved?.phoneNumber
         }
         catch {
            // Mapping may be unavailable for a fresh LID. The exact owner and
            // verified fromMe checks below remain the authorization boundary.
         }
      }

      const result = await agent.handleMessage({
         text: context.body ?? m?.body ?? '',
         sender: m?.sender,
         senderJid: m?.sender,
         senderPn: resolvedPn,
         resolvedPn,
         senderLid: m?.senderLid,
         participant: key.participant,
         fromMe: m?.fromMe === true,
         botJid: context.sock?.user?.decodedId || context.sock?.user?.id,
         botLid: context.sock?.user?.decodedLid || context.sock?.user?.lid,
         botNumber: globalThis.botNumber,
         isOwner: context.isOwner === true,
         chatId: m?.chat,
         messageId: m?.id,
         runtime: {
            sock: context.sock,
            db: context.db,
            store: context.store,
            setting: context.setting
         }
      })
      return result
   }
}

