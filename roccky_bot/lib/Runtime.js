// Keep diagnostics useful without serializing requests, headers, or auth state.
export const errorCode = error => {
   const name = /^[A-Za-z][A-Za-z0-9]*$/.test(error?.name) ? error.name : 'Error'
   const code = error?.code ?? error?.output?.statusCode ?? error?.statusCode
   return `${name}${code != null && /^[A-Z_0-9-]{1,40}$/i.test(String(code)) ? ` (${code})` : ''}`
}

export const reportError = (scope, error) => console.error(`[${scope}] ${errorCode(error)}`)

export const positiveInt = (value, fallback, max = Number.MAX_SAFE_INTEGER) =>
   Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Math.min(Number(value), max) : fallback

// EventEmitter does not await async listeners. Every boundary owns its rejection.
export const onEvent = (emitter, name, handler) => {
   const wrapped = (...args) => Promise.resolve().then(() => handler(...args)).catch(error => reportError(name, error))
   emitter.on(name, wrapped)
   return () => emitter.off(name, wrapped)
}

// A bounded FIFO across chats, with at most one running task per chat.
export const createTaskQueue = ({ concurrency = 2, maxPending = 100 } = {}) => {
   const pending = [], keys = new Set(), idle = []
   let active = 0, closed = false
   const drain = () => {
      while (!closed && active < concurrency) {
         const index = pending.findIndex(task => !keys.has(task.key))
         if (index < 0) break
         const task = pending.splice(index, 1)[0]
         active++
         keys.add(task.key)
         Promise.resolve().then(task.run).then(task.resolve, task.reject).finally(() => {
            active--
            keys.delete(task.key)
            drain()
         })
      }
      if (!active && !pending.length) idle.splice(0).forEach(resolve => resolve())
   }
   return {
      add(key, run) {
         if (closed || pending.length >= maxPending) {
            const error = new Error(closed ? 'Queue closed' : 'Message queue full')
            error.code = closed ? 'QUEUE_CLOSED' : 'QUEUE_FULL'
            return Promise.reject(error)
         }
         return new Promise((resolve, reject) => { pending.push({ key, run, resolve, reject }); drain() })
      },
      async close() {
         closed = true
         for (const task of pending.splice(0)) task.resolve()
         if (active) await new Promise(resolve => { idle.push(resolve) })
      },
      onIdle() { return active || pending.length ? new Promise(resolve => { idle.push(resolve) }) : Promise.resolve() },
      get size() { return pending.length },
      get active() { return active }
   }
}
