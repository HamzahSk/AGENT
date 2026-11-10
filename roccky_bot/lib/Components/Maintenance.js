import { readdir, stat, unlink } from 'fs/promises'
import { join } from 'path'

import { INACTIVE_THRESHOLD, TEMP_THRESHOLD } from '../Constants.js'
import { Func } from '#func'
import { reportError } from '../Runtime.js'
import { connectCloudDB } from '../Database.js'

/**
 * Maintenance tasks berjalan di background (dipanggil dari socket.js):
 *  - Tugas harian: bersihkan user/grup tidak aktif, reset limit & energi
 *  - Autosave database + guard memori (kirim sinyal 'reset' via IPC)
 *  - Pembersih berkala folder temp
 *  - Session keys are never pruned by age.
 *  - Garbage collector manual (jika runtime mengekspos global.gc)
 */

// Compatibility export: Signal and app-state keys have no safe age-based expiry.
// Only Baileys knows when they can be removed.
export const cleanSessionFolder = async () => ({ scanned: 0, removed: 0, skipped: 0 })

// ==========================================
//  START MAINTENANCE
// ==========================================
export const startMaintenance = ({ db, store, temporaryFolderPath, requestRestart = () => {} }) => {
   const timers = new Set()
   let stopped = false, checking = false, cleaning = false, overLimit = 0
   const every = (fn, ms) => { const timer = setInterval(fn, ms); timer.unref?.(); timers.add(timer); return timer }
   // -------- TUGAS HARIAN --------
   const scheduleDailyTasks = () => {
      const resetTimeout = Func.getNextMidnight()
      if (stopped) return
      const timer = setTimeout(() => {
         timers.delete(timer)
         if (stopped) return
         try {
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
         } catch (error) { reportError('Daily maintenance', error) }
         finally { scheduleDailyTasks() }
      }, resetTimeout)
      timer.unref?.()
      timers.add(timer)
      console.log('🔃 Tugas harian dijadwalkan dalam', ':', Func.toTime(resetTimeout))
   }
   scheduleDailyTasks()

   // -------- GARBAGE COLLECTOR --------
   if (global.gc) {
      every(() => {
         global.gc()

      }, global.gcInterval || 60000)
   }

   // -------- AUTOSAVE DATABASE + MEMORY GUARD --------
   const dataInterval = global.dataInterval || 30000
   const rssLimit = global.rssLimit || 1024 * 1024 * 500
   every(async () => {
      if (checking || stopped) return
      checking = true
      try {
         if (global.databaseUrl || process.env.ROCCKY_DATABASE_URL) await connectCloudDB(process.env.ROCCKY_DATABASE_URL ?? global.databaseUrl)
         store.prune?.()
         await Promise.all([db.flush(), store.flush()])
         await Promise.all([db.sync?.(), store.sync?.()])
         overLimit = process.memoryUsage().rss >= rssLimit ? overLimit + 1 : 0
         if (overLimit === 1) global.gc?.()
         if (overLimit >= 3) { overLimit = 0; await requestRestart() }
      } catch (error) { reportError('Maintenance', error) }
      finally { checking = false }
   }, dataInterval)

   // -------- PEMBERSIH FOLDER TEMP --------
   const temporaryFileInterval = global.temporaryFileInterval || 3600000
   every(async () => {
      if (cleaning || stopped) return
      cleaning = true
      try {
         const timestampMs = Date.now()
         const temporaryFiles = await readdir(temporaryFolderPath)
         let removedFiles = 0
         for (const fileName of temporaryFiles) {
            const filePath = join(temporaryFolderPath, fileName)
            const fileStatistic = await stat(filePath)
            if (fileStatistic.isFile() && timestampMs - fileStatistic.mtimeMs > TEMP_THRESHOLD) {
               await unlink(filePath)
               removedFiles++
            }
         }
         if (removedFiles > 0) console.log('🗑️ Membersihkan folder temp:', removedFiles, 'file dihapus')
      }
      catch (error) {
         if (error.code !== 'ENOENT') reportError('Temporary cleanup', error)
      } finally { cleaning = false }
   }, temporaryFileInterval)

   return () => { stopped = true; for (const timer of timers) { clearTimeout(timer); clearInterval(timer) }; timers.clear() }
}
