import { DAY, MAX_MESSAGES, SCHEMA } from './Constants.js'
import { Func } from '#func'
import { positiveInt } from './Runtime.js'
import { createFlushController } from './Persistence.js'
import { LocalDatabase } from './SnapshotFile.js'
import { cloudDatabase } from './CloudDatabase.js'
export { LocalDatabase } from './SnapshotFile.js'
export let isCloudConnected = false
export const connectCloudDB = async url => (isCloudConnected = await cloudDatabase.connect(url))
export const closeCloudDB = () => cloudDatabase.close()

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
      sync: db.sync,
      async close() { await controller.close(); await db.close() },
      async readFromFile(file) {
         const raw = await db.read(file)
         const validObject = value => value && typeof value === 'object' && !Array.isArray(value)
         for (const name of ['users', 'groups']) {
            if (raw[name] !== undefined && !validObject(raw[name])) throw new TypeError('Invalid database collection')
            for (const value of Object.values(raw[name] || {})) if (!validObject(value)) throw new TypeError('Invalid database record')
         }
         if (raw.settings !== undefined && !validObject(raw.settings)) throw new TypeError('Invalid database settings')
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
            for (const key of Object.keys(settings)) delete settings[key]
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

   const retentionMs = () => positiveInt(global.storeMessageRetention, 3 * DAY)
   const maxPerChat = () => positiveInt(global.storeMaxMessagesPerChat, MAX_MESSAGES)
   const maxTotalMessages = () => positiveInt(global.storeMaxTotalMessages, 8000)
   const maxContacts = () => positiveInt(global.storeMaxContacts, 4000)

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
      while (groupMetadata.size > positiveInt(global.storeMaxGroups, 1000)) { groupMetadata.delete(groupMetadata.keys().next().value); changed = true }
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
         const stored = { _ts: ts }
         for (const key of ['key', 'message', 'messageTimestamp', 'pushName', 'id', 'chat', 'sender', 'type', 'body', 'text', 'isGroup', 'fromMe'])
            if (message[key] !== undefined) stored[key] = message[key]
         chat.set(message.id, stored)
         while (chat.size > maxPerChat())
            chat.delete(chat.keys().next().value)
         controller.requestWrite()
      },
      getMessage(message) { return messages[message.chat]?.get(message.id) },
      hasMessage(message) { return messages[message.chat]?.has(message.id) },
      deleteMessage(message) { if (messages[message.chat]?.delete(message.id)) controller.requestWrite() },
      setGroup(id, metadata) { groupMetadata.delete(id); groupMetadata.set(id, metadata); while (groupMetadata.size > positiveInt(global.storeMaxGroups, 1000)) groupMetadata.delete(groupMetadata.keys().next().value); controller.requestWrite() },
      getGroup(id) { return groupMetadata.get(id) },
      hasGroup(id) { return groupMetadata.has(id) },
      deleteGroup(id) { if (groupMetadata.delete(id)) controller.requestWrite() },
      prune,
      requestWrite: controller.requestWrite,
      flush: controller.flush,
      flushNow: controller.flushNowGuarded,
      sync: db.sync,
      async close() { await controller.close(); await db.close() },
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