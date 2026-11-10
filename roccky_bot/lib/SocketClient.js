// SocketClient.js
import fs from 'fs'
import path from 'path'
import axios from 'axios'
import { Readable } from 'stream'
import { fileTypeFromBuffer } from 'file-type'
import { Func } from '#func'

// Folder temporary untuk proses audio
const tmpDir = path.join(process.cwd(), 'tmp')
if (!fs.existsSync(tmpDir)) {
   fs.mkdirSync(tmpDir, { recursive: true })
}

// Konstanta & Default Config
const minDelay = global.minDelay ?? 1000
const maxDelay = global.maxDelay ?? 3000
const stickerPackPublisher = global.stickerPackPublisher ?? 'Rockky Bot'

const USER_AGENT = { 'User-Agent': 'Mozilla/5.0' }

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
         const res = await axios.get(source, { responseType: 'stream', headers: USER_AGENT })
         return {
            mediaContent: { stream: res.data },
            mimetype: mimetype || res.headers['content-type']?.split(';')[0] || 'application/octet-stream'
         }
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
      const res = await axios.get(source, { responseType: 'arraybuffer', headers: USER_AGENT })
      mediaContent = Buffer.from(res.data)
      mimetype = mimetype || res.headers['content-type']?.split(';')[0]
   }
   else if (typeof source === 'string' && await Func.isFileExists(source)) {
      mediaContent = fs.readFileSync(source)
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

      try {
         return await originalSendMessage(jid, safeContent, opts)
      }
      catch (error) {
         console.error('❌ sendMessage error:', error?.message || error)

         // Fallback aman: kirim ulang sebagai teks biasa tanpa embel-embel
         // media/UI agar pengguna tetap menerima jawaban bot.
         if (typeof safeContent?.text === 'string') {
            try {
               return await originalSendMessage(jid, {
                  text: safeContent.text
               }, {
                  ...opts,
                  quoted: opts?.quoted
               })
            }
            catch (fallbackError) {
               console.error('❌ sendMessage fallback ({ text }) error:', fallbackError?.message || fallbackError)
            }
         }

         return undefined
      }
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
            return sock.sendMessage(jid, {
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

            return sock.sendMessage(jid, {
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
         const message = {
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
         console.error('sendMedia error:', error)
         return sock.sendMessage(jid, { text: '❌ Gagal mengirim media: ' + error.message }, { quoted })
      }
   }

   // ==================================================
   // SEND AUDIO (DENGAN METADATA & COVER)
   // ==================================================
   sock.sendAudio = async (jid, input, opts = {}, quoted = null) => {
      try {
         // 1. Download input dan cover dengan instan menggunakan Func.persistToFile
         const raw = await Func.persistToFile(input)
         const coverFile = opts.cover ? await Func.persistToFile(opts.cover) : null

         // 2. Ganti URL cover di dalam opts dengan path lokal yang sudah di-download
         opts.cover = coverFile

         // 3. Proses menggunakan Func.toAudioAlbum (termasuk antrean & proses super cepat)
         const outPath = await Func.toAudioAlbum(raw, opts, false)

         // 4. Kirim file yang sudah jadi sebagai stream
         const stream = fs.createReadStream(outPath)
         const type = opts.type || 'audio'

         if (type === 'document') {
            await sock.sendMessage(jid, {
               document: { stream },
               mimetype: 'audio/mpeg',
               fileName: `${opts.title || 'Audio'} - ${opts.artist || 'Unknown'}.mp3`
            }, { quoted })
         }
         else {
            await sock.sendMessage(jid, {
               audio: { stream },
               mimetype: type === 'ptt' ? 'audio/ogg; codecs=opus' : 'audio/mpeg',
               ptt: type === 'ptt'
            }, { quoted })
         }

         // 5. Bersihkan semua file sampah (delay 5 detik)
         setTimeout(() => {
            [raw, coverFile, outPath].forEach(f => {
               if (f && fs.existsSync(f)) fs.unlinkSync(f)
            })
         }, 5000)
      }
      catch (error) {
         console.error('sendAudio error:', error)
         throw error
      }
   }

   // ==================================================
   // PROFILE PICTURE
   // ==================================================
   const ProfilePictureCache = new Map()
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

   sock.sendButton = (jid, options = {}) =>
      Func.sendButton(sock, jid, options)

   sock.sendList = (jid, options = {}) =>
      Func.sendList(sock, jid, options)

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
