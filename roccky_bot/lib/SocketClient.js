import { finished } from 'node:stream/promises'
import { fetchBuffer } from './Http.js'
import { Boom } from '@hapi/boom'
import { LRUCache } from 'lru-cache'
import { reportError } from './Runtime.js'
// SocketClient.js
import fs from 'fs'
import { Readable } from 'stream'
import { fileTypeFromBuffer } from 'file-type'
import { Func } from '#func'

const closeMediaStream = async stream => {
   if (!stream) return
   const completion = finished(stream)
   stream.destroy()
   await completion.catch(() => {})
}

// Konstanta & Default Config
const minDelay = global.minDelay ?? 1000
const maxDelay = global.maxDelay ?? 3000
const stickerPackPublisher = global.stickerPackPublisher ?? 'Rockky Bot'

// Key media yang dikenali Baileys (prepareWAMessageMedia). Jika salah satu key
// ini hadir dengan nilai null/undefined pada payload teks, Baileys bisa jatuh
// ke cabang media dan melempar "Invalid media type" (HTTP 400).
const MEDIA_KEYS = ['image', 'video', 'document', 'audio', 'sticker', 'product-catalog-image']

/**
 * Bersihkan konten pesan sebelum diteruskan ke Baileys:
 * 1. Buang seluruh key yang bernilai null/undefined (sumber utama error
 *    "Invalid media type" pada prepareWMessageMedia Baileys messages.js).
 * 2. Jika pesan adalah teks murni ({ text }), buang key media yang menyusup
 *    agar payload menjadi murni `{ text: string }` (tanpa key media/hdr).
 */
const sanitizeMessageContent = (content) => {
   if (!content || typeof content !== 'object')
      return content ?? {}

   const cleaned = {}
   for (const key of Object.keys(content)) {
      const value = content[key]
      if (value === null || value === undefined) continue
      cleaned[key] = value
   }

   if (typeof cleaned.text === 'string') {
      for (const key of MEDIA_KEYS)
         delete cleaned[key]
   }

   return cleaned
}

/**
 * Resolve sumber media (Buffer, URL, atau path file) menjadi payload siap kirim.
 * Kembalikan { mediaContent, mimetype } dengan perilaku yang identik.
 */
const resolveMediaSource = async (source, { toStream = false, mimetype = '' } = {}) => {
   if (toStream) {
      if (Buffer.isBuffer(source))
         return { mediaContent: { stream: Readable.from(source) }, mimetype }

      if (typeof source === 'string' && Func.isURL(source)) {
         const file = await Func.persistToFile(source)
         const stream = fs.createReadStream(file)
         stream.once('close', () => { void fs.promises.unlink(file).catch(error => reportError('Download cleanup', error)) })
         return { mediaContent: { stream }, mimetype }
      }

      if (typeof source === 'string' && await Func.isFileExists(source))
         return { mediaContent: { stream: fs.createReadStream(source) }, mimetype }

      throw new Error('Source media tidak valid untuk stream ' + source)
   }

   let mediaContent
   if (Buffer.isBuffer(source)) {
      mediaContent = source
   }
   else if (typeof source === 'string' && Func.isURL(source)) {
      const result = await fetchBuffer(source)
      mediaContent = result.buffer
      mimetype = mimetype || result.contentType.split(';')[0]
   }
   else if (typeof source === 'string' && await Func.isFileExists(source)) {
      const info = await fs.promises.stat(source)
      if (info.size > (global.maxDownloadBytes || 32 * 1024 * 1024)) throw new RangeError('Media exceeds configured limit')
      mediaContent = await fs.promises.readFile(source)
   }
   else {
      throw new Error('Source media tidak valid untuk buffer')
   }

   if (!mimetype || mimetype === 'application/octet-stream') {
      const fileType = await fileTypeFromBuffer(mediaContent)
      mimetype = fileType?.mime || 'application/octet-stream'
   }

   return { mediaContent, mimetype }
}

