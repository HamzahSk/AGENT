import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { Supervisor } from './lib/Supervisor.js'
import { installFatalHandlers } from './lib/Components/ErrorHandler.js'
import { reportError } from './lib/Runtime.js'

const isBun = typeof Bun !== 'undefined'
const [nodeMajor, nodeMinor] = process.versions.node.split('.').map(Number)
if (!isBun && (nodeMajor < 22 || (nodeMajor === 22 && nodeMinor < 12))) throw new Error('Node.js 22.12 or later is required')
let server, supervisor, closing = false, exitCode = 0
const closeServer = async (code = 0) => {
   if (closing) return
   closing = true
   if (server?.stop) server.stop(true)
   else if (server) await new Promise(resolve => { server.close(resolve); server.closeAllConnections?.() })
   process.exitCode = exitCode || code
}
const shutdown = async code => {
   if (code) exitCode = code
   if (supervisor) await supervisor.stop()
   else await closeServer(code)
}
installFatalHandlers(shutdown)
process.once('SIGINT', () => { void shutdown(0) })
process.once('SIGTERM', () => { void shutdown(0) })
try {
   if (process.env.ROCCKY_AI_SERVER !== 'false') {
      const { startServer } = await import('./AI-SEERVER/api/index.js')
      server = await startServer({ port: Number(process.env.AI_SERVER_PORT || process.env.PORT || 8080), host: process.env.AI_SERVER_HOST || process.env.HOST || '0.0.0.0' })
   }
   supervisor = new Supervisor({
      spawn: () => spawn(process.execPath, [...(isBun ? [] : process.execArgv), fileURLToPath(new URL('./socket.js', import.meta.url)), ...process.argv.slice(2)], { stdio: ['inherit', 'inherit', 'inherit', 'ipc'] }),
      onStop: closeServer
   })
   supervisor.start()
} catch (error) { reportError('Launcher startup', error); await shutdown(1) }
