import { reportError } from './Runtime.js'

// Terminal disconnects need operator intervention. Never delete/replay auth keys.
export const TERMINAL_DISCONNECTS = new Set([401, 403, 411, 440, 500])

export class ConnectionManager {
   constructor({ create, dispose, onTerminal = () => {}, baseDelay = 1000, maxDelay = 60000,
      stableMs = 60000, random = Math.random, setTimer = setTimeout, clearTimer = clearTimeout }) {
      Object.assign(this, { create, dispose, onTerminal, baseDelay, maxDelay, stableMs, random, setTimer, clearTimer })
      this.socket = null
      this.closing = null
      this.pending = null
      this.timer = null
      this.stableTimer = null
      this.attempts = 0
      this.stopped = false
   }

   start() {
      if (this.stopped) return Promise.resolve(null)
      if (this.pending) return this.pending
      if (this.closing) return this.closing.then(() => this.start())
      if (this.socket) return Promise.resolve(this.socket)
      this.clearTimer(this.timer); this.timer = null
      this.pending = Promise.resolve().then(this.create).then(async socket => {
         if (this.stopped) { await this.dispose(socket); return null }
         this.socket = socket
         return socket
      }).catch(error => {
         reportError('Socket initialization', error)
         this.schedule()
         return null
      }).finally(() => { this.pending = null })
      return this.pending
   }

   schedule() {
      if (this.stopped || this.timer) return
      const delay = Math.min(this.maxDelay, this.baseDelay * 2 ** Math.min(this.attempts++, 16))
      const jittered = Math.min(this.maxDelay, Math.round(delay * (0.8 + this.random() * 0.4)))
      console.warn(`[Connection] Retry in ${jittered}ms (attempt ${this.attempts})`)
      this.timer = this.setTimer(() => { this.timer = null; void this.start() }, jittered)
   }

   opened(socket) {
      if (this.stopped || (this.socket && this.socket !== socket)) return
      this.clearTimer(this.stableTimer)
      this.stableTimer = this.setTimer(() => { this.attempts = 0; this.stableTimer = null }, this.stableMs)
      this.stableTimer?.unref?.()
   }

   async disconnected(socket, code) {
      // The event may arrive while the async factory is finishing.
      if (this.pending) await this.pending
      if (this.stopped || socket !== this.socket) return
      this.socket = null
      this.clearTimer(this.stableTimer)
      this.stableTimer = null
      const terminal = TERMINAL_DISCONNECTS.has(Number(code))
      if (terminal) this.stopped = true
      this.closing = Promise.resolve().then(() => this.dispose(socket)).finally(() => { this.closing = null })
      await this.closing
      if (terminal) {
         await this.onTerminal(code)
      } else this.schedule()
   }

   async stop() {
      this.stopped = true
      this.clearTimer(this.timer)
      this.clearTimer(this.stableTimer)
      this.timer = this.stableTimer = null
      if (this.pending) await this.pending
      if (this.closing) await this.closing
      const socket = this.socket
      this.socket = null
      if (socket) await this.dispose(socket)
   }
}
