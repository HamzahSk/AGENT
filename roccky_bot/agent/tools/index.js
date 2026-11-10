import { registerProjectTools } from './project.js'
import { registerFilesystemTools } from './filesystem.js'
import { registerProcessTools, runProcess } from './process.js'
import { registerNetworkTools } from './network.js'
import { registerWorkflowTools } from './workflow.js'
import { registerBotTools } from './bot.js'

export function registerBuiltInTools(registry) {
   registerProjectTools(registry)
   registerFilesystemTools(registry)
   registerProcessTools(registry)
   registerNetworkTools(registry)
   registerWorkflowTools(registry)
   registerBotTools(registry)
   return registry
}

export { runProcess }

