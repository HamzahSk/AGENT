// lib/Function/message.js
// Helper pengiriman pesan interaktif (Native Flow Messages) untuk WhatsApp resmi & WA MD.
//
// LATAR BELAKANG:
//   WhatsApp sudah mematikan (deprecated) metode lama `buttonsMessage` / `templateMessage`
//   (error 405 / pesan tidak tampil di klien resmi). Penggantinya adalah struktur
//   `interactiveMessage` + `nativeFlowMessage` (button `name` + `buttonParamsJson`),
//   dengan pembungkus Binary Node `biz` -> `interactive` -> `native_flow` ketika
//   dikirim lewat `sock.relayMessage`.
//
//   - Private Chat (1:1) : node `biz` + node `bot` (attrs `biz_bot: '1'`)
//   - Group Chat         : node `biz` (tanpa node `bot`)
//   - Fallback otomatis  : jika relay gagal / error, kirim versi teks berformat list.
import { generateWAMessageFromContent, prepareWAMessageMedia, unixTimestampSeconds } from 'baileys'

import { Func } from '#func'

// Node akun bot (dibutuhkan agar native flow dikenali pada obrolan 1:1).
const BOT_NODE = {
   tag: 'bot',
   attrs: {
      biz_bot: '1'
   }
}

// Buang key bernilai null/undefined secara rekursif. Header/body interactive
// message yang mengandung key null/undefined dapat ditolak server WhatsApp
// (HTTP 400 Bad Request) atau memicu error "Invalid media type".
const stripNullish = (value) => {
   if (value === null || value === undefined) return undefined
   if (Array.isArray(value)) {
      const arr = value.map(stripNullish).filter(v => v !== undefined)
      return arr.length ? arr : undefined
   }
   if (typeof value === 'object') {
      const out = {}
      for (const key of Object.keys(value)) {
         const cleaned = stripNullish(value[key])
         if (cleaned !== undefined)
            out[key] = cleaned
      }
      return Object.keys(out).length ? out : undefined
   }
   return value
}

// ==================================================
// BINARY NODE `biz` (pembungkus native_flow)
// ==================================================
const buildBizNode = () => {
   const ts = unixTimestampSeconds(new Date()) - 77980457

   return {
      tag: 'biz',
      attrs: {
         actual_actors: '2',
         host_storage: '2',
         privacy_mode_ts: `${ts}`
      },
      content: [
         {
            tag: 'engagement',
            attrs: {
               customer_service_state: 'open',
               conversation_state: 'open'
            }
         },
         {
            tag: 'interactive',
            attrs: {
               type: 'native_flow',
               v: '1'
            },
            content: [
               {
                  tag: 'native_flow',
                  attrs: {
                     v: '9',
                     name: 'mixed'
                  }
               }
            ]
         }
      ]
   }
}

// Private (1:1) => `biz` + `bot`. Group => `biz` saja.
const buildInteractiveNodes = (jid) => {
   const nodes = [buildBizNode()]

   if (!Func.isJidGroup(jid))
      nodes.push(BOT_NODE)

   return nodes
}

// ==================================================
// KONVERSI BUTTON -> NATIVE FLOW (buttonParamsJson)
// ==================================================
const normalizeButton = (btn) => {
   if (typeof btn === 'string')
      return {
         type: 'reply',
         displayText: btn,
         id: btn
      }

   if (!btn || typeof btn !== 'object')
      return null

   return btn
}

