import { pluginLifecycle } from './Watcher.js';
import { delay, jidNormalizedUser } from 'baileys';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { onEvent, reportError, createTaskQueue, positiveInt } from './Runtime.js';

export function registerConnectionEvent(sock, ctx) {
  let disposed = false, pairing = false, opened = false;
  const timers = new Set();
  const later = (fn, ms) => {
    const timer = setTimeout(() => {
      timers.delete(timer);
      if (!disposed) Promise.resolve().then(fn).catch(error => reportError('Connection task', error));
    }, ms);
    timer.unref?.();
    timers.add(timer);
  };
  const off = onEvent(sock.ev, 'connection.update', async update => {
    if (disposed) return;
    const { connection, lastDisconnect, qr } = update;
    if (qr && global.pairingCode && !sock.authState.creds.registered && !pairing) {
      pairing = true;
      try {
        const phone = String(global.botNumber || '').replace(/\D/g, '');
        if (!/^[1-9]\d{5,14}$/.test(phone)) throw new Error('Configure an international botNumber before pairing');
        if (!process.stdout.isTTY) throw new Error('Pairing requires a private interactive terminal');
        const code = await sock.requestPairingCode(phone, 'STARSEED');
        if (!disposed) console.log('Pairing code:', code);
      } catch (error) { reportError('Pairing (check botNumber and private terminal)', error); }
    }
    if (qr && !global.pairingCode && process.stdout.isTTY) {
      const { default: QRCode } = await import('qrcode');
      const value = await QRCode.toString(qr, { type: 'terminal', small: true });
      if (!disposed) console.log(value);
    }
    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode ?? lastDisconnect?.error?.statusCode;
      await ctx.connectionManager.disconnected(sock, code);
      return;
    }
    if (connection === 'open' && !opened) {
      opened = true;
      sock.user.decodedId = jidNormalizedUser(sock.user.id);
      sock.user.decodedLid = jidNormalizedUser(sock.user.lid || '');
      global._connectedAt = Date.now();
      ctx.connectionManager.opened(sock);
      await pluginLifecycle('onConnect', sock);
      console.log('WhatsApp connected');
      const flag = join(process.cwd(), 'storage', '.auto_action_done');
      if (!existsSync(flag) && (global.autoNewsletters?.length || global.autoGroups?.length)) later(async () => {
        for (const nl of global.autoNewsletters || []) { if (disposed) return; await sock.newsletterFollow(nl + '@newsletter'); }
        for (const group of global.autoGroups || []) { if (disposed) return; await sock.groupAcceptInvite(group); }
        await mkdir(join(process.cwd(), 'storage'), { recursive: true });
        await writeFile(flag, String(Date.now()));
      }, 8000);
      later(() => ctx.sholatReminder.start(sock), 3000);
    }
  });
  return () => { disposed = true; off(); for (const timer of timers) clearTimeout(timer); timers.clear(); };
}

// ================================
//  GROUP EVENT
// ================================
export function registerGroupEvent(sock, ctx) {
  const { db, store, listener, groupCache } = ctx;

  const offGroups = onEvent(sock.ev, 'groups.update', async (groups) => {
    for (const group of groups) {
      if (group.id) groupCache.del(group.id);
      if (store.hasGroup(group.id))
        store.setGroup(group.id, Object.assign(store.getGroup(group.id) || {}, group));
      else
        store.setGroup(group.id, group);
    }
  });

  const offParticipants = onEvent(sock.ev, 'group-participants.update', async ({ id, author, participants, action }) => {
    groupCache.del(id);
    return ctx.queue.add(id, async () => {
    if (Date.now() - (global._connectedAt || 0) < 15000) return;
    const botIds = new Set([jidNormalizedUser(sock.user.id), jidNormalizedUser(sock.user.lid || '')]);
    const isBotAdded = action === 'add' && participants.some(p =>
      [typeof p === 'string' ? p : p.id, p.phoneNumber].some(id => id && botIds.has(jidNormalizedUser(id))));

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

    for (const participant of participants) {
      try { await listener.participant({ id, author, participant, action }); }
      catch (error) { reportError('Participant', error); }
    }
    });
  });
  return () => { offGroups(); offParticipants(); };
}

// Notification batches may overlap. Queue by chat and bound total pending work.
export function registerMessageEvent(sock, ctx) {
  const { db, store, listener, processedMessages, queue } = ctx;
  let lastOverloadLog = 0;
  return onEvent(sock.ev, 'messages.upsert', async ({ messages = [], type }) => {
    if (type !== 'notify' && type !== 'append') return;
    const jobs = [];
    for (const msg of messages) {
      if (!msg?.key?.id || !msg.key.remoteJid || !msg.message) continue;
      if (type === 'append') {
        if (msg.key.fromMe) store.setMessage({ ...msg, chat: msg.key.remoteJid, id: msg.key.id });
        continue;
      }
      const timestamp = Number(msg.messageTimestamp?.toNumber?.() ?? msg.messageTimestamp ?? 0) * 1000;
      if (timestamp && Date.now() - timestamp > 5 * 60 * 1000) continue;
      const key = `${msg.key.remoteJid}:${msg.key.participant || ''}:${msg.key.id}`;
      if (processedMessages.has(key)) continue;
      try { processedMessages.set(key, true); }
      catch (error) { reportError('Deduplication capacity', error); continue; }
      jobs.push(queue.add(msg.key.remoteJid, async () => {
        if (msg.key.remoteJid === 'status@broadcast') {
          const setting = db.getSetting();
          if (setting.autoReadSW?.enabled || setting.readMessage) await sock.readMessages([msg.key]);
          if (!msg.key.fromMe && (setting.autoReactSW?.enabled || setting.reactStatus) && msg.key.participant)
            await sock.sendMessage('status@broadcast', { react: { text: setting.autoReactSW?.emoji || '🔥', key: msg.key } }, { statusJidList: [msg.key.participant] });
          return;
        }
        await listener.message(msg);
      }).catch(error => {
        if (error.code === 'QUEUE_FULL') {
          processedMessages.del(key);
          if (Date.now() - lastOverloadLog < 30000) return;
          lastOverloadLog = Date.now();
        }
        reportError('Message handling', error);
      }));
    }
    await Promise.all(jobs);
  });
}

export function registerCallEvent(sock, ctx) {
  return onEvent(sock.ev, 'call', async calls => {
    for (const call of calls) {
      try {
        if (global.antiCall && call.status === 'offer') {
          await sock.rejectCall(call.id, call.from);
          if (global.blockIfCall) await sock.updateBlockStatus(call.from, 'block');
        } else await ctx.listener.call(call);
      } catch (error) { reportError('Call', error); }
    }
  });
}

export function registerPresenceEvent(sock, ctx) {
  return onEvent(sock.ev, 'presence.update', async ({ id, presences = {} }) => {
    for (const presence of Object.keys(presences)) {
      try { await ctx.queue.add(id, () => ctx.listener.presence({ id, presence, presences })); }
      catch (error) { reportError('Presence', error); }
    }
  });
}

export function registerAllEvents(sock, ctx) {
  const queue = createTaskQueue({
    concurrency: positiveInt(global.messageConcurrency, 2, 8),
    maxPending: positiveInt(global.messageQueueLimit, 100, 1000)
  });
  ctx = { ...ctx, queue };
  const disposers = [registerConnectionEvent(sock, ctx), registerGroupEvent(sock, ctx),
    registerMessageEvent(sock, ctx), registerCallEvent(sock, ctx), registerPresenceEvent(sock, ctx)];
  return async () => { disposers.forEach(dispose => dispose()); await queue.close(); };
}
