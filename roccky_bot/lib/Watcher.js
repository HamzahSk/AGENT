import { watch } from 'fs'
import { readdir, stat } from 'fs/promises'
import { basename, join } from 'path'
import { Func } from '#func'

export const FileCache = new Map()
export const ModuleCache = new Map() // Sekarang menyimpan: filePath -> [module1, module2, ...]
export const CommandIndex = new Map()
export const EventIndex = new Set()
const Processing = new Set()

const normalizeCommand = (string) =>
   string
      .replace(/\s+/g, '')
      .toLowerCase()

export const indexModule = (module) => {
   if (module.command) {
      for (const key of ['command', 'hidden'])
         for (const value of Func.toArray(module[key])) {
            if (typeof value !== 'string') continue
            CommandIndex.set(normalizeCommand(value), module)
         }
   }
   else if (!EventIndex.has(module))
      EventIndex.add(module)
}

// DIUBAH: Mendukung penghapusan banyak modul dalam satu file
export const unindexModule = (filePath) => {
   const cachedModules = ModuleCache.get(filePath)
   if (!cachedModules) return

   // Karena tipenya array, kita looping setiap sub-modul di dalamnya
   for (const cachedModule of cachedModules) {
      if (cachedModule.command) {
         for (const key of ['command', 'hidden'])
            for (const value of Func.toArray(cachedModule[key]))
               CommandIndex.delete(normalizeCommand(value))
      }
      else if (EventIndex.has(cachedModule))
         EventIndex.delete(cachedModule)
   }

   ModuleCache.delete(filePath)
}

// DIUBAH: Mendukung pembacaan modul tunggal maupun array
const loadModule = async (filePath) => {
   try {
      const url = new URL(`file://${join(process.cwd(), filePath)}?update=${Date.now()}`)
      const mod = await import(url.href)
      const rawModule = mod.default ?? mod

      // Mengubah ke bentuk array jika modul yang di-export berbentuk single object
      const modules = Array.isArray(rawModule) ? rawModule : [rawModule]
      const validModules = []

      for (const module of modules) {
         if (module?.run) {
            indexModule(module)
            validModules.push(module)
         }
      }

      // Simpan semua modul valid dari file ini ke dalam cache
      if (validModules.length > 0) {
         ModuleCache.set(filePath, validModules)
      }

      return mod
   }
   catch (error) {
      console.error('❌ Failed to load', ':', filePath)
      console.error(error)
   }
}

// Beban maksimum module yang di-import secara bersamaan saat startup
const LOAD_CONCURRENCY = 8

const pool = async (items, worker) => {
   let index = 0
   const runner = async () => {
      while (index < items.length) {
         const current = items[index++]
         await worker(current)
      }
   }
   const workers = Math.min(LOAD_CONCURRENCY, items.length)
   if (workers <= 1) {
      for (const item of items) await worker(item)
      return
   }
   await Promise.all(Array.from({ length: workers }, runner))
}

export const scanDirectory = async (directory) => {
   const entries = await readdir(directory, { withFileTypes: true })

   const fileTasks = []
   const dirTasks = []

   for (const entry of entries) {
      const fullPath = join(directory, entry.name)

      if (entry.isDirectory()) {
         dirTasks.push(fullPath)
         continue
      }
      else if (entry.isFile() || fullPath.endsWith('.js')) {
         const stats = await stat(fullPath)

         FileCache.set(fullPath, {
            mtimeMs: stats.mtimeMs,
            size: stats.size
         })

         fileTasks.push(fullPath)
      }
   }

   // Load module & subdirektori secara paralel (pembatas konkurensi)
   // untuk memangkas waktu startup secara signifikan.
   await pool(fileTasks, loadModule)
   await pool(dirTasks, scanDirectory)

   await watchDirectory(directory)
}

const watchDirectory = async (directory) => {
   watch(directory, (event, fileName) => {
      if (!fileName) return

      handleChange(join(directory, fileName))
   })

   const entries = await readdir(directory, { withFileTypes: true })

   for (const entry of entries)
      if (entry.isDirectory())
         watchDirectory(join(directory, entry.name))
}

const handleChange = async (filePath) => {
   if (!filePath.endsWith('.js')) return
   if (Processing.has(filePath)) return

   Processing.add(filePath)

   try {
      await Func.delay(500)

      const stats = await stat(filePath)

      if (!stats.isFile()) return

      const cachedFile = FileCache.get(filePath)

      const changed =
         !cachedFile ||
         cachedFile.mtimeMs !== stats.mtimeMs ||
         cachedFile.size !== stats.size

      if (!changed) return

      unindexModule(filePath)
      FileCache.set(filePath, {
         mtimeMs: stats.mtimeMs,
         size: stats.size
      })

      await loadModule(filePath)

      console.log(cachedFile ? '🔔 Updated' : '➕ Added', ':', filePath)
   }
   catch {
      FileCache.delete(filePath)
      unindexModule(filePath)
      console.log('🗑️ Deleted', ':', filePath)
   }
   finally {
      await Func.delay(300)

      Processing.delete(filePath)
   }
}
