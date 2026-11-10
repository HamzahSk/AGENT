import { reportError } from './Runtime.js'

// A replacement starts only after the previous child has exited.
export class Supervisor {
   constructor({ spawn, onStop = () => {}, setTimer = setTimeout, clearTimer = clearTimeout, now = Date.now }) {
      Object.assign(this, { spawn, onStop, setTimer, clearTimer, now })
      this.child = null; this.timer = null; this.killTimer = null; this.failures = 0; this.stopped = false
   }
   start() {
      if (this.stopped || this.child || this.timer) return
      const started = this.now()
      let child
      try { child = this.spawn() } catch (error) { reportError('Worker spawn', error); this.schedule(); return }
      this.child = child
      let finished = false
      const finish = code => {
         if (finished) return
         finished = true
         this.clearTimer(this.killTimer); this.killTimer = null
         this.child = null
         if (this.now() - started > 60000) this.failures = 0
         if (this.stopped || code === 0 || code === 78) {
            this.stopped = true
            Promise.resolve().then(() => this.onStop(code === 78 ? 78 : 0)).catch(error => reportError('Launcher stop', error))
         } else this.schedule()
      }
      child.on('message', data => {
         if (['reset', 'leak'].includes(typeof data === 'object' ? data?.action : data)) this.terminate()
      })
      child.once('error', error => { reportError('Worker', error); if (!child.pid) finish(1) })
      child.once('exit', finish)
   }
   schedule() {
      if (this.stopped || this.timer) return
      const delay = Math.min(60000, 1000 * 2 ** Math.min(this.failures++, 6))
      console.warn(`[Launcher] Worker retry in ${delay}ms`)
      this.timer = this.setTimer(() => { this.timer = null; this.start() }, delay)
   }
   terminate() {
      if (!this.child || this.killTimer) return
      const child = this.child
      child.kill('SIGTERM')
      this.killTimer = this.setTimer(() => { if (this.child === child) child.kill('SIGKILL') }, 15000)
   }
   stop() {
      this.stopped = true
      this.clearTimer(this.timer); this.timer = null
      if (this.child) this.terminate()
      else return this.onStop(0)
   }
}
