import { mkdir, readFile, rename, writeFile } from 'fs/promises'
import { join } from 'path'
import { randomUUID } from 'crypto'

const initialState = ownerId => ({
   version: 1,
   ownerId,
   messages: [],
   decisions: [],
   tasks: [],
   pendingConfirmations: [],
   audit: [],
   updatedAt: new Date().toISOString()
})

export class MemoryStore {
   constructor({ directory, maxMessages = 30 }) {
      this.directory = directory
      this.maxMessages = maxMessages
      this.cache = new Map()
      this.locks = new Map()
   }

   pathFor(ownerId) {
      return join(this.directory, `${String(ownerId).replace(/\D/g, '')}.json`)
   }

   async load(ownerId) {
      if (this.cache.has(ownerId)) return this.cache.get(ownerId)
      await mkdir(this.directory, { recursive: true })
      let state
      try {
         state = JSON.parse(await readFile(this.pathFor(ownerId), 'utf8'))
      }
      catch (error) {
         if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error
         state = initialState(ownerId)
      }
      state = { ...initialState(ownerId), ...state, ownerId }
      this.cache.set(ownerId, state)
      return state
   }

   async save(ownerId, state) {
      await mkdir(this.directory, { recursive: true })
      state.messages = (state.messages || []).slice(-this.maxMessages)
      state.audit = (state.audit || []).slice(-100)
      state.pendingConfirmations = (state.pendingConfirmations || [])
         .filter(item => new Date(item.expiresAt).getTime() > Date.now())
         .slice(-20)
      state.updatedAt = new Date().toISOString()
      const target = this.pathFor(ownerId)
      const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`
      await writeFile(temporary, JSON.stringify(state, null, 2), { mode: 0o600 })
      await rename(temporary, target)
      this.cache.set(ownerId, state)
      return state
   }

   async update(ownerId, mutator) {
      return this.withLock(ownerId, async () => {
         const state = await this.load(ownerId)
         const result = await mutator(state)
         await this.save(ownerId, state)
         return result ?? state
      })
   }

   async withLock(ownerId, operation) {
      const previous = this.locks.get(ownerId) || Promise.resolve()
      let release
      const current = new Promise(resolve => { release = resolve })
      this.locks.set(ownerId, current)
      await previous
      try {
         return await operation()
      }
      finally {
         release()
         if (this.locks.get(ownerId) === current) this.locks.delete(ownerId)
      }
   }

   async addConfirmation(ownerId, { tool, arguments: args, reason }) {
      const confirmation = {
         id: randomUUID().slice(0, 8),
         tool,
         arguments: args,
         reason,
         createdAt: new Date().toISOString(),
         expiresAt: new Date(Date.now() + 30 * 60_000).toISOString()
      }
      await this.update(ownerId, state => state.pendingConfirmations.push(confirmation))
      return confirmation
   }

   async takeConfirmation(ownerId, id) {
      let found = null
      await this.update(ownerId, state => {
         const index = state.pendingConfirmations.findIndex(item => item.id === id)
         if (index >= 0) [found] = state.pendingConfirmations.splice(index, 1)
      })
      return found
   }
}

