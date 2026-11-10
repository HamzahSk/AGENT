import { OwnerGuard } from './OwnerGuard.js'
import { MemoryStore } from './MemoryStore.js'
import { ToolRegistry } from './ToolRegistry.js'
import { OpenAICompatibleProvider } from './OpenAICompatibleProvider.js'
import { ProjectPolicy } from '../security/ProjectPolicy.js'
import { buildSystemPrompt } from '../prompts/system.js'
import { registerBuiltInTools, runProcess } from '../tools/index.js'

const toolResult = value => {
   const text = typeof value === 'string' ? value : JSON.stringify(value)
   return text.length > 100_000 ? `${text.slice(0, 100_000)}\n...[tool output truncated]` : text
}

export class OwnerAgent {
   constructor(config, dependencies = {}) {
      this.config = config
      this.guard = dependencies.guard || new OwnerGuard()
      this.memory = dependencies.memory || new MemoryStore({ directory: config.stateDir, maxMessages: config.maxHistoryMessages })
      this.policy = dependencies.policy || new ProjectPolicy(config.projectRoot)
      this.provider = dependencies.provider || new OpenAICompatibleProvider(config.provider)
      this.registry = dependencies.registry || registerBuiltInTools(new ToolRegistry())
      this.active = new Map()
   }

   async handleMessage(input) {
      const ownerId = this.guard.ownerId(input)
      const text = String(input.text || '').trim()
      if (!text) return { text: 'Please send a development or administration request.', ownerId }

      const previous = this.active.get(ownerId) || Promise.resolve()
      let release
      const current = new Promise(resolve => { release = resolve })
      this.active.set(ownerId, current)
      await previous
      try {
         return await this.#run(ownerId, text, input)
      }
      finally {
         release()
         if (this.active.get(ownerId) === current) this.active.delete(ownerId)
      }
   }

   async #run(ownerId, text, input) {
      const memory = await this.memory.load(ownerId)
      const existingConfirmationIds = new Set(
         (memory.pendingConfirmations || []).map(item => item.id)
      )
      const system = buildSystemPrompt({ projectRoot: this.config.projectRoot, memory })
      const messages = [
         { role: 'system', content: system },
         ...(memory.messages || []).slice(-this.config.maxHistoryMessages),
         { role: 'user', content: text }
      ]
      const context = {
         ownerId,
         input,
         config: this.config,
         memory: this.memory,
         policy: this.policy,
         registry: this.registry,
         runProcess: (command, args, options = {}) => runProcess(command, args, { cwd: this.config.projectRoot, ...options })
      }

      const controller = new AbortController()
      let finalText = ''
      const audit = []
      try {
         for (let round = 0; round < this.config.maxToolRounds; round++) {
            this.guard.assert(input)
            const completion = await this.provider.complete({ messages, tools: this.registry.definitions(), signal: controller.signal })
            if (!completion.toolCalls.length) {
               finalText = completion.content.trim() || 'The model returned an empty response.'
               break
            }

            messages.push({
               role: 'assistant',
               content: completion.content || null,
               tool_calls: completion.toolCalls.map(call => ({ id: call.id, type: 'function', function: { name: call.name, arguments: JSON.stringify(call.arguments) } }))
            })

            for (const call of completion.toolCalls) {
               this.guard.assert(input)
               let result
               try {
                  result = await this.registry.execute(call.name, call.arguments, context)
                  audit.push({ tool: call.name, ok: true, at: new Date().toISOString() })
               }
               catch (error) {
                  result = { ok: false, error: error.message, code: error.code || 'TOOL_ERROR', details: error.details }
                  audit.push({ tool: call.name, ok: false, error: error.message, at: new Date().toISOString() })
               }
               messages.push({ role: 'tool', tool_call_id: call.id, content: toolResult(result) })
            }
         }

         if (!finalText)
            finalText = `I reached the ${this.config.maxToolRounds}-step execution limit. The task may be unfinished; ask me to continue.`
      }
      catch (error) {
         finalText = `I could not complete the request: ${error.message}`
         audit.push({ tool: 'agent', ok: false, error: error.message, at: new Date().toISOString() })
      }

      finalText = finalText.slice(0, this.config.maxResponseLength)
      const savedState = await this.memory.update(ownerId, state => {
         state.messages.push({ role: 'user', content: text })
         state.messages.push({ role: 'assistant', content: finalText })
         state.audit.push(...audit)
      })
      const pendingConfirmations = (savedState.pendingConfirmations || []).map(item => ({
         id: item.id,
         tool: item.tool,
         reason: item.reason,
         expiresAt: item.expiresAt
      }))

      return {
         text: finalText,
         ownerId,
         toolActivity: audit,
         pendingConfirmations,
         newPendingConfirmations: pendingConfirmations.filter(item => !existingConfirmationIds.has(item.id))
      }
   }
}

