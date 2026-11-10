import { spawn } from 'node:child_process'
import PQueue from 'p-queue'
import { positiveInt } from './Runtime.js'

export const createMediaRunner = ({ concurrency = 1, maxPending = 8, timeoutMs = 60000, spawnProcess = spawn } = {}) => {
   const queue = new PQueue({ concurrency: positiveInt(concurrency, 1, 4) })
   const run = (executable, args, { stream = false } = {}) => {
      if (queue.size >= maxPending) return Promise.reject(Object.assign(new Error('Media queue full'), { code: 'MEDIA_QUEUE_FULL' }))
      let resolveResult, rejectResult
      const result = new Promise((resolve, reject) => { resolveResult = resolve; rejectResult = reject })
      queue.add(() => new Promise((resolve, reject) => {
         const child = spawnProcess(executable, args, { stdio: stream ? ['ignore', 'pipe', 'ignore'] : 'ignore' })
         let timedOut = false, settled = false
         const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL') }, timeoutMs)
         const finish = error => {
            if (settled) return
            settled = true; clearTimeout(timer)
            if (error) { child.stdout?.destroy(error); rejectResult(error); reject(error) }
            else { if (!stream) resolveResult(); resolve() }
         }
         if (stream) {
            // Consumers still receive the error; the guard prevents an unhandled
            // stream error before they have attached their own listener.
            child.stdout.on('error', () => {})
            child.stdout.once('close', () => { if (!settled && child.exitCode === null) child.kill('SIGKILL') })
            child.once('spawn', () => resolveResult(child.stdout))
         }
         child.once('error', finish)
         child.once('close', code => finish(timedOut ? Object.assign(new Error('Media process timed out'), { code: 'MEDIA_TIMEOUT' }) : code === 0 ? null : new Error(`Media process exited (${code})`)))
      })).catch(rejectResult)
      return result
   }
   return { queue, run }
}
