import { Worker } from 'node:worker_threads'
import PQueue from 'p-queue'

const queue = new PQueue({ concurrency: 1 })
export const solvePow = (challenge, prefix, difficulty, { signal, timeoutMs = 30000 } = {}) => {
   if (signal?.aborted) return Promise.reject(signal.reason || new Error('PoW cancelled'))
   if (queue.size >= 8) return Promise.reject(new Error('PoW queue full'))
   return queue.add(() => new Promise((resolve, reject) => {
      if (signal?.aborted) { reject(signal.reason || new Error('PoW cancelled')); return }
      const worker = new Worker(new URL('./pow-worker.js', import.meta.url), { workerData: { challenge, prefix, difficulty }, execArgv: [] })
      let settled = false
      const finish = async (error, answer) => {
         if (settled) return
         settled = true; clearTimeout(timer); signal?.removeEventListener('abort', abort)
         await worker.terminate()
         if (error) reject(error); else resolve(answer)
      }
      const abort = () => { void finish(signal.reason || new Error('PoW cancelled')) }
      const timer = setTimeout(() => { void finish(new Error('PoW timed out')) }, timeoutMs)
      signal?.addEventListener('abort', abort, { once: true })
      if (signal?.aborted) abort()
      worker.once('message', value => { void finish(value.failed ? new Error('PoW calculation failed') : null, value.answer) })
      worker.once('error', error => { void finish(error) })
      worker.once('exit', code => { if (!settled) void finish(new Error(`PoW worker exited (${code})`)) })
   }))
}
