import { createAgentConfig } from './config.js'
import { OwnerAgent } from './core/OwnerAgent.js'
import { createWhatsAppHandler } from './integrations/whatsapp.js'

export function createAgent(options = {}, dependencies = {}) {
   return new OwnerAgent(createAgentConfig(options), dependencies)
}

export function createOwnerAgentIntegration(options = {}, dependencies = {}) {
   const agent = createAgent(options, dependencies)
   return {
      agent,
      handleMessage: createWhatsAppHandler(agent)
   }
}

export { OwnerAgent, createAgentConfig, createWhatsAppHandler }

