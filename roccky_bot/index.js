import { spawn } from 'child_process'
import { fileURLToPath } from 'url'
import { startServer } from './AI-SEERVER/api/index.js'

const isBun = typeof Bun !== 'undefined'

const SETUP_PATH = fileURLToPath(
   new URL('./socket.js', import.meta.url)
)

// Counter global untuk menghitung konflik sesi (khusus PM2)
let sessionConflictCounter = 0

// Helper untuk menambahkan waktu di log
const getTimestamp = () => {
   const now = new Date()
   return `[${now.toLocaleDateString('id-ID')} ${now.toLocaleTimeString('id-ID')}]`
}

// ================================
//  ANTI-CRASH GLOBAL (ENTRY POINT)
// ================================
// Kegagalan satu promise (mis. gagal mengirim pesan) tidak boleh mematikan
// launcher. Cukup dicatat (log) tanpa memanggil process.exit().
process.on('unhandledRejection', (reason) => {
   console.error(`${getTimestamp()} ⚠️ [index.js] Unhandled Rejection (tidak mematikan process):`, reason)
})

process.on('uncaughtException', (error) => {
   console.error(`${getTimestamp()} ⚠️ [index.js] Uncaught Exception (tidak mematikan process):`, error)
})

const Banner = () => {
   console.clear()

   const banner = [
      '█▀█ █▀█ █▀▀ █▀▄ █▄█',
      '█▀▄ █▄█ █▄▄ █▄▀  █ '
   ]

   const footer = 'GitHub: https://github.com/itsliaaa/starseed'
   const terminalWidth = process.stdout?.columns || 80

   const toCenter = (text) => {
      const padding = Math.floor((terminalWidth - text.length) / 2)
      return ' '.repeat(Math.max(padding, 0)) + text
   }

   banner.forEach(line => console.log(toCenter(line)))
   console.log('\n' + toCenter(footer))
}

const cleanUp = (instance) => {
   if (!instance) return

   try {
      if (!instance.killed) instance.kill('SIGTERM')
   } catch { }

   try {
      if (instance.connected) instance.disconnect()
   } catch { }

   try {
      instance.stdout?.destroy?.()
      instance.stderr?.destroy?.()
      instance.stdin?.destroy?.()
   } catch { }

   instance.removeAllListeners()
}

const Start = () => {
   const runtime = isBun ? 'bun' : process.execPath

   const args = [
      ...(isBun ? [] : process.execArgv),
      SETUP_PATH,
      ...process.argv.slice(2)
   ]

   console.log(
      `\n${getTimestamp()} 🚀 Starting bot using ${isBun ? 'Bun' : 'Node.js'} runtime...\n`
   )

   // UBAH DISINI: stdio diubah ke 'pipe' agar log-nya bisa kita baca/filter
   const instance = spawn(runtime, args, {
      stdio: ['inherit', 'pipe', 'pipe', 'ipc']
   })

   // Alirkan kembali log ke terminal utama agar PM2 tetap bisa mencatat lognya
   instance.stdout.pipe(process.stdout)
   instance.stderr.pipe(process.stderr)

   // Logika pendeteksi konflik sesi khusus untuk PM2
   const checkSessionConflict = (chunk) => {
      const logText = chunk.toString()
      
      if (logText.includes('Konflik Sesi: Terdeteksi dijalankan di tempat lain.')) {
         sessionConflictCounter++
         console.warn(`\n${getTimestamp()} ⚠️ [PM2 Guard] Konflik sesi terdeteksi (${sessionConflictCounter}/3)`)
         
         if (sessionConflictCounter > 3) {
            console.error(`\n${getTimestamp()} 🔴 [PM2 Guard] Konflik sesi lebih dari 3 kali. Memaksa PM2 untuk restart...`)
            cleanUp(instance)
            process.exit(1) // Keluar dengan error code 1, memicu PM2 untuk merestart total
         }
      }
   }

   // Dengarkan log dari stdout dan stderr
   instance.stdout.on('data', checkSessionConflict)
   instance.stderr.on('data', checkSessionConflict)

   try {
      instance.on('message', (data) => {
         const action = typeof data === 'object' ? data.action : data
         const reason = typeof data === 'object' && data.reason ? data.reason : 'Tidak ada alasan spesifik'

         if (action === 'leak' || action === 'reset') {
            const isLeak = action === 'leak'
            
            const logMessage = isLeak
               ? `${getTimestamp()} ⚠️ RAM limit reached, restarting...`
               : `${getTimestamp()} 🔃 Restarting bot... (Reason: ${reason})`

            console[isLeak ? 'error' : 'log'](logMessage)

            cleanUp(instance)
            setTimeout(Start, 2000)
         }
      })
   } catch {
      console.warn(`${getTimestamp()} ⚠️ IPC messaging is not fully supported on this runtime.`)
   }

   instance.once('error', (error) => {
      console.error(
         `${getTimestamp()} ❌ Unexpected error occurred when starting the bot:\n`,
         error
      )
   })

   instance.once('exit', (code, signal) => {
      let exitReason = ''
      if (signal) {
         exitReason = `dibunuh oleh sistem (Signal: ${signal})`
      } else if (code !== null) {
         exitReason = `berhenti dengan kode error ${code}`
      } else {
         exitReason = `berhenti karena alasan yang tidak diketahui`
      }

      console.error(`${getTimestamp()} ⚠️ Proses bot ${exitReason}.`)

      cleanUp(instance)

      // Jika keluar secara normal (code 0), reset counter konflik sesi
      if (code === 0) {
         sessionConflictCounter = 0
      }

      if (code !== 0) {
         console.log(`${getTimestamp()} 🔄 Auto-restarting dalam 2 detik...\n`)
         setTimeout(Start, 2000)
      }
   })
}

Banner()

if (!isBun) {
   const [MAJOR, MINOR, PATCH] = process.versions.node
      .split('.')
      .map(value => +value.replace(/\D.*$/, ''))

   const unsupported =
      MAJOR < 20 ||
      (MAJOR === 20 && MINOR < 18) ||
      (MAJOR === 20 && MINOR === 18 && PATCH < 1)

   if (unsupported) {
      console.error(
         `\n❌ This script requires Node.js 20.18.1 or above.\n` +
         `   Current version: ${process.versions.node}\n`
      )
      process.exit(1)
   }
}

await startServer({
   port: Number(process.env.AI_SERVER_PORT || process.env.PORT || 8080),
   host: process.env.AI_SERVER_HOST || process.env.HOST || '0.0.0.0'
})

Start()
