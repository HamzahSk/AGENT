import { mkdir, readFile, rename, writeFile } from 'fs/promises'
import { basename, dirname, resolve } from 'path'
import { MongoClient } from 'mongodb'
import pg from 'pg'

import { DAY, MAX_MESSAGES, SCHEMA } from './Constants.js'
import { Func } from '#func'
// ==========================================
// MESIN CLOUD DATABASE (POSTGRES & MONGO)
// ==========================================
export let isCloudConnected = false;
let cloudDbClient = null;
let cloudDbType = null;
let mongoDbInstance = null;

export const connectCloudDB = async (url) => {
   if (!url) return false;
   console.log('🔄 Menyambungkan ke Cloud Database...');
   try {
      if (url.startsWith('mongodb')) {
         cloudDbType = 'mongodb';
         cloudDbClient = new MongoClient(url, {
            serverSelectionTimeoutMS: 10000,
            maxPoolSize: 10
         });
         await cloudDbClient.connect();
         mongoDbInstance = cloudDbClient.db(global.databaseName || 'roccky');
         // Index primer (otomatis pada _id) dipakai untuk upsert satu dokumen per key.
         await mongoDbInstance.collection('roccky_data').createIndex({ _id: 1 });
         console.log('✅ Terhubung ke MongoDB!');
      } else {
         cloudDbType = 'postgres';
         // Connection pool: batasi koneksi agar tidak membebani server remote.
         cloudDbClient = new pg.Pool({
            connectionString: url,
            ssl: { rejectUnauthorized: false },
            max: 10,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 10000
         });
         // OPTIMISASI: Simpan sebagai TEXT (bukan JSONB) agar server cloud
         // tidak auto-parse JSON setiap query. updated_at membantu audit sinkronisasi.
         await cloudDbClient.query(`CREATE TABLE IF NOT EXISTS roccky_data (file_key TEXT PRIMARY KEY, json_data TEXT, updated_at BIGINT);`);
         await cloudDbClient.query(`ALTER TABLE roccky_data ADD COLUMN IF NOT EXISTS updated_at BIGINT;`);
         console.log('✅ Terhubung ke PostgreSQL!');
      }
      isCloudConnected = true;
      return true;
   } catch (error) {
      console.error('❌ Gagal terhubung ke Cloud Database:', error.message);
      console.log('⚠️ Menggunakan penyimpanan File Lokal.');
      return false;
   }
}

