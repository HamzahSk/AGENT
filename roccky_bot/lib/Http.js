import { Transform, Readable } from 'node:stream'
import { positiveInt } from './Runtime.js'

export const downloadLimit = () => positiveInt(global.maxDownloadBytes, 32 * 1024 * 1024)
export const byteLimit = (max = downloadLimit()) => {
   let bytes = 0
   return new Transform({ transform(chunk, _encoding, callback) {
      bytes += chunk.length
      callback(bytes > max ? Object.assign(new Error('Download exceeds configured limit'), { code: 'DOWNLOAD_LIMIT' }) : null, chunk)
   } })
}
export const fetchResource = async (url, options = {}) => {
   const { timeoutMs = positiveInt(global.requestTimeout, 30000), maxBytes = downloadLimit(), signal, ...init } = options
   const deadline = AbortSignal.timeout(timeoutMs)
   const combined = signal ? AbortSignal.any([signal, deadline]) : deadline
   const headers = new Headers(init.headers)
   if (!headers.has('user-agent')) headers.set('user-agent', 'Mozilla/5.0')
   const response = await fetch(url, { ...init, headers, signal: combined })
   if (!response.ok || Number(response.headers.get('content-length')) > maxBytes) {
      await response.body?.cancel()
      throw Object.assign(new Error('Download rejected'), { code: response.ok ? 'DOWNLOAD_LIMIT' : `HTTP_${response.status}` })
   }
   if (!response.body) throw new Error('Empty HTTP response body')
   return { response, stream: Readable.fromWeb(response.body), signal: combined, maxBytes }
}
export const fetchBuffer = async (url, options = {}) => {
   const resource = await fetchResource(url, options), chunks = []
   let size = 0
   try {
      for await (const chunk of resource.stream) {
         size += chunk.length
         if (size > resource.maxBytes) throw Object.assign(new Error('Download exceeds configured limit'), { code: 'DOWNLOAD_LIMIT' })
         chunks.push(chunk)
      }
      return { buffer: Buffer.concat(chunks, size), contentType: resource.response.headers.get('content-type') || '' }
   } finally { resource.stream.destroy() }
}