const buttonToNativeFlow = (btn) => {
   btn = normalizeButton(btn)
   if (!btn) return null

   const type = (btn.type || btn.name || '').toLowerCase()
   const label = btn.displayText || btn.text || btn.title || ''

   // Quick Reply
   if (type === 'reply' || type === 'quick_reply')
      return {
         name: 'quick_reply',
         buttonParamsJson: JSON.stringify({
            display_text: label,
            id: btn.id ?? btn.value ?? ''
         })
      }

   // Link CTA
   if (type === 'url' || type === 'cta_url')
      return {
         name: 'cta_url',
         buttonParamsJson: JSON.stringify({
            display_text: label,
            url: btn.url ?? '',
            webview_interaction: btn.webview || false
         })
      }

   // Telepon CTA
   if (type === 'call' || type === 'cta_call')
      return {
         name: 'cta_call',
         buttonParamsJson: JSON.stringify({
            display_text: label,
            id: btn.phoneNumber ?? btn.id ?? ''
         })
      }

   // Single Select / Section List
   if (type === 'list' || type === 'single_select' || type === 'sections')
      return {
         name: 'single_select',
         buttonParamsJson: JSON.stringify({
            title: btn.title || label,
            sections: (btn.sections || []).map(section => ({
               title: section.title || '',
               rows: (section.rows || []).map(row => ({
                  title: row.title || '',
                  description: row.description || '',
                  id: row.id ?? row.title ?? ''
               }))
            }))
         })
      }

   // Raw native flow button (diteruskan apa adanya)
   if (btn.name && btn.buttonParamsJson)
      return {
         name: btn.name,
         buttonParamsJson:
            typeof btn.buttonParamsJson === 'string'
               ? btn.buttonParamsJson
               : JSON.stringify(btn.buttonParamsJson)
      }

   return null
}

// ==================================================
// NORMALISASI QUOTED (m | m.quoted | WAMessage)
// ==================================================
const normalizeQuoted = (quoted) => {
   if (!quoted) return undefined

   if (quoted.key && quoted.message)
      return quoted

   if (quoted.key && quoted.msg)
      return {
         key: quoted.key,
         message: {
            [quoted.type || 'extendedTextMessage']: quoted.msg
         }
      }

   return quoted
}

// ==================================================
// TEKS FALLBACK (saat interactive gagal)
// ==================================================
const toFallbackText = ({ text = '', footer = '', buttons = [] }) => {
   const lines = buttons
      .map((btn, index) => {
         btn = normalizeButton(btn) || {}

         const label = btn.displayText || btn.text || btn.title || ''
         const value = btn.id ?? btn.url ?? btn.phoneNumber ?? ''

         return `  ${index + 1}. ${label}${value ? ` — ${value}` : ''}`
      })
      .filter(Boolean)
      .join('\n')

   return [
      text,
      footer,
      lines
   ]
      .filter(Boolean)
      .join('\n\n')
}

// ==================================================
// RELAY INTI (interactiveMessage + binary nodes)
// ==================================================
const relayInteractive = async (sock, jid, interactiveMessage, {
   quoted = null,
   fallback = true,
   fallbackText = '',
   relayOptions = {}
} = {}) => {
   try {
      const message = generateWAMessageFromContent(jid, { interactiveMessage }, {
         quoted: normalizeQuoted(quoted),
         userJid: sock?.user?.id
      })

      return await sock.relayMessage(jid, message.message, {
         messageId: message.key.id,
         additionalNodes: buildInteractiveNodes(jid),
         ...relayOptions
      })
   }
   catch (error) {
      console.error('❌ relayInteractive error:', error)

      if (!fallback)
         throw error

      return sock.sendText(jid, fallbackText, quoted)
   }
}

const buildNativeFlow = (buttons, messageParams = {}) => {
   const nativeFlowButtons = (buttons || [])
      .map(buttonToNativeFlow)
      .filter(Boolean)

   if (!nativeFlowButtons.length)
      return null

   return {
      buttons: nativeFlowButtons,
      ...(messageParams && Object.keys(messageParams).length
         ? { messageParamsJson: JSON.stringify(messageParams) }
         : {}),
      messageVersion: 1
   }
}

const prepareMedia = async (sock, kind, media, options = {}) => {
   if (!media) return null

   try {
      // URL kosong / bukan string valid -> jangan diteruskan ke
      // prepareWAMessageMedia (menghindari error media tidak valid).
      if (typeof media === 'string' && !media.trim())
         return null

      // Buffer -> langsung; string URL -> bungkus { url }.
      const messageContent = {
         [kind]: typeof media === 'string' ? { url: media.trim() } : media
      }

      // Dokumen (PPT/PDF/dll.) butuh metadata agar header native flow tampil
      // benar: fileName, mimetype, dan jpegThumbnail (tanpa null pointer).
      if (kind === 'document') {
         if (options.fileName)
            messageContent.fileName = options.fileName
         if (options.mimetype)
            messageContent.mimetype = options.mimetype
         if (options.jpegThumbnail)
            messageContent.jpegThumbnail = options.jpegThumbnail
      }

      return await prepareWAMessageMedia(messageContent, {
         upload: sock.waUploadToServer
      })
   }
   catch (error) {
      console.error('❌ prepareMedia error:', error)
      return null
   }
}

