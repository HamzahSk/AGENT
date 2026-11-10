import { readdir, stat, unlink } from 'fs/promises'
import { join } from 'path'

import { INACTIVE_THRESHOLD, TEMP_THRESHOLD } from '../Constants.js'
import { Func } from '#func'

/**
 * Maintenance tasks berjalan di background (dipanggil dari socket.js):
 *  - Tugas harian: bersihkan user/grup tidak aktif, reset limit & energi
 *  - Autosave database + guard memori (kirim sinyal 'reset' via IPC)
 *  - Pembersih berkala folder temp
 *  - Pembersih berkala folder session (auth) — JANGAN hapus creds.json
 *  - Garbage collector manual (jika runtime mengekspos global.gc)
 */

// ==========================================
//  AUTO CLEAN SESSION (AUTH FOLDER)
// ==========================================
// File yang WAJIB dipertahankan (tidak boleh dihapus, apapun usianya)
const PROTECTED_SESSION_FILES = new Set([
   'creds.json',
   'creds.json.bak',
   'creds.json.temp',
])

// File yang boleh dibersihkan bila sudah kadaluarsa
// Pola nama file Baileys yang aman untuk dihapus (bukan state utama):
const CLEANABLE_PATTERNS = [
   /^pre-key-\d+\.json$/,
   /^session-\d+\.json$/,
   /^sender-key-\d+\.json$/,
   /^sender-key-memory-\d+\.json$/,
   /^sender-key-.*\.json$/,
   /^app-state-sync-key-.*\.json$/,
   /^app-state-sync-version-.*\.json$/,
]

// Umur maksimum file session sebelum dianggap sampah.
// Default: 30 menit (mengikuti permintaan).
const SESSION_FILE_MAX_AGE_MS = () => global.sessionFileMaxAge ?? 30 * 60 * 1000

/**
 * Membersihkan file session lama di folder auth.
 * - creds.json (dan varian backupnya) DIJAMIN tidak dihapus.
 * - Hanya file dengan pola CLEANABLE_PATTERNS yang dipertimbangkan.
 * - File yang masih "fresh" (mtime < SESSION_FILE_MAX_AGE_MS) dipertahankan.
 *
 * @param {string} sessionFolder - path folder auth/session
 * @returns {Promise<{scanned:number, removed:number, skipped:number}>}
 */
export const cleanSessionFolder = async (sessionFolder) => {
   const result = { scanned: 0, removed: 0, skipped: 0 }
   if (!sessionFolder) return result

   let files
   try {
      files = await readdir(sessionFolder)
   } catch {
      // Folder belum ada — tidak masalah
      return result
   }

   const now = Date.now()
   const maxAge = SESSION_FILE_MAX_AGE_MS()

   for (const fileName of files) {
      // Proteksi mutlak: jangan pernah sentuh creds.json & backup-nya
      if (PROTECTED_SESSION_FILES.has(fileName)) {
         result.skipped++
         continue
      }

      // Hanya proses file yang cocok dengan pola sampah session
      if (!CLEANABLE_PATTERNS.some((rx) => rx.test(fileName))) {
         result.skipped++
         continue
      }

      const filePath = join(sessionFolder, fileName)
      try {
         const st = await stat(filePath)

         // Lewati direktori (jaga-jaga)
         if (!st.isFile()) {
            result.skipped++
            continue
         }

         result.scanned++

         if (now - st.mtimeMs > maxAge) {
            await unlink(filePath)
            result.removed++
         } else {
            result.skipped++
         }
      } catch (err) {
         // File mungkin sudah hilang / sedang di-rename oleh Baileys → abaikan
         if (err?.code !== 'ENOENT') {
            console.error(`❌ Gagal memproses session file ${fileName}:`, err.message)
         }
      }
   }

   return result
}

// ==========================================
//  START MAINTENANCE
// ==========================================
export const startMaintenance = ({ db, store, temporaryFolderPath, sessionFolderPath }) => {
   // -------- TUGAS HARIAN --------
   const scheduleDailyTasks = () => {
      const resetTimeout = Func.getNextMidnight()
      setTimeout(() => {
         const timestampMs = Date.now()
         const threshold = timestampMs - INACTIVE_THRESHOLD
         const setting = db?.getSetting()
         if (setting) {
            for (const [id, user] of db.users) {
               const isProtected = user.banned || user.premiumExpiry > 0 || user.limit >= 200
               if (!isProtected && user.lastSeen < threshold) db.deleteUser(id)
            }
            for (const [id, group] of db.groups)
               if (group.lastActivity < threshold) {
                  store.deleteGroup(id)
                  db.deleteGroup(id)
               }
            for (const user of db.users.values()) {
               if (user.limit < (global.defaultLimit || 50)) user.limit = global.defaultLimit || 50
               user.energy = 100
            }
            setting.lastReset = timestampMs
            store.prune?.()
            db.requestWrite?.()
         }
         scheduleDailyTasks()
      }, resetTimeout)
      console.log('🔃 Tugas harian dijadwalkan dalam', ':', Func.toTime(resetTimeout))
   }
   scheduleDailyTasks()

   // -------- GARBAGE COLLECTOR --------
   if (global.gc) {
      setInterval(() => {
         global.gc()
         console.log('🧹 Garbage collector dipanggil, memori dibersihkan')
      }, global.gcInterval || 60000)
   }

   // -------- AUTOSAVE DATABASE + MEMORY GUARD --------
   const dataInterval = global.dataInterval || 30000
   const rssLimit = global.rssLimit || 1024 * 1024 * 500
   const check = setInterval(async () => {
      if (db && store) {
         await db.flush()
         await store.flush()
      }
      if (process.memoryUsage().rss >= rssLimit) {
         clearInterval(check)
         await Promise.all([db?.flushNow?.(), store?.flushNow?.()]).catch(() => {})
         process.send('reset')
      }
   }, dataInterval)

   // -------- PEMBERSIH FOLDER TEMP --------
   const temporaryFileInterval = global.temporaryFileInterval || 3600000
   setInterval(async () => {
      try {
         const timestampMs = Date.now()
         const temporaryFiles = await readdir(temporaryFolderPath)
         let removedFiles = 0
         for (const fileName of temporaryFiles) {
            const filePath = join(temporaryFolderPath, fileName)
            const fileStatistic = await stat(filePath)
            if (timestampMs - fileStatistic.mtimeMs > TEMP_THRESHOLD) {
               await unlink(filePath)
               removedFiles++
            }
         }
         if (removedFiles > 0) console.log('🗑️ Membersihkan folder temp:', removedFiles, 'file dihapus')
      }
      catch (error) {
         console.error('❌ Gagal membersihkan folder temp:', error.message)
      }
   }, temporaryFileInterval)

   // -------- PEMBERSIH FOLDER SESSION (AUTH) --------
   // Setiap 30 menit (bisa dioverride lewat global.sessionCleanInterval)
   const sessionCleanInterval = global.sessionCleanInterval || 30 * 60 * 1000
   if (sessionFolderPath) {
      setInterval(async () => {
         try {
            const { removed } = await cleanSessionFolder(sessionFolderPath)
            if (removed > 0)
               console.log(`🧹 Session clean: ${removed} file sampah dihapus (creds.json aman)`)
         } catch (error) {
            console.error('❌ Gagal membersihkan folder session:', error.message)
         }
      }, sessionCleanInterval)

      console.log(
         `🧼 Auto-clean session aktif (interval: ${(sessionCleanInterval / 60000).toFixed(1)} menit, creds.json dilindungi)`
      )
   }
}