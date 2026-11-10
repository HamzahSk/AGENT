import { existsSync } from 'fs';
import { mkdir, readdir, copyFile, readFile, writeFile, rm } from 'fs/promises';
import { join } from 'path';

/**
 * Helper untuk mengelola folder sessionbackup.
 *
 * Struktur:
 *   sessionbackup/
 *     ├── creds#Uses.json          ← backup otomatis dari session aktif
 *     ├── creds#Logout.json        ← backup saat logout terdeteksi
 *     ├── creds#Failed.json        ← backup saat reconnect gagal
 *     └── creds.json               ← (opsional) backup MANUAL dari user
 *
 * Aturan:
 *   - Jika folder sessionbackup TIDAK ada → semua fungsi no-op (tidak diapa-apakan).
 *   - Jika user menaruh creds.json manual → dipakai saat session utama gagal.
 *   - Setiap siklus penting (connect/logout/failed) → copy creds.json aktif
 *     ke sessionbackup/creds#<Tag>.json.
 */

const BACKUP_FOLDER = () => global.sessionBackupFolder || 'sessionbackup';
const SESSION_FOLDER = () => global.authFolder || 'auth';

const backupDir = () => join(process.cwd(), BACKUP_FOLDER());
const sessionDir = () => join(process.cwd(), SESSION_FOLDER());

// Tag yang tidak boleh dipakai sebagai nama manual
const RESERVED_TAGS = ['Uses', 'Logout', 'Failed', 'Conflict'];

export const sessionBackup = {
  /** Apakah folder sessionbackup ada? */
  exists() {
    return existsSync(backupDir());
  },

  /** Path lengkap folder backup */
  path() {
    return backupDir();
  },

  /**
   * Ambil creds.json backup manual dari user (kalau ada).
   * Mengabaikan file bertanda # (yang dibuat otomatis).
   * @returns {Promise<string|null>} path ke file backup manual, atau null
   */
  async getManualBackup() {
    if (!this.exists()) return null;
    const dir = backupDir();

    let files;
    try {
      files = await readdir(dir);
    } catch {
      return null;
    }

    // Cari creds.json atau creds*.json yang TIDAK bertanda '#'
    const manual = files.find(
      (f) =>
        f.endsWith('.json') &&
        !f.includes('#') &&
        !f.startsWith('.') &&
        (f === 'creds.json' || f.startsWith('creds'))
    );

    return manual ? join(dir, manual) : null;
  },

  /**
   * Backup session aktif ke sessionbackup/creds#<Tag>.json
   * @param {string} tag - 'Uses' | 'Logout' | 'Failed' | 'Conflict' | custom
   */
  async backupActive(tag = 'Uses') {
    if (!this.exists()) return false;

    const srcCreds = join(sessionDir(), 'creds.json');
    if (!existsSync(srcCreds)) return false;

    const safeTag = RESERVED_TAGS.includes(tag) ? tag : 'Custom';
    const dst = join(backupDir(), `creds#${safeTag}.json`);

    try {
      await copyFile(srcCreds, dst);
      console.log(`📦 Session backup tersimpan: creds#${safeTag}.json`);
      return true;
    } catch (err) {
      console.error(`❌ Gagal backup session (${safeTag}):`, err.message);
      return false;
    }
  },

  /**
   * Restore session dari backup manual (creds.json di folder sessionbackup)
   * ke folder session aktif. File lain (pre-key, session-*, dll) akan dibuat
   * ulang oleh Baileys dari creds.json.
   *
   * @returns {Promise<boolean>} true jika restore berhasil
   */
  async restoreFromManualBackup() {
    const manualBackup = await this.getManualBackup();
    if (!manualBackup) {
      console.log('ℹ️  Tidak ada backup manual di folder sessionbackup.');
      return false;
    }

    try {
      const dir = sessionDir();
      if (!existsSync(dir)) await mkdir(dir, { recursive: true });

      // Backup dulu creds.json lama (kalau ada) sebagai #Failed
      const oldCreds = join(dir, 'creds.json');
      if (existsSync(oldCreds)) {
        await copyFile(oldCreds, join(backupDir(), 'creds#Failed.json')).catch(() => {});
      }

      // Hapus file session lama supaya Baileys rebuild dari creds backup
      const files = await readdir(dir).catch(() => []);
      for (const f of files) {
        if (f === 'creds.json') continue;
        if (f.endsWith('.json')) {
          await rm(join(dir, f), { force: true }).catch(() => {});
        }
      }

      // Copy creds backup manual → session aktif
      await copyFile(manualBackup, oldCreds);
      console.log(`♻️  Session direstore dari backup manual: ${manualBackup}`);
      return true;
    } catch (err) {
      console.error('❌ Gagal restore session backup:', err.message);
      return false;
    }
  },

  /**
   * Buat creds.json kosong (memaksa Baileys buat session baru via QR/pairing).
   * Biasanya tidak perlu karena Baileys otomatis buat kalau tidak ada.
   */
  async resetSession() {
    const dir = sessionDir();
    try {
      await rm(dir, { recursive: true, force: true });
      await mkdir(dir, { recursive: true });
      console.log('🆕 Session direset, siap pairing ulang.');
      return true;
    } catch (err) {
      console.error('❌ Gagal reset session:', err.message);
      return false;
    }
  },

  /**
   * Simpan penanda agar saat reconnect berikutnya tahu harus pakai backup.
   * (Opsional, dipakai kalau kamu ingin state persist antar proses.)
   */
  async markRestorePending(value = true) {
    if (!this.exists()) return;
    try {
      const flag = join(backupDir(), '.restore_pending');
      if (value) await writeFile(flag, Date.now().toString());
      else await rm(flag, { force: true }).catch(() => {});
    } catch {}
  },

  async isRestorePending() {
    if (!this.exists()) return false;
    try {
      await readFile(join(backupDir(), '.restore_pending'));
      return true;
    } catch {
      return false;
    }
  },
};

export default sessionBackup;