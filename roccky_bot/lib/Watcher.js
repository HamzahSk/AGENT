import { createRequire } from 'node:module'
import { watch } from 'node:fs'
import { readdir, stat } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { reportError } from './Runtime.js'

export const FileCache = new Map()
export const ModuleCache = new Map()
export const CommandIndex = new Map()
export const EventIndex = new Set()
export let registryRevision = 0
const watchers = new Map(), changes = new Map()
const require = createRequire(import.meta.url)
const array = value => value == null ? [] : Array.isArray(value) ? value : [value]
const commands = module => [...array(module.command), ...array(module.hidden)].filter(value => typeof value === 'string').map(value => value.replace(/\s+/g, '').toLowerCase())

export const indexModule = module => {
   if (module.command) for (const command of commands(module)) {
      if (CommandIndex.has(command) && CommandIndex.get(command) !== module) {
         console.warn(`[Plugins] Duplicate command skipped: ${command}`)
         continue
      }
      CommandIndex.set(command, module)
   }
   else EventIndex.add(module)
   registryRevision++
}
export const unindexModule = file => {
   for (const module of array(ModuleCache.get(file))) {
      for (const command of commands(module)) if (CommandIndex.get(command) === module) CommandIndex.delete(command)
      EventIndex.delete(module)
   }
   ModuleCache.delete(file)
   registryRevision++
}
export const loadModule = async (file, reload = false) => {
   try {
      const url = pathToFileURL(resolve(file))
      if (reload) {
         if (typeof Bun !== 'undefined') delete require.cache[resolve(file)]
         url.searchParams.set('update', String(++registryRevision))
      }
      const mod = await import(url.href)
      const modules = array(mod.default ?? mod).filter(value => typeof value?.run === 'function')
      if (!modules.length) throw new TypeError('Plugin must export a run function')
      // Keep the previous working plugin if import/validation failed.
      unindexModule(file)
      ModuleCache.set(file, modules)
      modules.forEach(indexModule)
      const info = await stat(file)
      FileCache.set(file, { mtimeMs: info.mtimeMs, size: info.size })
      return true
   } catch (error) { reportError(`Plugin load ${file}`, error); return false }
}
export const scanDirectory = async (directory, { hotReload = global.hotReload === true } = {}) => {
   directory = resolve(directory)
   const entries = (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))
   for (const entry of entries) {
      const file = join(directory, entry.name)
      if (entry.isDirectory()) await scanDirectory(file, { hotReload })
      else if (entry.isFile() && file.endsWith('.js') && !FileCache.has(file)) await loadModule(file)
   }
   if (hotReload && !watchers.has(directory)) {
      const watcher = watch(directory, (_event, name) => {
         if (!name?.endsWith('.js')) return
         const file = join(directory, name)
         clearTimeout(changes.get(file))
         changes.set(file, setTimeout(() => {
            changes.delete(file)
            void handleChange(file).catch(error => reportError('Plugin watcher', error))
         }, 500))
      })
      watcher.on('error', error => reportError('Plugin watcher', error))
      watchers.set(directory, watcher)
   }
}
const handleChange = async file => {
   try {
      const info = await stat(file)
      if (info.isFile()) await loadModule(file, true)
   } catch (error) {
      if (error.code !== 'ENOENT') throw error
      FileCache.delete(file)
      unindexModule(file)
   }
}
export const closeWatchers = () => {
   for (const watcher of watchers.values()) watcher.close()
   for (const timer of changes.values()) clearTimeout(timer)
   watchers.clear(); changes.clear()
}

export const pluginLifecycle = async (event, sock) => {
   const modules = new Set([...ModuleCache.values()].flatMap(array))
   for (const module of modules) if (typeof module[event] === 'function') {
      try { await module[event](sock) } catch (error) { reportError(`Plugin ${event}`, error) }
   }
}