// ==========================================
// UPGRADE LOCAL DATABASE (Bisa Cloud / Lokal)
// ==========================================
export const LocalDatabase = (fileName = global.databaseFilename) => {
   const filePath = resolve(process.cwd(), fileName)
   const dbKey = basename(fileName, '.json')

   let isWriting = false,
      isPending = false

   const bufferReviver = (key, value) => {
      if (!value?.data || !value.__type) return value

      const buffer = Buffer.from(value.data, 'base64')
      if (value.__type === 'Buffer') return buffer
      if (value.__type === 'ArrayBuffer') return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)

      const TypedArray = globalThis[value.__type]
      return TypedArray ? new TypedArray(buffer.buffer, buffer.byteOffset, buffer.byteLength / TypedArray.BYTES_PER_ELEMENT) : value
   }

   const bufferReplacer = (seen) => (key, value) => {
      if (typeof value === 'function') return

      if (value?.type === 'Buffer' && Array.isArray(value?.data))
         return { __type: 'Buffer', data: Buffer.from(value.data).toString('base64') }
      if (Buffer.isBuffer(value))
         return { __type: 'Buffer', data: value.toString('base64') }
      if (value instanceof ArrayBuffer)
         return { __type: 'ArrayBuffer', data: Buffer.from(value).toString('base64') }
      if (ArrayBuffer.isView(value))
         return { __type: value.constructor.name, data: Buffer.from(value.buffer, value.byteOffset, value.byteLength).toString('base64') }

      if (value && typeof value === 'object') {
         if (seen.has(value)) return
         seen.add(value)
      }
      return value
   }

   const read = async (file = filePath) => {
      try {
         let contentString = '{}'

         if (isCloudConnected) {
            console.log(`📥 Membaca ${dbKey} dari Cloud...`)
            if (cloudDbType === 'mongodb') {
               const doc = await mongoDbInstance.collection('roccky_data').findOne({ _id: dbKey })
               if (doc && doc.json_data) {
                  // OPTIMISASI: Jika tipe data di cloud sudah string, langsung pakai (Bypass JSON.stringify)
                  contentString = typeof doc.json_data === 'string' ? doc.json_data : JSON.stringify(doc.json_data)
               }
            } else {
               const res = await cloudDbClient.query(`SELECT json_data FROM roccky_data WHERE file_key = $1`, [dbKey])
               if (res.rows.length > 0) {
                  contentString = typeof res.rows[0].json_data === 'string' ? res.rows[0].json_data : JSON.stringify(res.rows[0].json_data)
               }
            }
         }
         else {
            try {
               contentString = await readFile(file, 'utf-8')
            } catch {
               await mkdir(dirname(file), { recursive: true })
               await writeFile(file, '{}', 'utf-8')
            }
         }

         return JSON.parse(contentString, bufferReviver)
      }
      catch (error) {
         console.error(`❌ Problem membaca ${dbKey} :`, error.message)
         return {}
      }
   }

   const write = async (data = {}) => {
      if (isWriting) {
         isPending = true
         return
      }
      isWriting = true
      try {
         const seen = new WeakSet()
         const jsonString = JSON.stringify(data, bufferReplacer(seen))

         // DIAGNOSTIK: Menampilkan ukuran data asli di konsol agar terpantau jika ukuran membengkak
         console.log(`💾 [Database] Menulis ${dbKey} | Ukuran: ${(jsonString.length / 1024 / 1024).toFixed(2)} MB`);

         if (isCloudConnected) {
            if (cloudDbType === 'mongodb') {
               // OPTIMISASI: Simpan langsung sebagai raw string di Mongo, jangan di-parse balik jadi object BSON
               await mongoDbInstance.collection('roccky_data').updateOne(
                  { _id: dbKey }, { $set: { json_data: jsonString, updated_at: Date.now() } }, { upsert: true }
               )
            } else {
               // OPTIMISASI: Simpan sebagai TEXT biasa di Postgres (Menghapus casting ::jsonb yang lambat)
               await cloudDbClient.query(
                  `INSERT INTO roccky_data (file_key, json_data, updated_at) VALUES ($1, $2, $3) ON CONFLICT (file_key) DO UPDATE SET json_data = EXCLUDED.json_data, updated_at = EXCLUDED.updated_at`,
                  [dbKey, jsonString, Date.now()]
               )
            }
         }
         else {
            await mkdir(dirname(filePath), { recursive: true })
            const temp = filePath + '.temp'
            await writeFile(temp, jsonString, 'utf-8')
            await rename(temp, filePath)
         }
      }
      catch (error) {
         console.error(`❌ Problem menulis ${dbKey} :`, error.message)
      }
      finally {
         isWriting = false
         if (isPending) {
            isPending = false
            await write(data)
         }
      }
   }

   return { read, write }
}

// ==========================================
// DIRTY TRACKING & WRITE COALESCING
// ==========================================
// Prinsip: jangan pernah menulis ulang seluruh data bila tidak ada perubahan.
// Mutasi ditandai "dirty", lalu digabung (coalesced) ke satu flush dalam
// jendela debounce. Ini memotong puluhan write penuh menjadi satu per periode,
// sangat penting saat DB berada di server remote (latency tinggi).
const debounceMs = () => global.dbFlushDebounce ?? 5_000

const createFlushController = (flushNow) => {
   let dirty = false
   let timer = null
   let suppress = false

   const flushNowGuarded = async () => {
      if (timer) {
         clearTimeout(timer)
         timer = null
      }
      dirty = false
      try {
         await flushNow()
      }
      catch (error) {
         console.error('❌ [Flush] Error:', error?.message || error)
         dirty = true
      }
   }

   const markDirty = () => {
      dirty = true
      if (suppress) return
      if (timer) return
      timer = setTimeout(() => {
         timer = null
         if (!dirty) return
         flushNowGuarded()
      }, debounceMs())
      if (timer.unref) timer.unref()
   }

   const requestWrite = () => markDirty()

   const flush = async () => {
      if (!dirty) return
      if (timer) {
         clearTimeout(timer)
         timer = null
      }
      if (!dirty) return
      await flushNowGuarded()
   }

   const suppressDirty = (callback) => {
      suppress = true
      try { callback() }
      finally { suppress = false }
   }

   return { requestWrite, flush, flushNowGuarded, suppressDirty, isDirty: () => dirty }
}