// ==================================================
// PUBLIC API
// ==================================================

/**
 * Kirim pesan interaktif Native Flow (quick_reply / cta_url / cta_call / single_select).
 * @param {object} sock - socket Baileys
 * @param {string} jid - tujuan (private atau grup)
 * @param {object} options
 * @returns {Promise<*>}
 */
Func.sendInteractiveMessage = async (sock, jid, options = {}) => {
   const {
      text = '',
      footer = '',
      header = '',
      image,
      video,
      document: documentSource,
      fileName,
      mimetype,
      jpegThumbnail,
      buttons = [],
      contextInfo = {},
      messageParams = {},
      quoted = null,
      fallback = true,
      relayOptions = {}
   } = options

   const fallbackText = toFallbackText({ text, footer, buttons })

   try {
      const media = documentSource
         ? await prepareMedia(sock, 'document', documentSource, { fileName, mimetype, jpegThumbnail })
         : image
            ? await prepareMedia(sock, 'image', image)
            : video
               ? await prepareMedia(sock, 'video', video)
               : null

      const interactiveMessage = {
         body: { text: String(text) },
         ...(footer ? { footer: { text: String(footer) } } : {}),
         header: {
            title: String(header || ''),
            hasMediaAttachment: !!media,
            ...(media || {})
         },
         contextInfo: contextInfo || {}
      }

      const nativeFlowMessage = buildNativeFlow(buttons, messageParams)

      if (!nativeFlowMessage)
         return sock.sendText(jid, text, quoted, { footer })

      interactiveMessage.nativeFlowMessage = nativeFlowMessage

      return relayInteractive(sock, jid, stripNullish(interactiveMessage), {
         quoted,
         fallback,
         fallbackText,
         relayOptions
      })
   }
    catch (error) {
      console.error('❌ sendInteractiveMessage error:', error)

      if (!fallback)
         throw error

      return sock.sendText(jid, fallbackText, quoted)
   }
}

/**
 * Tombol Quick Reply (dan CTA) berbasis Native Flow.
 * @param {object} sock
 * @param {string} jid
 * @param {object|string} options - objek opsi ATAU teks (posisi) untuk
 *    kompatibilitas pemanggilan lama: sock.sendButton(jid, text, buttons, quoted)
 */
Func.sendButton = async (sock, jid, options = {}, positionalButtons, positionalQuoted) => {
   if (typeof options === 'string' || Array.isArray(options))
      options = {
         text: typeof options === 'string' ? options : String(options),
         buttons: positionalButtons,
         quoted: positionalQuoted
      }

   const { text, footer, header, image, video, buttons = [], ...rest } = options

   return Func.sendInteractiveMessage(sock, jid, {
      text,
      footer,
      header,
      image,
      video,
      buttons,
      ...rest
   })
}

/**
 * Daftar pilihan (Single Select / Section List) berbasis Native Flow.
 * @param {object} sock
 * @param {string} jid
 * @param {object|string} options - objek opsi ATAU teks (posisi) untuk
 *    kompatibilitas pemanggilan lama: sock.sendList(jid, text, sections, quoted)
 */
Func.sendList = async (sock, jid, options = {}, positionalSections, positionalQuoted) => {
   if (typeof options === 'string')
      options = {
         text: options,
         sections: positionalSections,
         quoted: positionalQuoted
      }

   const {
      title = 'Pilih Opsi',
      buttonText = 'Pilih',
      footer = '',
      text = '',
      image,
      video,
      sections = [],
      ...rest
   } = options

   return Func.sendInteractiveMessage(sock, jid, {
      text: text || title,
      footer,
      image,
      video,
      buttons: [{
         type: 'list',
         title,
         displayText: buttonText,
         sections
      }],
      ...rest
   })
}

