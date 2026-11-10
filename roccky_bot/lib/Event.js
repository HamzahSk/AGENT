import { Boom } from '@hapi/boom';
import { delay, DisconnectReason, jidNormalizedUser } from 'baileys';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import readline from 'readline';
import { Func } from '#func';
import sessionBackup from './SessionBackup.js';

// ================================
//  WATCHDOG & STATE
// ================================
let lastMessageReceived = Date.now();
let watchdogTimer = null;
const WATCHDOG_TIMEOUT = 30 * 60 * 1000;
const WATCHDOG_CHECK_INTERVAL = 60 * 1000;

let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
const MAX_CONFLICT_ATTEMPTS = 3;

// Jeda 1 menit sebelum mencoba restore / reconnect saat logout/failed
const SESSION_RETRY_DELAY = 60 * 1000;

// ================================
//  READLINE (PAIRING)
// ================================
let rl = null;
function createReadlineInterface() {
  if (rl) rl.close();
  rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return rl;
}
function askQuestion(question) {
  return new Promise((resolve) => {
    const rlIntf = createReadlineInterface();
    rlIntf.question(question, (answer) => {
      rlIntf.close();
      resolve(answer.trim());
    });
  });
}

// ================================
//  WATCHDOG FUNCTIONS
// ================================
export function startWatchdog(reconnectFn) {
  if (watchdogTimer) clearInterval(watchdogTimer);
  lastMessageReceived = Date.now();
  watchdogTimer = setInterval(() => {
    const silentMs = Date.now() - lastMessageReceived;
    if (silentMs > WATCHDOG_TIMEOUT) {
      console.error('❌ Watchdog: Tidak ada pesan dalam 30 menit, restart koneksi...');
      reconnectFn().catch(console.error);
    }
  }, WATCHDOG_CHECK_INTERVAL);
  if (watchdogTimer.unref) watchdogTimer.unref();
  console.log('🐕 Watchdog aktif (batas 30 menit tanpa pesan)');
}

export function stopWatchdog() {
  if (watchdogTimer) {
    clearInterval(watchdogTimer);
    watchdogTimer = null;
  }
}

export function touchWatchdog() {
  lastMessageReceived = Date.now();
}