// ==========================================
// DATABASE & STORE
// ==========================================
export const Database = (databasePath = global.databaseFilename) => {
   const db = LocalDatabase(databasePath)
   let users = new Map(), groups = new Map(), settings = {}

   const build = () => {
      const out = { users: {}, groups: {}, settings: {} }
      for (const [id, data] of users) out.users[id] = data
      for (const [id, data] of groups) out.groups[id] = data
      out.settings = settings
      return out
   }

   const flushNow = async () => {
      await db.write(build())
   }

   const controller = createFlushController(flushNow)

   return {
      users, groups, settings,
      updateUser(id, value) { users.set(id, { ...users.get(id) || {}, ...value }); controller.requestWrite() },
      getUser(id) { return users.get(id) },
      hasUser(id) { return users.has(id) },
      deleteUser(id) { if (users.delete(id)) controller.requestWrite() },
      updateGroup(id, value) { groups.set(id, { ...groups.get(id) || {}, ...value }); controller.requestWrite() },
      getGroup(id) { return groups.get(id) },
      hasGroup(id) { return groups.has(id) },
      deleteGroup(id) { if (groups.delete(id)) controller.requestWrite() },
      getSetting() { return settings },
      // API persistensi: requestWrite (coalesced), flush (hanya bila dirty), flushNow (paksa).
      requestWrite: controller.requestWrite,
      flush: controller.flush,
      flushNow: controller.flushNowGuarded,
      async readFromFile(file) {
         const raw = await db.read(file)
         controller.suppressDirty(() => {
            users.clear()
            for (const [id, data] of Object.entries(raw.users || {})) {
               Func.applySchema(data, SCHEMA.User)
               users.set(id, data)
            }
            groups.clear()
            for (const [id, data] of Object.entries(raw.groups || {})) {
               Func.applySchema(data, SCHEMA.Group)
               groups.set(id, data)
            }
            let setting = Object.assign({}, raw.settings || {})
            Func.applySchema(setting, SCHEMA.Setting)
            Object.assign(settings, setting)
         })
      },
      // Backward-compat alias (paksa persist segera)
      async writeToFile() { await controller.flushNowGuarded() }
   }
}

