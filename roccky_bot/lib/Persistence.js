import { mkdir, readFile, rename, writeFile, unlink } from 'node:fs/promises'
import { dirname } from 'node:path'
import { positiveInt, reportError } from './Runtime.js'

export const atomicWrite = async (file, content) => {
   await mkdir(dirname(file), { recursive: true })
   const temporary = `${file}.${process.pid}.temp`
   try { await writeFile(temporary, content, { encoding: 'utf8', mode: 0o600 }); await rename(temporary, file) }
   finally { await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') reportError('Temporary database file', error) }) }
}

const typedArrays = { Uint8Array, Uint8ClampedArray, Int8Array, Uint16Array, Int16Array,
   Uint32Array, Int32Array, Float32Array, Float64Array, BigInt64Array, BigUint64Array }

export const decode = text => JSON.parse(text, (_key, value) => {
   if (!value?.__type || typeof value.data !== 'string') return value
   if (value.__type === 'BigInt') return BigInt(value.data)
   if (!['Buffer', 'ArrayBuffer', 'DataView', ...Object.keys(typedArrays)].includes(value.__type)) return value
   const bytes = Uint8Array.from(Buffer.from(value.data, 'base64'))
   if (value.__type === 'Buffer') return Buffer.from(bytes)
   if (value.__type === 'ArrayBuffer') return bytes.buffer
   if (value.__type === 'DataView') return new DataView(bytes.buffer)
   return new typedArrays[value.__type](bytes.buffer)
})

export const encode = data => {
   const ancestors = []
   return JSON.stringify(data, function (_key, value) {
      if (typeof value === 'function') return undefined
      if (typeof value === 'bigint') return { __type: 'BigInt', data: String(value) }
      if (value?.type === 'Buffer' && Array.isArray(value.data)) return { __type: 'Buffer', data: Buffer.from(value.data).toString('base64') }
      if (value instanceof ArrayBuffer) return { __type: 'ArrayBuffer', data: Buffer.from(value).toString('base64') }
      if (ArrayBuffer.isView(value)) return { __type: value.constructor.name, data: Buffer.from(value.buffer, value.byteOffset, value.byteLength).toString('base64') }
      if (value && typeof value === 'object') {
         while (ancestors.length && ancestors.at(-1) !== this) ancestors.pop()
         if (ancestors.includes(value)) throw new TypeError('Circular database value')
         ancestors.push(value)
      }
      return value
   })
}

export const readLocal = async file => {
   try { return await readFile(file, 'utf8') }
   catch (error) { if (error.code === 'ENOENT') return null; throw error }
}

export const createFlushController = save => {
   let revision = 0, saved = 0, timer = null, active = null, suppress = false, closed = false
   const schedule = (ms = positiveInt(global.dbFlushDebounce, 5000)) => {
      if (timer || closed) return
      timer = setTimeout(() => { timer = null; void flush().catch(error => reportError('Database flush', error)) }, ms)
      timer.unref?.()
   }
   const requestWrite = () => { if (!suppress) { revision++; schedule() } }
   const flush = () => {
      if (timer) { clearTimeout(timer); timer = null }
      if (active) return active
      active = (async () => {
         while (saved !== revision) {
            const target = revision
            await save()
            saved = target
         }
      })().catch(error => { schedule(positiveInt(global.dbFlushRetryMs, 30000)); throw error })
         .finally(() => { active = null })
      return active
   }
   return {
      requestWrite, flush,
      flushNowGuarded() { revision++; return flush() },
      suppressDirty(callback) { suppress = true; try { callback() } finally { suppress = false } },
      isDirty: () => saved !== revision,
      async close() { closed = true; await flush() }
   }
}
