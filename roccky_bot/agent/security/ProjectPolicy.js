import { lstat, realpath } from 'fs/promises'
import { dirname, relative, resolve, sep } from 'path'
import { PolicyError } from '../errors.js'

const SENSITIVE_PARTS = new Set([
   '.env', 'auth', 'session', 'sessions', 'sessionbackup', 'credentials',
   'database.json', 'store.json', '.git', '.state'
])

const CRITICAL_FILES = new Set([
   'package.json', 'config.js', 'index.js', 'socket.js',
   'lib/Event.js', 'lib/Listener.js', 'lib/Database.js'
])

export class ProjectPolicy {
   constructor(projectRoot) {
      this.root = resolve(projectRoot)
   }

   relativePath(path) {
      const absolute = resolve(this.root, String(path || '.'))
      const rel = relative(this.root, absolute)
      if (rel === '..' || rel.startsWith(`..${sep}`) || resolve(absolute) === resolve('/'))
         throw new PolicyError('Path is outside the bot project.', { path })
      return { absolute, relative: rel || '.' }
   }

   isSensitive(path) {
      const { relative: rel } = this.relativePath(path)
      const parts = rel.split(/[\\/]/).map(part => part.toLowerCase())
      const configuredPrivatePaths = [
         globalThis.authFolder,
         globalThis.databaseFilename,
         globalThis.storeFilename
      ].filter(Boolean).map(value => String(value).replaceAll('\\', '/').replace(/^\.\//, '').toLowerCase())
      const normalized = rel.replaceAll('\\', '/').toLowerCase()
      return parts.some(part => SENSITIVE_PARTS.has(part)) ||
         configuredPrivatePaths.some(value => normalized === value || normalized.startsWith(`${value}/`)) ||
         /(^|\/)\.env(?:\.|$)/i.test(rel)
   }

   assertReadable(path) {
      if (this.isSensitive(path)) throw new PolicyError('Sensitive credentials and runtime session data cannot be read by the agent.', { path })
      return this.relativePath(path)
   }

   assertWritable(path) {
      const checked = this.relativePath(path)
      if (this.isSensitive(path)) throw new PolicyError('Sensitive credentials, session data, database files, and Git internals are write-protected.', { path })
      return checked
   }

   isCritical(path) {
      const { relative: rel } = this.relativePath(path)
      return CRITICAL_FILES.has(rel.replaceAll('\\', '/'))
   }

   async assertNoSymlinkEscape(path, { allowMissing = false } = {}) {
      const checked = this.relativePath(path)
      let candidate = checked.absolute
      try {
         await lstat(candidate)
         const target = await realpath(candidate)
         this.relativePath(target)
      }
      catch (error) {
         if (error.code !== 'ENOENT' || !allowMissing) throw error
         candidate = dirname(candidate)
         while (true) {
            try {
               const target = await realpath(candidate)
               this.relativePath(target)
               break
            }
            catch (parentError) {
               if (parentError.code !== 'ENOENT') throw parentError
               const parent = dirname(candidate)
               if (parent === candidate) throw parentError
               candidate = parent
            }
         }
      }
      return checked
   }
}

export const redactSecrets = text => String(text)
   .replace(/((?:[\w-]*(?:api[_-]?key|token|secret|password|authorization)|databaseUrl|proxyUrl|freeTheAi|logFlareApi)\s*[:=]\s*['"]?)[^'"\s,}]+/gi, '$1<redacted>')
   .replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, '$1<redacted>')
   .replace(/([a-z][a-z0-9+.-]*:\/\/[^\s:@/]+:)[^\s@/]+(@)/gi, '$1<redacted>$2')