// ================================
//  CONNECTION EVENT
// ================================
export function registerConnectionEvent(sock, ctx) {
  const { authFolder, db, store, sholatReminder, reconnectFn } = ctx;
  let isRestarting = false;

  const usePairingCode = global.pairingCode === true;
  const pairingNumber = global.botNumber?.toString() || '';

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr, receivedPendingNotifications } = update;

    // ---- PAIRING CODE ----
    if (connection === 'connecting' && usePairingCode && !sock.authState.creds.registered) {
      let phoneNumber = pairingNumber.replace(/\D/g, '');
      if (!phoneNumber) {
        console.log('\n⚠️  Nomor pairing belum diatur di config.js');
        phoneNumber = await askQuestion('📱 Masukkan nomor WhatsApp (contoh: 6281234567890): ');
        phoneNumber = phoneNumber.replace(/\D/g, '');
      }

      const { default: PhoneNumber } = await import('awesome-phonenumber');
      if (!PhoneNumber('+' + phoneNumber).isValid()) {
        console.error('❌ Nomor tidak valid, proses pairing dibatalkan.');
        process.exit(0);
      }

      console.log(`🔑 Meminta kode pairing untuk ${phoneNumber}...`);
      await delay(3000);
      try {
        const code = await sock.requestPairingCode(phoneNumber, 'STARSEED');
        if (!code) throw new Error('Pairing code kosong');
        const prettyCode = code.length >= 8 ? code.match(/.{1,4}/g)?.join('-') : code;
        console.log('\n' + '='.repeat(35));
        console.log(`🔗 PAIRING CODE : ${prettyCode}`);
        console.log('='.repeat(35) + '\n');
      } catch (err) {
        console.error('❌ Gagal mendapatkan pairing code:', err.message);
      }
    }

    // ---- QR CODE ----
    if (qr && !usePairingCode) {
      const { default: QRCode } = await import('qrcode');
      QRCode.toString(qr, { type: 'terminal', small: true }, (err, string) => {
        if (!err && string) {
          console.log(string);
          console.log('📱 Scan QR code di WhatsApp > Perangkat Tertaut');
        }
      });
    }

    // ---- CLOSE ----
    if (connection === 'close') {
      const statusCode = new Boom(lastDisconnect?.error)?.output?.statusCode;
      const reason = lastDisconnect?.error?.message || 'Unknown reason';
      stopWatchdog();
      if (isRestarting) return;
      isRestarting = true;

      const cleanupAndExit = async (msg) => {
        console.error(msg);
        try { await Promise.all([db?.flushNow?.(), store?.flushNow?.()]); } catch {}
        try { await Func.cleanUpFolder(authFolder); } catch {}
        process.exit(1);
      };

      // =====================================================
      //  LOGOUT / 401
      //  Alur:
      //   1. Backup session aktif sebagai #Logout
      //   2. Tunggu 1 menit
      //   3. Coba pakai sessionbackup manual
      //   4. Kalau tidak ada → reset session (buat baru)
      // =====================================================
      if (statusCode === DisconnectReason.loggedOut || statusCode === 401) {
        console.warn(`🔐 Sesi Logout (${statusCode}): ${reason}`);
        try { await Promise.all([db?.flushNow?.(), store?.flushNow?.()]); } catch {}

        // 1) Backup session aktif (kalau folder backup ada)
        await sessionBackup.backupActive('Logout');

        console.log('⏳ Menunggu 1 menit sebelum mencoba memulihkan sesi...');
        await delay(SESSION_RETRY_DELAY);

        // 2) Coba restore dari backup manual
        if (sessionBackup.exists()) {
          const restored = await sessionBackup.restoreFromManualBackup();
          if (restored) {
            console.log('🔄 Session berhasil direstore. Reconnect...');
            isRestarting = false;
            return reconnectFn();
          }
          console.log('ℹ️  Tidak ada backup manual yang bisa dipakai.');
        } else {
          console.log('ℹ️  Folder sessionbackup tidak ada, lewati restore.');
        }

        // 3) Tidak ada backup → reset session (paksa pairing baru)
        console.log('🆕 Tidak ada backup, reset session dan buat ulang...');
        try { await Func.cleanUpFolder(authFolder); } catch {}
        isRestarting = false;
        return reconnectFn();
      }

      // =====================================================
      //  CONFLICT (440)
      // =====================================================
      if (statusCode === DisconnectReason.connectionReplaced || statusCode === 440) {
        console.warn(`⚠️ Konflik Sesi: Terdeteksi dijalankan di tempat lain.`);
        await sessionBackup.backupActive('Conflict');

        if (reconnectAttempts < MAX_CONFLICT_ATTEMPTS) {
          reconnectAttempts++;
          console.log(`🔄 Mencoba menyambung kembali (${reconnectAttempts}/${MAX_CONFLICT_ATTEMPTS}) dalam 10 detik...`);
          setTimeout(() => { isRestarting = false; reconnectFn(); }, 10000);
        } else {
          await cleanupAndExit('❌ Konflik terus-menerus. Mematikan bot untuk keamanan.');
        }
        return;
      }

      // =====================================================
      //  RECONNECT UMUM (timeout, dsb)
      // =====================================================
      if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        reconnectAttempts++;
        const delayMs = 15000;
        console.log(`🔄 Terputus (${statusCode}): ${reason}. Reconnect ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS} dalam ${delayMs / 1000}s...`);
        setTimeout(() => { isRestarting = false; reconnectFn(); }, delayMs);
      } else {
        // Sudah gagal berkali-kali → anggap "failed"
        console.error('❌ Gagal menyambung ulang setelah batas percobaan maksimal.');

        // Backup session sebagai #Failed
        await sessionBackup.backupActive('Failed');

        console.log('⏳ Menunggu 1 menit sebelum mencoba restore dari backup...');
        await delay(SESSION_RETRY_DELAY);

        if (sessionBackup.exists()) {
          const restored = await sessionBackup.restoreFromManualBackup();
          if (restored) {
            console.log('🔄 Session direstore dari backup. Reconnect...');
            reconnectAttempts = 0;
            isRestarting = false;
            return reconnectFn();
          }
          console.log('ℹ️  Tidak ada backup manual. Reset session dan pairing ulang...');
        }

        try { await Func.cleanUpFolder(authFolder); } catch {}
        reconnectAttempts = 0;
        isRestarting = false;
        return reconnectFn();
      }
    }

    // ---- OPEN ----
    if (connection === 'open') {
      reconnectAttempts = 0;
      isRestarting = false;
      const userJid = jidNormalizedUser(sock.user.id);
      console.log(`✅ Terhubung sebagai: ${sock.user?.name || global.botName} (${userJid})`);
      startWatchdog(reconnectFn);

      // Backup session aktif sebagai #Uses (kalau folder backup ada)
      await sessionBackup.backupActive('Uses');

      const autoActionFlag = join(process.cwd(), 'storage', '.auto_action_done');
      if (!existsSync(autoActionFlag)) {
        setTimeout(async () => {
          try {
            for (const nl of (global.autoNewsletters || [])) await sock.newsletterFollow(nl + '@newsletter').catch(() => {});
            for (const g of (global.autoGroups || [])) await sock.groupAcceptInvite(g).catch(() => {});
            const storageDir = join(process.cwd(), 'storage');
            if (!existsSync(storageDir)) mkdirSync(storageDir, { recursive: true });
            writeFileSync(autoActionFlag, Date.now().toString());
            console.log('✅ Auto-join selesai');
          } catch (e) { console.error('Auto-join error:', e); }
        }, 8000);
      }

      await delay(3000);
      await sholatReminder.start(sock);
      console.log('🟢 Bot siap digunakan');
    }

    if (receivedPendingNotifications) {
      console.log(`🕒 Sinkronisasi pesan lama, harap tunggu...`);
      sock.ev.flush();
    }
  });
}