export const Store = (storePath = global.storeFilename) => {
   const db = LocalDatabase(storePath)
   // objek/Map DI-MUTASI in-place (tidak pernah di-reassign) agar properti
   // `messages`/`contacts` yang diekspos selalu merujuk data terkini.
   let messages = {}
   const groupMetadata = new Map()

   const retentionMs = () => global.storeMessageRetention ?? 3 * DAY
   const maxPerChat = () => global.storeMaxMessagesPerChat ?? MAX_MESSAGES
   const maxTotalMessages = () => global.storeMaxTotalMessages ?? 8000
   const maxContacts = () => global.storeMaxContacts ?? 4000

   // Stempel waktu sebuah pesan (dipakai untuk pruning berbasis umur).
   const deriveTimestamp = (message) => {
      if (message?._ts) return message._ts
      const raw = message?.messageTimestamp
      if (raw) {
         const seconds = typeof raw === 'number' ? raw : (raw.toNumber ? raw.toNumber() : raw.low)
         if (seconds) return seconds * 1000
      }
      return 0
   }

   // Buang bagian paling besar dari pesan saat PERSISTENSI (thumbnail dll).
   // Memori tetap menyimpan objek asli agar getMessage / anti-delete tetap utuh.
   const stripThumbnails = (message) => {
      if (!message || typeof message !== 'object') return message
      const copy = { ...message }
      if (copy.message && typeof copy.message === 'object') {
         const inner = { ...copy.message }
         for (const key of Object.keys(inner)) {
            const sub = inner[key]
            if (sub && typeof sub === 'object') {
               inner[key] = { ...sub }
               delete inner[key].jpegThumbnail
               delete inner[key].thumbnail
               delete inner[key].thumbnailUrl
            }
         }
         copy.message = inner
      }
      delete copy.thumbnail
      delete copy.jpegThumbnail
      return copy
   }

   const build = () => {
      const out = { messages: {}, contacts: {}, groupMetadata: {} }
      for (const [chatId, map] of Object.entries(messages)) {
         if (!map.size) continue
         const slimMap = {}
         for (const [id, msg] of map)
            slimMap[id] = stripThumbnails(msg)
         out.messages[chatId] = slimMap
      }
      for (const [id, data] of contacts) out.contacts[id] = data
      for (const [id, metadata] of groupMetadata) out.groupMetadata[id] = metadata
      return out
   }

   const flushNow = async () => {
      await db.write(build())
   }

   const controller = createFlushController(flushNow)

   // Proxy agar mutasi langsung pada Map (mis. store.contacts.set di Serialize)
   // ikut menandai dirty -> tetap tersinkron ke penyimpanan.
   const makeDirtyMap = (map) => new Proxy(map, {
      get(target, prop) {
         // receiver = target asli agar accessor (mis. Map.prototype.size)
         // mendapat receiver yang benar (bukan proxy).
         const value = Reflect.get(target, prop, target)
         if (typeof value !== 'function') return value
         if (prop === 'set' || prop === 'delete' || prop === 'clear')
            return (...args) => {
               const result = value.apply(target, args)
               controller.requestWrite()
               return result
            }
         return value.bind(target)
      }
   })

   const contacts = makeDirtyMap(new Map())

   // Pembersihan otomatis: buang pesan kadaluarsa, batasi ukuran per-chat & total,
   // dan batasi jumlah kontak agar store tidak membengkak tak terkendali.
   const prune = (mark = true) => {
      let changed = false
      const now = Date.now()
      const retention = retentionMs()
      const capPerChat = maxPerChat()
      const capTotal = maxTotalMessages()
      const capContacts = maxContacts()

      let total = 0
      const chatActivity = []
      for (const chatId of Object.keys(messages)) {
         const map = messages[chatId]
         if (!map.size) {
            delete messages[chatId]
            changed = true
            continue
         }
         let newest = 0
         for (const [id, msg] of map) {
            const ts = deriveTimestamp(msg)
            if (ts && now - ts > retention) {
               map.delete(id)
               changed = true
               continue
            }
            if (ts > newest) newest = ts
         }
         while (map.size > capPerChat) {
            map.delete(map.keys().next().value)
            changed = true
         }
         total += map.size
         chatActivity.push([chatId, newest || now])
         if (!map.size) {
            delete messages[chatId]
            changed = true
         }
      }

      // Batas total global: buang seluruh chat paling lama lebih dulu.
      if (total > capTotal) {
         chatActivity.sort((a, b) => a[1] - b[1])
         for (const [chatId] of chatActivity) {
            if (total <= capTotal) break
            const size = messages[chatId]?.size || 0
            total -= size
            delete messages[chatId]
            changed = true
         }
      }

      if (contacts.size > capContacts) {
         const excess = contacts.size - capContacts
         const iterator = contacts.keys()
         for (let i = 0; i < excess; i++)
            contacts.delete(iterator.next().value)
         changed = true
      }

      if (changed && mark) controller.requestWrite()
      return changed
   }

   return {
      messages, contacts, groupMetadata,
      setMessage(message) {
         let chat = messages[message.chat]
         if (!chat) chat = messages[message.chat] = new Map()
         if (chat.has(message.id)) chat.delete(message.id)
         const ts = deriveTimestamp(message) || Date.now()
         chat.set(message.id, Object.assign(message, { _ts: ts }))
         while (chat.size > maxPerChat())
            chat.delete(chat.keys().next().value)
         controller.requestWrite()
      },
      getMessage(message) { return messages[message.chat]?.get(message.id) },
      hasMessage(message) { return messages[message.chat]?.has(message.id) },
      deleteMessage(message) { if (messages[message.chat]?.delete(message.id)) controller.requestWrite() },
      setGroup(id, metadata) { groupMetadata.set(id, metadata); controller.requestWrite() },
      getGroup(id) { return groupMetadata.get(id) },
      hasGroup(id) { return groupMetadata.has(id) },
      deleteGroup(id) { if (groupMetadata.delete(id)) controller.requestWrite() },
      prune,
      requestWrite: controller.requestWrite,
      flush: controller.flush,
      flushNow: controller.flushNowGuarded,
      async readFromFile(file) {
         const raw = await db.read(file)
         const now = Date.now()
         const retention = retentionMs()
         controller.suppressDirty(() => {
            // Mutasi in-place agar referensi `messages` yang diekspos tetap valid.
            for (const key of Object.keys(messages)) delete messages[key]
            for (const [chatId, chatMessages] of Object.entries(raw.messages || {})) {
               const map = new Map()
               for (const [id, msg] of Object.entries(chatMessages)) {
                  const ts = deriveTimestamp(msg)
                  // Lewati pesan yang sudah kadaluarsa sejak awal (bukan dibangun di memori).
                  if (ts && now - ts > retention) continue
                  map.set(id, msg)
               }
               if (map.size) messages[chatId] = map
            }
            contacts.clear()
            for (const [id, data] of Object.entries(raw.contacts || {}))
               contacts.set(id, data)
            groupMetadata.clear()
            for (const [id, metadata] of Object.entries(raw.groupMetadata || {}))
               groupMetadata.set(id, metadata)
         })
         prune(false)
      },
      // Backward-compat alias (paksa persist segera)
      async writeToFile() { await controller.flushNowGuarded() }
   }
}