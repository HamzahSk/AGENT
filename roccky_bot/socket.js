import { installFatalHandlers } from './lib/Components/ErrorHandler.js'
import './lib/Components/Dispatcher.js'
import './config.js'
import loadFunc from '#func'
import loadScrap from '#scrap'
import loadUtils from '#utils'
import { Database, Store, connectCloudDB, closeCloudDB } from './lib/Database.js'
import { makeWASocket, useMultiFileAuthState, makeCacheableSignalKeyStore } from 'baileys'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import pino from 'pino'
import NodeCache from 'node-cache'
import { BOT } from './lib/Constants.js'
import { scanDirectory, closeWatchers, pluginLifecycle } from './lib/Watcher.js'
import { closeUtilityWatchers } from './lib/DirectoryLoader.js'
import Listener from './lib/Listener.js'
import SholatReminder from './lib/Components/SholatReminder.js'
import { startMaintenance } from './lib/Components/Maintenance.js'
import { registerAllEvents } from './lib/Event.js'
import { stopQuizzes } from './lib/Components/QuizFactory.js'
import { ConnectionManager } from './lib/ConnectionManager.js'
import { reportError } from './lib/Runtime.js'

let db, store, listener, reminder, manager, stopMaintenance, shuttingDown
let credentialWrites = Promise.resolve()
const groupCache = new NodeCache({ stdTTL: 300, checkperiod: 120, useClones: false, maxKeys: 2000 })
const processedMessages = new NodeCache({ stdTTL: 30, checkperiod: 15, useClones: false, maxKeys: 10000 })
const msgRetryCounterCache = new NodeCache({ stdTTL: 60, checkperiod: 30, useClones: false, maxKeys: 5000 })
const cleanup = new WeakMap()
const shutdown = code => shuttingDown ||= (async () => {
   // An unresponsive external operation must not prevent process termination.
   const deadline = setTimeout(() => process.exit(code), 12000)
   deadline.unref?.()
   stopMaintenance?.(); closeWatchers(); closeUtilityWatchers(); reminder?.stop()
   try {
      await manager?.stop()
      await credentialWrites
      const results = await Promise.allSettled([db?.close(), store?.close()])
      for (const result of results) if (result.status === 'rejected') reportError('Shutdown persistence', result.reason)
      await closeCloudDB()
   } catch (error) { reportError('Shutdown', error) }
   for (const cache of [groupCache, processedMessages, msgRetryCounterCache]) cache.close()
   process.exit(code)
})()
installFatalHandlers(shutdown)
process.once('SIGTERM', () => { void shutdown(75) })
process.once('SIGINT', () => { void shutdown(0) })

try {
   await loadFunc(); await loadScrap(); await loadUtils()
   const url = process.env.ROCCKY_DATABASE_URL ?? global.databaseUrl
   if (url) await connectCloudDB(url)
   db = Database(join(process.cwd(), global.databaseFilename || 'database.json'))
   store = Store(join(process.cwd(), global.storeFilename || 'store.json'))
   await Promise.all([db.readFromFile(), store.readFromFile()])
   global.db = db
   listener = Listener(db, store)
   reminder = SholatReminder(db)
   await scanDirectory(global.pluginsFolder || './plugins')
   const temporaryFolderPath = join(process.cwd(), global.temporaryFolder || 'temp')
   await mkdir(temporaryFolderPath, { recursive: true })
   // Read once per worker. Reconnects use the same live credentials and key store.
   const { state, saveCreds } = await useMultiFileAuthState(global.authFolder || 'auth')
   const logger = pino({ level: 'silent' })
   const keys = makeCacheableSignalKeyStore(state.keys, logger)
   manager = new ConnectionManager({
      create: async () => {
         const sock = listener.bind(makeWASocket({
            logger, auth: { creds: state.creds, keys }, msgRetryCounterCache,
            shouldIgnoreJid: jid => typeof jid === 'string' && jid.endsWith(BOT),
            syncFullHistory: false, shouldSyncHistoryMessage: () => false,
            generateHighQualityLinkPreview: false, connectTimeoutMs: 30000, defaultQueryTimeoutMs: 30000,
            cachedGroupMetadata: async jid => {
               const metadata = groupCache.get(jid) || store.getGroup(jid)
               return metadata?.participants ? metadata : undefined
            },
            getMessage: key => store.getMessage({ chat: key.remoteJid, id: key.id })?.message
         }))
         const save = () => {
            credentialWrites = credentialWrites.then(saveCreds).catch(error => {
               reportError('Credential persistence', error)
               void shutdown(1)
            })
         }
         sock.ev.on('creds.update', save)
         const disposeEvents = registerAllEvents(sock, { db, store, listener, sholatReminder: reminder, groupCache, processedMessages, connectionManager: manager })
         cleanup.set(sock, async () => {
            sock.ev.off('creds.update', save)
            reminder.stop(); stopQuizzes()
            await pluginLifecycle('onDisconnect', sock)
            // End the transport to settle pending sends, then drain command work.
            sock.end(new Error('Socket disposed'))
            await disposeEvents()
            await listener.unbind()
            groupCache.flushAll()
         })
         return sock
      },
      dispose: async sock => { const dispose = cleanup.get(sock); cleanup.delete(sock); await dispose?.() },
      onTerminal: async code => { console.warn(`[Connection] Operator intervention required (${code}); session preserved`); void shutdown(78) }
   })
   await manager.start()
   stopMaintenance = startMaintenance({ db, store, temporaryFolderPath, requestRestart: () => shutdown(75) })
} catch (error) { reportError('Worker startup', error); await shutdown(1) }