// ================================
//  GROUP EVENT
// ================================
export function registerGroupEvent(sock, ctx) {
  const { db, store, listener, groupCache } = ctx;

  sock.ev.on('groups.update', async (groups) => {
    for (const group of groups) {
      if (group.id) groupCache.set(group.id, { ...groupCache.get(group.id), ...group });
      if (store.hasGroup(group.id))
        store.setGroup(group.id, Object.assign(store.getGroup(group.id) || {}, group));
      else
        store.setGroup(group.id, group);
    }
  });

  sock.ev.on('group-participants.update', async ({ id, author, participants, action }) => {
    if (Date.now() - (global._connectedAt || 0) < 15000) return;
    const botNumber = sock.user.id.split(':')[0] || sock.user.id.split('@')[0];
    const isBotAdded = action === 'add' && participants.some(p => p.includes(botNumber));

    if (isBotAdded) {
      const sewaEnabled = db.getSetting()?.sewa?.enabled || false;
      if (sewaEnabled) {
        const groupSewa = db.getGroup(id)?.sewa;
        const isWhitelisted = groupSewa && (groupSewa.isLifetime || groupSewa.expiredAt > Date.now());
        if (!isWhitelisted) {
          await sock.sendMessage(id, { text: '⛔ Grup tidak terdaftar dalam sistem sewa, bot akan keluar.' });
          await delay(2000);
          await sock.groupLeave(id);
          console.log(`🚪 Auto-left non-sewa group: ${id}`);
          return;
        }
      }

      const inviter = author || '';
      const inviterMention = inviter ? `@${inviter.split('@')[0]}` : 'seseorang';
      let groupName = 'grup ini';
      try {
        const meta = await sock.groupMetadata(id);
        groupName = meta.subject;
      } catch {}

      const prefix = global.commandPrefix || '.';
      const welcomeText = `👋 *Halo!* Terima kasih sudah mengundangku ke *${groupName}*.\nDiundang oleh ${inviterMention}.\n\nKetik \`${prefix}menu\` untuk melihat fitur.`;
      await sock.sendMessage(id, {
        text: welcomeText,
        contextInfo: { mentionedJid: inviter ? [inviter] : [] }
      });
      console.log(`🎉 Bot bergabung ke grup: ${groupName}`);
    }

    for (const participant of participants)
      listener.participant({ id, author, participant, action });
  });
}

