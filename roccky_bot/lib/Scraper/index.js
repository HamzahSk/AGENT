// lib/Scraper/index.js
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Objek utama untuk menampung semua fungsi scraper yang dimuat.
 * @type {Record<string, any>}
 */
export const Scrap = {};
let watcherStarted = false;

// Kode Warna ANSI (Bawaan tanpa module)
const colors = {
  bgGreen: '\x1b[42m\x1b[30m', // Background Hijau, Teks Hitam
  green: '\x1b[32m',           // Teks Hijau
  bgRed: '\x1b[41m\x1b[30m',   // Background Merah, Teks Hitam
  red: '\x1b[31m',             // Teks Merah
  bgYellow: '\x1b[43m\x1b[30m',// Background Kuning, Teks Hitam
  yellow: '\x1b[33m',          // Teks Kuning
  reset: '\x1b[0m'             // Reset ke warna default
};

/**
 * Mengimpor file scraper dan mem-bypass cache ESM agar mendukung hot-reload.
 * @param {string} file - Nama file .js yang akan diimpor.
 */
const importFile = async (file) => {
  try {
    await import(`${pathToFileURL(path.join(__dirname, file)).href}?update=${Date.now()}`);
    console.log(`${colors.bgGreen} SCRAP ${colors.reset} ${colors.green}Berhasil dimuat:${colors.reset} ${file}`);
  } catch (e) {
    console.error(`${colors.bgRed} SCRAP ${colors.reset} ${colors.red}Gagal memuat:${colors.reset} ${file}\n`, e);
  }
};

/**
 * Memuat semua file scraper di direktori saat ini dan menjalankan file watcher.
 * @returns {Promise<typeof Scrap>}
 */
export default async function loadScrap() {
  const files = fs.readdirSync(__dirname).filter(f => f.endsWith('.js') && f !== 'index.js').sort();
  for (const f of files) await importFile(f);

  if (!watcherStarted) {
    watcherStarted = true;
    fs.watch(__dirname, async (_, f) => {
      if (!f || !f.endsWith('.js') || f === 'index.js') return;
      console.log(`${colors.bgYellow} SCRAP ${colors.reset} ${colors.yellow}Perubahan terdeteksi:${colors.reset} ${f}`);
      await importFile(f);
    });
  }
  return Scrap;
}
