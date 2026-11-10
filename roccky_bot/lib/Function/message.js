// Native-flow payloads follow DOCS_BAILEYS.md. The installed fork adds its own
// protocol nodes in relayMessage; do not duplicate outdated biz/bot nodes here.
import { generateWAMessageFromContent, prepareWAMessageMedia } from 'baileys'
import { Func } from '#func'
import { reportError, positiveInt } from '../Runtime.js'
import { fetchBuffer } from '../Http.js'

export const stripNullish = value => {
   if (value == null) return undefined
   // Media keys/hashes are protobuf bytes, not dictionaries of numeric keys.
   if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) return value
   if (Array.isArray(value)) return value.map(stripNullish).filter(value => value !== undefined)
   if (typeof value !== 'object') return value
   return Object.fromEntries(Object.entries(value).map(([key, value]) => [key, stripNullish(value)]).filter(([, value]) => value !== undefined))
}
export const buttonToNativeFlow = button => {
   const btn = typeof button === 'string' ? { type: 'reply', displayText: button, id: button } : button
   if (!btn || typeof btn !== 'object') throw new TypeError('Invalid interactive button')
   // Preserve raw native-flow parameters before considering friendly aliases.
   if (btn.name && btn.buttonParamsJson !== undefined) {
      const params = typeof btn.buttonParamsJson === 'string' ? JSON.parse(btn.buttonParamsJson) : btn.buttonParamsJson
      return { name: btn.name, buttonParamsJson: JSON.stringify(params) }
   }
   const label = String(btn.displayText || btn.text || btn.title || '')
   const type = (btn.type || btn.name || '').toLowerCase()
   let name, params
   if (['reply', 'quick_reply'].includes(type)) { name = 'quick_reply'; params = { display_text: label, id: String(btn.id ?? btn.value ?? '') } }
   else if (['url', 'cta_url'].includes(type)) { name = 'cta_url'; params = { display_text: label, url: btn.url, merchant_url: btn.url } }
   else if (['call', 'cta_call'].includes(type)) { name = 'cta_call'; params = { display_text: label, phone_number: btn.phoneNumber ?? btn.id } }
   else if (['list', 'single_select', 'sections'].includes(type)) {
      name = 'single_select'
      params = { title: btn.title || label, sections: (btn.sections || []).map(section => ({ title: section.title || '', rows: (section.rows || []).map(row => ({ title: row.title || '', description: row.description || '', id: String(row.id ?? row.title ?? '') })) })) }
   } else throw new TypeError('Unsupported interactive button')
   return { name, buttonParamsJson: JSON.stringify(params) }
}
export const buildNativeFlow = (buttons = [], messageParams = {}) => {
   const native = buttons.map(buttonToNativeFlow)
   const replies = native.filter(btn => btn.name === 'quick_reply').length
   if (replies && replies !== native.length) throw new TypeError('Quick replies must not mix with CTA/list buttons')
   if (native.length > (replies ? 10 : 3)) throw new RangeError('Too many interactive buttons')
   for (const btn of native) {
      const params = JSON.parse(btn.buttonParamsJson)
      if (btn.name === 'quick_reply' && (!params.id || !params.display_text)) throw new TypeError('Quick reply requires a label and command')
      if (btn.name === 'cta_url' && !/^https?:\/\//i.test(params.url)) throw new TypeError('CTA requires an absolute URL')
   }
   return { buttons: native, messageParamsJson: JSON.stringify(messageParams), messageVersion: 1 }
}
export const toFallbackText = ({ text = '', header = '', footer = '', buttons = [], cards = [] }) => {
   const lines = [header, text, footer]
   for (const button of buttons) {
      try {
         const btn = buttonToNativeFlow(button), p = JSON.parse(btn.buttonParamsJson)
         if (btn.name === 'single_select') for (const section of p.sections || []) {
            if (section.title) lines.push(section.title)
            for (const row of section.rows || []) lines.push(`${row.title || ''}: ${row.id || ''}`)
         }
         else lines.push(`${p.display_text || ''}: ${p.id || p.url || p.phone_number || p.copy_code || ''}`)
      } catch { if (typeof button === 'object') lines.push(`${button.displayText || button.title || ''}: ${button.id || button.url || ''}`) }
   }
   for (const card of cards) lines.push(toFallbackText({ ...card, header: card.title }))
   return lines.filter(Boolean).join('\n\n')
}
const normalizeQuoted = quoted => quoted?.key && quoted?.msg && !quoted.message ? { key: quoted.key, message: { [quoted.type || 'extendedTextMessage']: quoted.msg } } : quoted || undefined
const relay = async (sock, jid, interactiveMessage, options) => {
   const message = generateWAMessageFromContent(jid, { interactiveMessage: stripNullish(interactiveMessage) }, { quoted: normalizeQuoted(options.quoted), userJid: sock.user?.id })
   await sock.relayMessage(jid, message.message, { ...options.relayOptions, messageId: message.key.id })
   return message
}
const prepareHeader = async (sock, options, carousel = false) => {
   const kind = options.document ? 'document' : options.image ? 'image' : options.video ? 'video' : null
   if (carousel && !['image', 'video'].includes(kind)) throw new TypeError('Carousel cards require image or video')
   let media = {}
   if (kind) {
      let source = options[kind]
      if (typeof source === 'string' && /^https?:\/\//i.test(source)) source = (await fetchBuffer(source, { maxBytes: positiveInt(global.interactiveMediaMaxBytes, 8 * 1024 * 1024) })).buffer
      media = await prepareWAMessageMedia({ [kind]: typeof source === 'string' ? { url: source } : source,
         ...(kind === 'document' ? { fileName: options.fileName, mimetype: options.mimetype, jpegThumbnail: options.jpegThumbnail } : {}) }, { upload: sock.waUploadToServer, mediaUploadTimeoutMs: positiveInt(global.requestTimeout, 30000) })
      if (!media[`${kind}Message`]) throw new Error('Interactive header preparation failed')
   }
   return { title: String(options.header || options.title || ''), hasMediaAttachment: !!kind, ...media }
}
const sendWithFallback = async (sock, jid, options, build) => {
   const fallbackText = options.fallbackText || toFallbackText(options)
   if (options.textOnly || global.interactiveMenuMode === 'text') return sock.sendText(jid, fallbackText, options.quoted)
   try { return await relay(sock, jid, await build(), options) }
   catch (error) {
      reportError('Interactive delivery', error)
      if (options.fallback === false) throw error
   }
   // Outside the catch: a failed fallback is propagated once, never retried here.
   return sock.sendText(jid, fallbackText, options.quoted)
}
Func.sendInteractiveMessage = (sock, jid, options = {}) => sendWithFallback(sock, jid, options, async () => ({
   body: { text: String(options.text || '') }, footer: options.footer ? { text: String(options.footer) } : undefined,
   header: await prepareHeader(sock, options), contextInfo: options.contextInfo || {},
   nativeFlowMessage: buildNativeFlow(options.buttons, options.messageParams)
}))
Func.sendButton = (sock, jid, options = {}, buttons, quoted) => Func.sendInteractiveMessage(sock, jid, typeof options === 'string' ? { text: options, buttons, quoted } : options)
Func.sendList = (sock, jid, options = {}, sections, quoted) => {
   if (typeof options === 'string') options = { text: options, sections, quoted }
   return Func.sendInteractiveMessage(sock, jid, { ...options, buttons: [{ type: 'list', title: options.title || options.buttonText || 'Pilih', sections: options.sections || [] }] })
}
Func.sendSections = (...args) => Func.sendList(...args)
Func.sendCard = (...args) => Func.sendInteractiveMessage(...args)
Func.sendCarousel = (sock, jid, options = {}) => sendWithFallback(sock, jid, options, async () => {
   if (!options.cards?.length || options.cards.length > 10) throw new RangeError('Carousel requires 1–10 cards')
   const cards = []
   for (const card of options.cards) cards.push({
      body: { text: String(card.text || '') }, footer: card.footer ? { text: String(card.footer) } : undefined,
      header: await prepareHeader(sock, card, true), nativeFlowMessage: buildNativeFlow(card.buttons, card.messageParams)
   })
   return { body: { text: String(options.text || '') }, footer: options.footer ? { text: String(options.footer) } : undefined,
      contextInfo: options.contextInfo || {}, carouselMessage: { cards, messageVersion: 1 } }
})
