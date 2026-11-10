import { isIP } from 'net'
import { lookup } from 'dns/promises'
import { PolicyError } from '../errors.js'
import { redactSecrets } from '../security/ProjectPolicy.js'

const isPrivateIp = address => {
   if (!isIP(address)) return true
   if (address === '127.0.0.1' || address === '::1' || address === '0.0.0.0') return true
   if (address.startsWith('10.') || address.startsWith('192.168.') || address.startsWith('169.254.')) return true
   if (address.startsWith('172.')) {
      const second = Number(address.split('.')[1])
      if (second >= 16 && second <= 31) return true
   }
   return address.startsWith('fc') || address.startsWith('fd') || address.startsWith('fe80:')
}

export async function assertPublicUrl(value) {
   const url = new URL(value)
   if (!['http:', 'https:'].includes(url.protocol)) throw new PolicyError('Only HTTP and HTTPS URLs are allowed.')
   if (url.username || url.password) throw new PolicyError('URLs containing credentials are blocked.')
   const records = await lookup(url.hostname, { all: true })
   if (!records.length || records.some(record => isPrivateIp(record.address)))
      throw new PolicyError('Local, private, and link-local network targets are blocked.')
   return url
}

export function registerNetworkTools(registry) {
   registry.register({
      name: 'fetch_url',
      description: 'Fetch public documentation, API data, or source text over HTTP(S). Private-network targets, credentials in URLs, huge responses, and binary downloads are blocked.',
      parameters: {
         type: 'object', required: ['url'],
         properties: {
            url: { type: 'string' },
            method: { type: 'string', enum: ['GET', 'HEAD'] },
            headers: { type: 'object', additionalProperties: { type: 'string' } }
         }
      },
      async execute(args, context) {
         let url = await assertPublicUrl(args.url)
         const controller = new AbortController()
         const timer = setTimeout(() => controller.abort(), context.config.fetchTimeoutMs)
         try {
            let response
            for (let redirects = 0; redirects < 4; redirects++) {
               response = await fetch(url, {
                  method: args.method || 'GET',
                  redirect: 'manual',
                  signal: controller.signal,
                  headers: { 'User-Agent': `${globalThis.botName || 'WhatsAppBot'}-OwnerAgent/1.0`, ...(args.headers || {}) }
               })
               if (![301, 302, 303, 307, 308].includes(response.status)) break
               const location = response.headers.get('location')
               if (!location) break
               url = await assertPublicUrl(new URL(location, url).href)
            }
            const type = response.headers.get('content-type') || ''
            if (!/(text|json|javascript|xml|markdown)/i.test(type) && args.method !== 'HEAD')
               throw new PolicyError(`Binary or unsupported content type: ${type || 'unknown'}`)
            if (args.method === 'HEAD') return { url: url.href, status: response.status, headers: Object.fromEntries(response.headers) }
            const reader = response.body?.getReader()
            const chunks = []
            let size = 0
            while (reader) {
               const { done, value } = await reader.read()
               if (done) break
               size += value.byteLength
               if (size > context.config.fetchMaxBytes) {
                  await reader.cancel()
                  throw new PolicyError('Remote response exceeded the configured size limit.')
               }
               chunks.push(value)
            }
            const body = Buffer.concat(chunks.map(chunk => Buffer.from(chunk))).toString('utf8')
            return { url: url.href, status: response.status, contentType: type, body: redactSecrets(body) }
         }
         finally { clearTimeout(timer) }
      }
   })
}

