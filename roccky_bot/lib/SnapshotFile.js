import { basename, resolve } from 'node:path'
import { unlink } from 'node:fs/promises'
import { atomicWrite, readLocal, encode, decode } from './Persistence.js'
import { cloudDatabase } from './CloudDatabase.js'
import { reportError } from './Runtime.js'

// Single-writer snapshots. The marker is written before the local snapshot and
// removed only after a confirmed remote upsert. Never silently replace bad data.
export const LocalDatabase = (fileName = global.databaseFilename, { cloud = cloudDatabase } = {}) => {
   const filePath = resolve(fileName)
   const marker = `${filePath}.pending`
   const key = basename(filePath, '.json')
   let tail = Promise.resolve()
   const serialized = run => {
      const result = tail.then(run)
      tail = result.catch(() => {})
      return result
   }
   const parse = content => {
      const value = decode(typeof content === 'string' ? content : JSON.stringify(content))
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Invalid database snapshot')
      return value
   }
   const upload = async content => {
      if (!cloud.connected) return false
      try { await cloud.write(key, content) }
      catch (error) { reportError('Snapshot upload deferred', error); return false }
      await unlink(marker).catch(error => { if (error.code !== 'ENOENT') throw error })
      return true
   }
   return {
      read: file => serialized(async () => {
         if (file !== undefined) {
            const content = await readLocal(resolve(file))
            if (content === null) throw Object.assign(new Error('Snapshot missing'), { code: 'ENOENT' })
            return parse(content)
         }
         const local = await readLocal(filePath)
         if (local !== null) parse(local)
         if (await readLocal(marker) !== null) {
            if (local === null) throw new Error('Pending snapshot missing')
            return parse(local)
         }
         if (cloud.configured) {
            if (cloud.connected) {
               let remote
               try { remote = await cloud.read(key) }
               catch (error) { reportError('Snapshot read; using local copy', error) }
               if (remote != null) {
                  const value = parse(remote)
                  await atomicWrite(filePath, encode(value))
                  return value
               }
            }
            if (!cloud.connected && local === null) throw new Error('Cloud unavailable and no local snapshot')
            if (local !== null) await atomicWrite(marker, 'pending\n')
         }
         return local === null ? {} : parse(local)
      }),
      write(data = {}) {
         // Capture now, not after earlier queued writes have finished.
         const content = encode(data)
         return serialized(async () => {
            if (cloud.configured) await atomicWrite(marker, 'pending\n')
            await atomicWrite(filePath, content)
            if (cloud.configured) await upload(content)
         })
      },
      sync: () => serialized(async () => {
         if (!cloud.connected || await readLocal(marker) === null) return false
         const content = await readLocal(filePath)
         if (content === null) throw new Error('Pending snapshot missing')
         parse(content)
         return upload(content)
      }),
      close: () => tail
   }
}
