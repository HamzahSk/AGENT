import { parentPort, workerData } from 'node:worker_threads'
import { dsSolve } from './deepseek_apk.js'
try {
   const { challenge, prefix, difficulty } = workerData
   parentPort.postMessage({ answer: dsSolve(challenge, prefix, difficulty) })
} catch { parentPort.postMessage({ failed: true }) }
