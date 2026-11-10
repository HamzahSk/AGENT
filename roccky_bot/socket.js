import './lib/Components/ErrorHandler.js';
import './lib/Components/Dispatcher.js';
import './config.js';

import loadFunc, { Func } from '#func';
import loadScrap, { Scrap } from '#scrap';
import loadUtils, { Utils } from '#utils';
await loadFunc();
await loadScrap();
await loadUtils();

import { Database, Store, connectCloudDB } from './lib/Database.js';
import { delay, jidNormalizedUser, makeWASocket, useMultiFileAuthState } from 'baileys';
import { mkdir } from 'fs/promises';
import { join } from 'path';
import pino from 'pino';
import NodeCache from 'node-cache';

import { BOT } from './lib/Constants.js';
import { scanDirectory } from './lib/Watcher.js';
import Listener from './lib/Listener.js';
import SholatReminder from './lib/Components/SholatReminder.js';
import { startMaintenance } from './lib/Components/Maintenance.js';
import { registerAllEvents } from './lib/Event.js';

// ================================
//  KONFIGURASI & PATH
// ================================
const DATABASE_PATH = join(process.cwd(), global.databaseFilename || 'database.json');
const STORE_PATH = join(process.cwd(), global.storeFilename || 'store.json');
const TEMPORARY_FOLDER_PATH = join(process.cwd(), global.temporaryFolder || 'temp');
const authFolder = global.authFolder || 'auth';

// Variabel Global File
let db, store, listener, sholatReminder;

// ================================
//  CACHE
// ================================
const groupCache = new NodeCache({ stdTTL: 5 * 60, useClones: false });
const processedMessages = new NodeCache({ stdTTL: 30, useClones: false });
const msgRetryCounterCache = new NodeCache({ stdTTL: 60, useClones: false });

// ================================
//  FUNGSI SOCKET UTAMA (KONEKSI WA)
// ================================
const Socket = async () => {
  const { state, saveCreds } = await useMultiFileAuthState(authFolder);

  const sock = listener.bind(
    makeWASocket({
      version: [2, 3000, 1045276459],
      logger: pino({ level: 'silent' }),
      printQRInTerminal: !global.pairingCode,
      shouldIgnoreJid: (jid) => typeof jid === 'string' && jid.endsWith(BOT),
      syncFullHistory: true,
      generateHighQualityLinkPreview: false,
      cachedGroupMetadata: async (jid) => {
        const cached = groupCache.get(jid);
        if (cached) return cached;
        try {
          const metadata = await sock.groupMetadata(jid);
          groupCache.set(jid, metadata);
          return metadata;
        } catch {
          return undefined;
        }
      },
      getMessage: (key) => store.getMessage({ chat: key.remoteJid, id: key.id }),
      auth: { creds: state.creds, keys: state.keys },
      msgRetryCounterCache,
    })
  );

  sock.ev.on('creds.update', saveCreds);

  // ---- DAFTARKAN SEMUA EVENT ----
  registerAllEvents(sock, {
    authFolder,
    db,
    store,
    listener,
    sholatReminder,
    groupCache,
    processedMessages,
    reconnectFn: Socket,
  });

  return sock;
};

// ================================
//  SETUP & MAINTENANCE (TITIK AWAL)
// ================================
const Setup = async () => {
  console.log('🔄 Memulai bot Starseed...');

  // 1. CLOUD DB
  if (global.databaseUrl) {
    await connectCloudDB(global.databaseUrl);
  }

  // 2. DATABASE & STORE
  db = Database(DATABASE_PATH);
  global.db = db;
  store = Store(STORE_PATH);

  // 3. MUAT DATA
  console.log('📦 Memuat data pengguna & grup...');
  await Promise.all([db.readFromFile(), store.readFromFile()]);
  console.log(`✅ Data berhasil dimuat: ${db.users?.size || 0} User, ${db.groups?.size || 0} Grup.`);

  // 4. LISTENER & REMINDER
  listener = Listener(db, store);
  sholatReminder = SholatReminder(db);

  // 5. FOLDER & PLUGINS
  await scanDirectory(global.pluginsFolder || './plugins');
  await mkdir(TEMPORARY_FOLDER_PATH, { recursive: true });
  global._connectedAt = Date.now();

  // 6. JALANKAN SOCKET
  Socket();

  // 7. MAINTENANCE BACKGROUND
  startMaintenance({
    db,
    store,
    temporaryFolderPath: TEMPORARY_FOLDER_PATH,
    sessionFolderPath: join(process.cwd(), authFolder)
  });

  // 8. GRACEFUL SHUTDOWN
  const shutdown = async () => {
    try {
      await Promise.all([db?.flushNow?.(), store?.flushNow?.()]);
    } catch (error) {
      console.error('⚠️ Gagal flush saat shutdown:', error?.message);
    }
    process.exit(0);
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
};

// JALANKAN SETUP
Setup();