export default function Client(sock, options = {}) {
   const {
      db,
      updatePresence = false,
      delayWithPresence = false,
      secureMetaServiceLabel = undefined
   } = options

   // ==================================================
   // OVERRIDE SEND MESSAGE
   // ==================================================
   const originalSendMessage = sock.sendMessage
   sock.sendMessage = async (jid, content, opts = {}) => {
      if (updatePresence && !Array.isArray(jid) && !content?.react && !content?.pin) {
         const presenceType = content?.ptt ? 'recording' : 'composing'
         await sock.sendPresenceUpdate(presenceType, jid).catch(() => {})
      }
      if (delayWithPresence) await Func.delay(Func.randomInteger(minDelay, maxDelay))

      // Sanitasi payload: buang key media null/undefined sehingga pesan teks
      // AI tetap murni `{ text }` (mencegah error "Invalid media type").
      const safeContent = sanitizeMessageContent(content)

      if (secureMetaServiceLabel && safeContent)
         safeContent.secureMetaServiceLabel = secureMetaServiceLabel

      return originalSendMessage(jid, safeContent, opts)

   }

   // ==================================================
   // SEND TEXT
   // ==================================================
   sock.sendText = (jid, text = '', quoted = null, content = {}, options = {}) => {
      text = typeof text === 'string' ? text : JSON.stringify(text, null, 3)
      content.text = text
      content.mentions = Func.parseMentions(text)
      options.ephemeralExpiration = !Func.isJidGroup(jid) && Func.WA_DEFAULT_EPHEMERAL
      options.quoted = quoted
      return sock.sendMessage(jid, content, options)
   }

   // ==================================================
   // SEND MEDIA
   // ==================================================
   sock.sendMedia = async (jid, source, caption = '', quoted = null, content = {}, options = {}) => {
      let mediaStream
      try {
         caption = typeof caption === 'string' ? caption : JSON.stringify(caption, null, 3)

         // Saklar utama (default false/buffer)
         const toStream = !!content.toStream

         if (content.audio && Func.isJidNewsletter(jid)) {
            content.ptt = true
         }

         // 1. PENANGANAN STICKER
         if (content.sticker) {
            source = await Func.persistToFile(source)
            content.stickerPackPublisher ??= stickerPackPublisher
            const media = await Func.createSticker(source, content)
            return await sock.sendMessage(jid, {
               sticker: media,
               mimetype: 'image/webp',
               caption,
               mentions: Func.parseMentions(caption)
            }, { quoted, ...options })
         }

         // 2. PENANGANAN AUDIO / PTT (Butuh FFmpeg -> Simpan lokal dulu)
         if (content.ptt || content.audio) {
            source = await Func.persistToFile(source)
            const media = content.ptt ? await Func.toPTT(source, toStream) : await Func.toAudio(source, toStream)
            if (toStream) mediaStream = media

            return await sock.sendMessage(jid, {
               audio: toStream ? { stream: media } : { url: media },
               mimetype: content.ptt ? 'audio/ogg; codecs=opus' : 'audio/mpeg',
               ptt: content.ptt ? true : false,
               mentions: Func.parseMentions(caption)
            }, { quoted, ...options })
         }

         let type = content.type || (content.document ? 'document' : null)
         let mimetype = content.mimetype
         let filename = content.fileName || 'file'

         // 3. PENANGANAN DOKUMEN AUDIO (Butuh FFmpeg -> Simpan lokal dulu)
         const isAudioDocument = type === 'document' && (content.toAudioDocument || (mimetype && mimetype.includes('audio')))

         if (isAudioDocument) {
            source = await Func.persistToFile(source)
            const media = await Func.toAudio(source, toStream)
            if (toStream) mediaStream = media

            mimetype = 'audio/mpeg'
            if (!filename.includes('.')) filename += '.mp3'

            return await sock.sendMessage(jid, {
               document: toStream ? { stream: media } : { url: media },
               mimetype,
               caption: caption || undefined,
               mentions: Func.parseMentions(caption),
               fileName: filename
            }, { quoted, ...options })
         }

         // 4. PENANGANAN GENERAL (IMAGE, VIDEO, DOKUMEN NON-AUDIO)
         const { mediaContent, mimetype: resolvedMimetype } = await resolveMediaSource(source, { toStream, mimetype })
         mediaStream = mediaContent?.stream
         mimetype = resolvedMimetype

         // 5. PENENTUAN TIPE & EKSTENSI FALLBACK
         if (!type) {
            if (Func.isMimeVideo(mimetype) || mimetype?.includes('video')) type = 'video'
            else if (Func.isMimeImage(mimetype) || mimetype?.includes('image')) type = 'image'
            else if (mimetype?.includes('webp')) type = 'sticker'
            else type = 'document'
         }

         if (type === 'document' && !filename.includes('.')) {
            const ext = mimetype && mimetype !== 'application/octet-stream' ? mimetype.split('/')[1] : 'bin'
            filename += `.${ext}`
         }

         // 6. EKSEKUSI PENGIRIMAN
         const { toStream: _stream, type: _type, document: _document, ...extra } = content
         const message = {
            ...extra,
            [type]: mediaContent,
            mimetype,
            caption: caption || undefined,
            mentions: Func.parseMentions(caption),
            fileName: filename,
            ...(type === 'video' && { gifPlayback: content.gifPlayback || Func.isMimeGif(mimetype) })
         }

         return await sock.sendMessage(jid, message, { quoted, ...options })
      }
      catch (error) {
         reportError('Media delivery', error)
         throw error
      } finally { await closeMediaStream(mediaStream) }
   }

   // ==================================================
   // SEND AUDIO (DENGAN METADATA & COVER)
   // ==================================================
   sock.sendAudio = async (jid, input, opts = {}, quoted = null) => {
      const owned = new Set()
      let stream
      const persist = async value => {
         const file = await Func.persistToFile(value)
         if (file !== value) owned.add(file)
         return file
      }
      try {
         const raw = await persist(input)
         const cover = opts.cover ? await persist(opts.cover) : null
         const output = await Func.toAudioAlbum(raw, { ...opts, cover }, false)
         if (output !== input && output !== opts.cover) owned.add(output)
         stream = fs.createReadStream(output)
         const type = opts.type || 'audio'
         return await sock.sendMessage(jid, type === 'document' ? {
            document: { stream }, mimetype: 'audio/mpeg', fileName: `${opts.title || 'Audio'} - ${opts.artist || 'Unknown'}.mp3`
         } : { audio: { stream }, mimetype: type === 'ptt' ? 'audio/ogg; codecs=opus' : 'audio/mpeg', ptt: type === 'ptt' }, { quoted })
      } finally {
         await closeMediaStream(stream)
         for (const file of owned) await fs.promises.unlink(file).catch(error => { if (error.code !== 'ENOENT') reportError('Audio cleanup', error) })
      }
   }

   // ==================================================
   // PROFILE PICTURE
   // ==================================================
   const ProfilePictureCache = new LRUCache({ max: 1000, ttl: 300000 })
   sock.profilePicture = async (jid) => {
      if (ProfilePictureCache.has(jid)) return ProfilePictureCache.get(jid)
      let url
      try {
         url = await sock.profilePictureUrl(jid)
      }
      catch {
         url = botThumbnail
      }
      ProfilePictureCache.set(jid, url)
      return url
   }

   // ==================================================
   // SEND REACT
   // ==================================================
   sock.sendReact = async (jid, emoji, key) => {
      return await sock.sendMessage(jid, { react: { text: emoji, key } })
   }

   // ==================================================
   // SEND INTERACTIVE (NATIVE FLOW)
   // ==================================================
   sock.sendInteractiveMessage = (jid, options = {}) =>
      Func.sendInteractiveMessage(sock, jid, options)

   sock.sendButton = (jid, ...args) => Func.sendButton(sock, jid, ...args)

   sock.sendList = (jid, ...args) => Func.sendList(sock, jid, ...args)

   sock.sendSections = (jid, options = {}) =>
      Func.sendSections(sock, jid, options)

   sock.sendCard = (jid, options = {}) =>
      Func.sendCard(sock, jid, options)

   sock.sendCarousel = (jid, options = {}) =>
      Func.sendCarousel(sock, jid, options)

   sock.findUserId = async (pnLid) => {
      const normalizedJid = Func.jidNormalizedUser(pnLid)
      const userId = {}
      const signalRepository = sock.signalRepository

      if (
         Func.isPnUser(normalizedJid) ||
         Func.isHostedPnUser(normalizedJid)
      ) {
         userId.phoneNumber = normalizedJid
         const lids = await signalRepository.lidMapping.getLIDsForPNs([normalizedJid])
         userId.lid = lids?.[0]?.lid
      }
      else if (
         Func.isLidUser(normalizedJid) ||
         Func.isHostedLidUser(normalizedJid)
      ) {
         userId.lid = normalizedJid
         const pns = await signalRepository.lidMapping.getPNsForLIDs([normalizedJid])
         userId.phoneNumber = pns?.[0]?.pn
      }
      else {
         throw new Boom('Invalid id input to find user ids', { statusCode: 400 })
      }
      return userId
   }

   return sock
}
