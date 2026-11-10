// lib/Utils/index.js
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

import { Func } from '#func';

// Re-export named setiap utility agar `import { randomHex } from '#utils'` valid.
export * from './general.js'
export * from './text.js'
export * from './url.js'
export * from './size.js'
export * from './datetime.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Objek utama untuk menampung semua utility umum yang dimuat.
 * @type {Record<string, any>}
 */
export const Utils = {};
let watcherStarted = false;

// Kode Warna ANSI (Bawaan tanpa module)
const colors = {
  bgBlue: '\x1b[44m\x1b[30m',  // Background Biru, Teks Hitam
  blue: '\x1b[34m',            // Teks Biru
  bgRed: '\x1b[41m\x1b[30m',   // Background Merah, Teks Hitam
  red: '\x1b[31m',             // Teks Merah
  bgYellow: '\x1b[43m\x1b[30m',// Background Kuning, Teks Hitam
  yellow: '\x1b[33m',          // Teks Kuning
  reset: '\x1b[0m'             // Reset ke warna default
};

/**
 * Mengimpor file utility dan mem-bypass cache ESM agar mendukung hot-reload.
 * Seluruh named export di-bridge ke namespace `Utils` (#utils) sekaligus ke
 * `Func` (#func) agar kode lama (Func.*) tetap berfungsi tanpa diubah.
 * @param {string} file - Nama file .js yang akan diimpor.
 */
const importFile = async (file) => {
  try {
    const mod = await import(`${pathToFileURL(path.join(__dirname, file)).href}?update=${Date.now()}`);
    Object.assign(Utils, mod);
    Object.assign(Func, mod);
    console.log(`${colors.bgBlue} UTILS ${colors.reset} ${colors.blue}Berhasil dimuat:${colors.reset} ${file}`);
  } catch (e) {
    console.error(`${colors.bgRed} UTILS ${colors.reset} ${colors.red}Gagal memuat:${colors.reset} ${file}\n`, e);
  }
};

/**
 * Memuat semua file utility di direktori saat ini dan menjalankan file watcher.
 * @returns {Promise<typeof Utils>}
 */
export default async function loadUtils() {
  const files = fs.readdirSync(__dirname).filter(f => f.endsWith('.js') && f !== 'index.js').sort();
  for (const f of files) await importFile(f);

  Object.assign(Func, Utils);

  if (!watcherStarted) {
    watcherStarted = true;
    fs.watch(__dirname, async (_, f) => {
      if (!f || !f.endsWith('.js') || f === 'index.js') return;
      console.log(`${colors.bgYellow} UTILS ${colors.reset} ${colors.yellow}Perubahan terdeteksi:${colors.reset} ${f}`);
      await importFile(f);
    });
  }
  return Utils;
}