/**
 * Alias dari sendList.
 */
Func.sendSections = async (sock, jid, options = {}) =>
   Func.sendList(sock, jid, options)

/**
 * Kirim kartu interaktif (opsional dengan media image/video di header).
 * @param {object} sock
 * @param {string} jid
 * @param {object} options
 */
Func.sendCard = async (sock, jid, options = {}) => {
   const {
      text = '',
      footer = '',
      header = '',
      image,
      video,
      document: documentSource,
      fileName,
      mimetype,
      jpegThumbnail,
      buttons = [],
      contextInfo = {},
      messageParams = {},
      quoted = null,
      fallback = true,
      relayOptions = {}
   } = options

   const fallbackText = toFallbackText({ text, footer, buttons })

   try {
      const interactiveMessage = {
         body: { text: String(text) },
         ...(footer ? { footer: { text: String(footer) } } : {}),
         contextInfo: contextInfo || {},
         header: {
            title: String(header || ''),
            hasMediaAttachment: false
         }
      }

      const media = documentSource
         ? await prepareMedia(sock, 'document', documentSource, { fileName, mimetype, jpegThumbnail })
         : image
            ? await prepareMedia(sock, 'image', image)
            : video
               ? await prepareMedia(sock, 'video', video)
               : null

      if (media) {
         interactiveMessage.header = {
            title: String(header || ''),
            hasMediaAttachment: true,
            ...media
         }
      }

      const nativeFlowMessage = buildNativeFlow(buttons, messageParams)
      if (nativeFlowMessage)
         interactiveMessage.nativeFlowMessage = nativeFlowMessage

      return relayInteractive(sock, jid, stripNullish(interactiveMessage), {
         quoted,
         fallback,
         fallbackText,
         relayOptions
      })
   }
    catch (error) {
      console.error('❌ sendCard error:', error)

      if (!fallback)
         throw error

      return sock.sendText(jid, fallbackText, quoted)
   }
}

/**
 * Kartu berantai (Carousel) berbasis interactiveMessage.
 * @param {object} sock
 * @param {string} jid
 * @param {object} options - cards: [{ title, text, footer, image, video, buttons }]
 */
Func.sendCarousel = async (sock, jid, options = {}) => {
   const {
      text = '',
      footer = '',
      cards = [],
      contextInfo = {},
      quoted = null,
      fallback = true,
      relayOptions = {}
   } = options

   if (!cards.length)
      throw new Error('sendCarousel membutuhkan minimal 1 kartu')

   const processedCards = []

   for (const card of cards) {
      const cardImage = card.image
      const cardVideo = card.video
      const media = cardImage
         ? await prepareMedia(sock, 'image', cardImage)
         : cardVideo
            ? await prepareMedia(sock, 'video', cardVideo)
            : null

      const cardMessage = {
         body: { text: String(card.text || '') },
         ...(card.footer ? { footer: { text: String(card.footer) } } : {}),
         header: {
            title: String(card.title || ''),
            hasMediaAttachment: !!media,
            ...(media || {})
         }
      }

      const nativeFlowMessage = buildNativeFlow(card.buttons || [], card.messageParams || {})
      if (nativeFlowMessage)
         cardMessage.nativeFlowMessage = nativeFlowMessage

      processedCards.push(cardMessage)
   }

   const interactiveMessage = {
      body: { text: String(text) },
      ...(footer ? { footer: { text: String(footer) } } : {}),
      header: {
         title: '',
         hasMediaAttachment: false
      },
      contextInfo: contextInfo || {},
      carouselMessage: {
         cards: processedCards,
         messageVersion: 1,
         carouselCardType: 1
      }
   }

   const fallbackText = [
      text,
      footer,
      ...cards.map((card, index) =>
         `  ${index + 1}. ${card.title || ''}${card.text ? ` — ${card.text}` : ''}`
      )
   ]
      .filter(Boolean)
      .join('\n\n')

   return relayInteractive(sock, jid, stripNullish(interactiveMessage), {
      quoted,
      fallback,
      fallbackText,
      relayOptions
   })
}