// ================================
//  MESSAGE EVENT
// ================================
export function registerMessageEvent(sock, ctx) {
  const { db, listener, processedMessages } = ctx;

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    touchWatchdog();
    if (type !== 'notify' && type !== 'append') return;

    for (const msg of messages) {
      if (processedMessages.has(msg.key.id)) continue;
      processedMessages.set(msg.key.id, true);

      let msgTimestamp = 0;
      if (msg.messageTimestamp) {
        msgTimestamp = (typeof msg.messageTimestamp === 'number' ? msg.messageTimestamp : msg.messageTimestamp.toNumber?.()) * 1000;
        if (Date.now() - msgTimestamp > 5 * 60 * 1000) continue;
      }

      // ---- STATUS BROADCAST ----
      if (msg.key.remoteJid === 'status@broadcast') {
        const autoReadSW = db.getSetting()?.autoReadSW || {};
        const autoReactSW = db.getSetting()?.autoReactSW || {};
        if (autoReadSW.enabled) await sock.readMessages([msg.key]).catch(() => {});
        if (autoReactSW.enabled && msg.key.participant) {
          await sock.sendMessage(
            'status@broadcast',
            { react: { text: autoReactSW.emoji || '🔥', key: msg.key } },
            { statusJidList: [msg.key.participant] }
          ).catch(() => {});
        }
        continue;
      }

      // ---- ANTI CALL ----
      if (global.antiCall && msg.message?.call) {
        await sock.rejectCall(msg.key.id, msg.key.remoteJid);
        if (global.blockIfCall) await sock.updateBlockStatus(msg.key.remoteJid, 'block');
        continue;
      }

      // ---- OWNER EVAL / EXEC ----
      const senderJid = msg.key.participant || msg.key.remoteJid;
      const isOwner = global.owners?.includes(senderJid.split('@')[0]) || false;
      const messageBody = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';

      if (isOwner) {
        if (messageBody.startsWith('=>')) {
          const code = messageBody.slice(2).trim();
          if (code) {
            try {
              const result = await eval(`(async () => { ${code} })()`);
              await sock.sendMessage(
                msg.key.remoteJid,
                { text: `✅ Hasil: ${require('util').inspect(result, { depth: 2 })}` },
                { quoted: msg }
              );
            } catch (err) {
              await sock.sendMessage(msg.key.remoteJid, { text: `❌ Error: ${err.message}` }, { quoted: msg });
            }
          }
          continue;
        }

        if (messageBody.startsWith('$')) {
          const cmd = messageBody.slice(1).trim();
          if (cmd) {
            const { exec } = await import('child_process');
            const { promisify } = await import('util');
            const execAsync = promisify(exec);
            try {
              const { stdout, stderr } = await execAsync(cmd, { timeout: 60000 });
              await sock.sendMessage(
                msg.key.remoteJid,
                { text: `\`\`\`${(stdout || stderr).slice(0, 3500)}\`\`\`` },
                { quoted: msg }
              );
            } catch (err) {
              await sock.sendMessage(msg.key.remoteJid, { text: `❌ ${err.message}` }, { quoted: msg });
            }
          }
          continue;
        }
      }

      listener.message(msg);
    }
  });
}

// ================================
//  CALL EVENT
// ================================
export function registerCallEvent(sock) {
  if (!global.antiCall) return;

  sock.ev.on('call', async (calls) => {
    for (const call of calls) {
      if (call.status === 'offer') {
        await sock.rejectCall(call.id, call.from);
        if (global.blockIfCall) await sock.updateBlockStatus(call.from, 'block');
        console.log(`📞 Tolak panggilan dari ${call.from}`);
      }
    }
  });
}

// ================================
//  PRESENCE EVENT
// ================================
export function registerPresenceEvent(sock, ctx) {
  const { listener } = ctx;

  sock.ev.on('presence.update', async ({ id, presences }) => {
    for (const presence in presences)
      listener.presence({ id, presence, presences });
  });
}

// ================================
//  REGISTER ALL EVENTS (HELPER)
// ================================
export function registerAllEvents(sock, ctx) {
  registerConnectionEvent(sock, ctx);
  registerGroupEvent(sock, ctx);
  registerMessageEvent(sock, ctx);
  registerCallEvent(sock);
  registerPresenceEvent(sock, ctx);
}