import { join, resolve } from 'path'
import { getConfig as getRoLangConfig } from '../ro-lang/src/config.js'

const number = (value, fallback) => {
   const parsed = Number(value)
   return Number.isFinite(parsed) ? parsed : fallback
}

export function createAgentConfig(overrides = {}) {
   const projectRoot = resolve(overrides.projectRoot || process.cwd())
   const shared = getRoLangConfig({
      envFile: overrides.envFile || join(projectRoot, '.env')
   })

   return {
      projectRoot,
      stateDir: resolve(overrides.stateDir || join(projectRoot, 'agent', '.state')),
      provider: {
         baseUrl: String(overrides.provider?.baseUrl || overrides.baseUrl || process.env.AGENT_BASE_URL || shared.baseUrl).replace(/\/+$/, ''),
         apiKey: overrides.provider?.apiKey || overrides.apiKey || process.env.AGENT_API_KEY || shared.apiKey || '',
         model: overrides.provider?.model || overrides.model || process.env.AGENT_MODEL || shared.model,
         apiMode: overrides.provider?.apiMode || overrides.apiMode || process.env.AGENT_API_MODE || shared.apiMode,
         timeoutMs: number(overrides.provider?.timeoutMs || overrides.providerTimeoutMs || process.env.AGENT_PROVIDER_TIMEOUT_MS || shared.timeoutMs, 60_000),
         fetchImpl: overrides.provider?.fetchImpl || overrides.fetchImpl
      },
      maxToolRounds: number(overrides.maxToolRounds || process.env.AGENT_MAX_TOOL_ROUNDS, 12),
      maxHistoryMessages: number(overrides.maxHistoryMessages || process.env.AGENT_MAX_HISTORY, 30),
      maxResponseLength: number(overrides.maxResponseLength || process.env.AGENT_MAX_RESPONSE_LENGTH, 14_000),
      commandTimeoutMs: number(overrides.commandTimeoutMs || process.env.AGENT_COMMAND_TIMEOUT_MS, 120_000),
      fetchTimeoutMs: number(overrides.fetchTimeoutMs || process.env.AGENT_FETCH_TIMEOUT_MS, 30_000),
      fetchMaxBytes: number(overrides.fetchMaxBytes || process.env.AGENT_FETCH_MAX_BYTES, 1_500_000)
   }
}

