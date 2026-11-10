import { reportError } from '../Runtime.js'

// libsignal can print complete key records through console methods.
const privatePrefixes = ['Closing session:', 'Opening session:', 'Removing old closed session:', 'Migrating session to:', 'Closing stale', 'Closing open session', 'Session error:', 'Bad MAC']
for (const method of ['log', 'info', 'warn', 'error']) {
   const original = console[method].bind(console)
   console[method] = (...args) => {
      if (privatePrefixes.some(prefix => typeof args[0] === 'string' && args[0].includes(prefix))) return
      original(...args.map(value => value instanceof Error ? `${value.name} (${value.code != null && /^[A-Z_0-9-]+$/i.test(String(value.code)) ? value.code : 'unclassified'})` : value))
   }
}

export const installFatalHandlers = shutdown => {
   let failing = false
   const fatal = error => {
      reportError('Unexpected runtime failure; shutting down', error)
      if (failing) return
      failing = true
      Promise.resolve().then(() => shutdown(1)).catch(() => { process.exitCode = 1 })
   }
   process.on('uncaughtException', fatal)
   process.on('unhandledRejection', fatal)
   return () => { process.off('uncaughtException', fatal); process.off('unhandledRejection', fatal) }
}
