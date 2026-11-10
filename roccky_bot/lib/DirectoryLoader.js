import { createRequire } from 'node:module'
import { watch } from 'node:fs'
import { readdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { reportError } from './Runtime.js'
const watchers = new Set()
const require = createRequire(import.meta.url)
export const loadDirectory = async (base, accept = () => {}) => {
   const directory = new URL('.', base)
   const files = (await readdir(directory)).filter(file => file.endsWith('.js') && file !== 'index.js').sort()
   for (const file of files) accept(await import(new URL(file, directory).href))
   // ESM reloads retain modules. Production uses process restarts for code changes.
   if (global.hotReload === true) {
      let tail = Promise.resolve()
      const watcher = watch(fileURLToPath(directory), (_event, file) => {
         if (!file?.endsWith('.js') || file === 'index.js') return
         tail = tail.then(async () => {
            const url = new URL(file, directory)
            if (typeof Bun !== 'undefined') delete require.cache[fileURLToPath(url)]
            accept(await import(`${url.href}?update=${Date.now()}`))
         })
            .catch(error => reportError('Utility reload', error))
      })
      watcher.on('error', error => reportError('Utility watcher', error))
      watchers.add(watcher)
   }
}
export const closeUtilityWatchers = () => { for (const watcher of watchers) watcher.close(); watchers.clear() }
