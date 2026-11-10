// Plugin-facing entry point. The query tokens intentionally isolate the
// hot-reloaded WhatsApp plugin from stale ESM instances that may already be
// cached by a long-running bot process.
import { createAgentConfig } from './config.js?runtime=owner-auth-v2'
import { OwnerAgent } from './core/OwnerAgent.js?runtime=owner-auth-v2'
import { OwnerGuard } from './core/OwnerGuard.js?runtime=owner-auth-v2'
import { OpenAICompatibleProvider } from './core/OpenAICompatibleProvider.js?runtime=owner-auth-v2'
import { createWhatsAppHandler } from './integrations/whatsapp.js?runtime=owner-auth-v2'

export function createPluginAgentIntegration(options = {}, dependencies = {}) {
   const config = createAgentConfig(options)
   const provider = dependencies.provider || new OpenAICompatibleProvider(config.provider)
   const guard = dependencies.guard || new OwnerGuard()
   const agent = new OwnerAgent(config, { ...dependencies, provider, guard })
   return {
      agent,
      handleMessage: createWhatsAppHandler(agent)
   }
}

