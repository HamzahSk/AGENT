import { CATEGORY_EMOJIS } from '../../lib/Constants.js'
import { frame, toArray, toTitleCase } from '../../lib/Utilities.js'
import { ModuleCache } from '../../lib/Watcher.js'

export default {
   command: 'commands',
   category: 'other',
   async run(m, {
      sock
   }) {
      const grouped = Object.create(null)
      for (const modules of ModuleCache.values()) {
         const moduleList = Array.isArray(modules) ? modules : [modules]
         for (const { command, category } of moduleList) {
            if (!category || !command) continue
            ;(grouped[category] ??= []).push(...toArray(command))
         }
      }
      const sortedGroups = Object.keys(grouped)
         .sort()
         .map(category =>
            (CATEGORY_EMOJIS[category] ?? '📁') + ' ' + toTitleCase(category) + ': ' + grouped[category].length
         )
      const print = frame('COMMANDS', sortedGroups, '📏')
      sock.sendText(m.chat, print, m)
   }
}