
const ERROR_MESSAGES = [
   'Timed',
   'Error',
   'TypeError',
   'SessionError',
   'ENOENT',
   'ENOSPC',
   'Device logged out',
   'Connection Closed',
   'bad-request',
   'forbidden',
   'terminated',
   'defined',
   'undefined',
   'null',
   'Analysis.',
   'simultaneous',
   'all hosts'
]

// Error yang dianggap transien / tidak fatal — cukup dicatat, JANGAN mematikan
// process. Termasuk seluruh kegagalan pengiriman satu pesan (contoh:
// "Invalid media type", "Bad Request", koneksi/upload media, dll).
const TRANSIENT_MESSAGES = [
   'invalid media type',
   'bad request',
   'forbidden',
   'not allowed',
   'connection',
   'timed out',
   'etimedout',
   'enotfound',
   'econnreset',
   'econnaborted',
   'enetunreach',
   'epipe',
   'socket hang up',
   '429',
   '403',
   '404'
]

// Deteksi error transien: berdasarkan pesan ATAU status code Boom/HTTP.
const isTransientError = (error) => {
   const message = String(error?.message || error || '').toLowerCase()

   if (TRANSIENT_MESSAGES.some(pattern => message.includes(pattern)))
      return true

   const statusCode = error?.output?.statusCode || error?.statusCode
   if (typeof statusCode === 'number' && (statusCode === 400 || statusCode === 403 || statusCode === 429))
      return true

   return false
}

const patchConsole = (method, { ignore = [], transform } = {}) => {
   const original = console[method]

   console[method] = (...args) => {
      const first = args?.[0]
      const message = String(first?.message || first || '')

      if (ignore.some(pattern => message.includes(pattern))) return

      if (typeof transform === 'function') {
         const result = transform(message, args)
         if (result === false) return
         if (typeof result === 'string')
            return original(result)
      }

      original(...args)
   }
}

patchConsole('info', {
   ignore: [
      'Closing session:',
      'Opening session:',
      'Removing old closed session:',
      'Migrating session to:'
   ]
})

patchConsole('warn', {
   ignore: [
      'Closing stale',
      'Closing open session'
   ]
})

patchConsole('error', {
   ignore: [
      'Bad MAC',
      'Session error:'
   ],
   transform: (message) => {
      if (message.includes('Failed to decrypt'))
         return `🔐 ${message}`
   }
})

process.on('warning', (warning) => {
   if (warning?.name === 'MaxListenersExceededWarning')
      console.warn('⚠️ Potential memory leak detected.')
})

process.on('uncaughtException', (error) => {
   const message = String(error?.code || error || '')

   if (message === 'ENOMEM') {
      console.error('❌ Out of memory, restarting...')
      process.exit(1)
      return
   }

   console.error('❌ Uncaught Exception', ':', error)

   // Error transien (termasuk gagal kirim satu pesan) hanya dicatat,
   // bot tetap berjalan.
   if (isTransientError(error) || ERROR_MESSAGES.some(condition => message.includes(condition)))
      return

   process.exit(1)
})

process.on('unhandledRejection', (reason) => {
   // Log-only ANTI-CRASH: kegagalan promise (mis. satu sendMessage) TIDAK
   // boleh mematikan process Node.js. Cukup dicatat agar bisa diinvestigasi.
   const message = String(reason?.message || reason || '')

   if (isTransientError(reason)) {
      console.warn('⚠️ Unhandled Rejection (transien, diabaikan):', message)
      return
   }

   console.error('❌ Unhandled Rejection', ':', reason)
})