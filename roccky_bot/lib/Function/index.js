
import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Objek utama untuk menampung semua fungsi yang dimuat.
 * @type {Record<string, any>}
 */
export const Func = {};
let watcherStarted = false;

/**
 * Mengimpor file fungsi dan mem-bypass cache ESM agar mendukung hot-reload.
 * @param {string} file - Nama file .js yang akan diimpor.
 * @returns {Promise<void>}
 */
const importFile = async (file) => {
  try {
    await import(`${pathToFileURL(path.join(__dirname, file)).href}?update=${Date.now()}`);
    console.log(chalk.bgHex('#7C3AED').black(' FUNC '), chalk.hex('#A78BFA')('Berhasil dimuat:'), chalk.white(file));
  } catch (e) {
    console.error(chalk.bgRed.black(' FUNC '), chalk.red('Gagal memuat:'), chalk.white(file), '\n', e);
  }
};

/**
 * Memuat semua file JavaScript di direktori saat ini dan menjalankan file watcher.
 * @returns {Promise<typeof Func>} Objek Func yang berisi kumpulan fungsi yang sudah dimuat.
 */
export default async function loadFunc() {
  const files = fs.readdirSync(__dirname).filter(f => f.endsWith('.js') && f !== 'index.js').sort();
  for (const f of files) await importFile(f);

  if (!watcherStarted) {
    watcherStarted = true;
    fs.watch(__dirname, async (_, f) => {
      if (!f || !f.endsWith('.js') || f === 'index.js') return;
      console.log(chalk.bgYellow.black(' FUNC '), chalk.yellow('Perubahan terdeteksi:'), chalk.white(f));
      await importFile(f);
    });
  }
  return Func;
}
