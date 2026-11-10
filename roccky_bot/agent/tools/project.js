import { readFile, readdir, stat } from 'fs/promises'
import { join, relative } from 'path'

const EXCLUDED = new Set(['node_modules', '.git', 'auth', 'session', 'sessions', 'sessionbackup', 'temp', '.state'])

async function walk(root, directory, output, { maxDepth, depth, maxEntries }) {
   if (depth > maxDepth || output.length >= maxEntries) return
   const entries = await readdir(directory, { withFileTypes: true })
   for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (output.length >= maxEntries || EXCLUDED.has(entry.name)) continue
      const full = join(directory, entry.name)
      const rel = relative(root, full).replaceAll('\\', '/')
      if (entry.isDirectory()) {
         output.push(`${rel}/`)
         await walk(root, full, output, { maxDepth, depth: depth + 1, maxEntries })
      }
      else output.push(rel)
   }
}

export function registerProjectTools(registry) {
   registry.register({
      name: 'inspect_project',
      description: 'Inspect the current bot architecture, manifest, documentation, plugin categories, and key entry files. Use this before planning project-wide changes.',
      parameters: { type: 'object', properties: {} },
      async execute(_args, context) {
         const root = context.config.projectRoot
         let manifest = {}
         try { manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')) } catch {}
         const files = []
         await walk(root, root, files, { maxDepth: 3, depth: 0, maxEntries: 500 })
         const plugins = files.filter(file => file.startsWith('plugins/') && file.endsWith('.js'))
         const categories = plugins.reduce((result, file) => {
            const category = file.split('/')[1] || 'root'
            result[category] = (result[category] || 0) + 1
            return result
         }, {})
         return {
            root,
            package: { name: manifest.name, version: manifest.version, type: manifest.type, scripts: manifest.scripts, dependencies: Object.keys(manifest.dependencies || {}) },
            entryFiles: files.filter(file => ['index.js', 'socket.js', 'config.js', 'README.md', 'lib/Listener.js', 'lib/Watcher.js', 'lib/Event.js'].includes(file)),
            pluginCounts: categories,
            documentation: files.filter(file => /(^|\/)(readme|docs|contributing).*\.md$/i.test(file)),
            totalVisibleEntries: files.length
         }
      }
   })

   registry.register({
      name: 'list_files',
      description: 'List project files and directories recursively without exposing protected runtime or credential directories.',
      parameters: {
         type: 'object',
         properties: {
            path: { type: 'string', description: 'Project-relative directory, default .' },
            max_depth: { type: 'integer', minimum: 0, maximum: 8 },
            max_entries: { type: 'integer', minimum: 1, maximum: 1000 }
         }
      },
      async execute(args, context) {
         const checked = context.policy.assertReadable(args.path || '.')
         await context.policy.assertNoSymlinkEscape(checked.relative)
         const stats = await stat(checked.absolute)
         if (!stats.isDirectory()) return { path: checked.relative, type: 'file', size: stats.size }
         const output = []
         await walk(context.config.projectRoot, checked.absolute, output, {
            maxDepth: Math.min(args.max_depth ?? 3, 8),
            depth: 0,
            maxEntries: Math.min(args.max_entries ?? 300, 1000)
         })
         return { path: checked.relative, entries: output, truncated: output.length >= (args.max_entries ?? 300) }
      }
   })
}

