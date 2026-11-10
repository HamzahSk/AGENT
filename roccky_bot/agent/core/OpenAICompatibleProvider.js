import { chatCompletionsUrl, responsesUrl } from '../../ro-lang/src/openai-client.js'
import { ProviderError } from '../errors.js'

const parseArguments = value => {
   if (!value) return {}
   if (typeof value === 'object') return value
   try { return JSON.parse(value) }
   catch { throw new ProviderError('The model returned invalid tool arguments.', { value }) }
}

const contentText = content => {
   if (typeof content === 'string') return content
   if (!Array.isArray(content)) return ''
   return content.map(part => part?.text ?? part?.content ?? '').filter(Boolean).join('')
}

const responseTools = tools => (tools || []).map(tool => ({
   type: 'function',
   name: tool.function?.name,
   description: tool.function?.description || '',
   parameters: tool.function?.parameters || { type: 'object', properties: {} }
})).filter(tool => tool.name)

const responseInput = messages => {
   const input = []
   for (const message of messages) {
      if (message.role === 'system') continue
      if (message.role === 'tool') {
         input.push({
            type: 'function_call_output',
            call_id: message.tool_call_id,
            output: contentText(message.content)
         })
         continue
      }
      if (message.role === 'assistant' && Array.isArray(message.tool_calls)) {
         if (contentText(message.content)) {
            input.push({
               type: 'message',
               role: 'assistant',
               content: [{ type: 'output_text', text: contentText(message.content) }]
            })
         }
         for (const call of message.tool_calls) {
            input.push({
               type: 'function_call',
               call_id: call.id,
               name: call.function?.name,
               arguments: call.function?.arguments || '{}'
            })
         }
         continue
      }
      input.push({
         type: 'message',
         role: message.role,
         content: [{
            type: message.role === 'assistant' ? 'output_text' : 'input_text',
            text: contentText(message.content)
         }]
      })
   }
   return input
}

const parseChatResponse = data => {
   const message = data?.choices?.[0]?.message
   if (!message) throw new ProviderError('AI provider returned no assistant message.', data)
   return {
      content: contentText(message.content),
      toolCalls: (message.tool_calls || []).map(call => ({
         id: call.id,
         name: call.function?.name,
         arguments: parseArguments(call.function?.arguments)
      })).filter(call => call.name),
      rawMessage: message,
      usage: data.usage
   }
}

const parseResponsesObject = data => {
   const hasOutputText = typeof data?.output_text === 'string' && data.output_text
   let content = hasOutputText ? data.output_text : ''
   const toolCalls = []
   for (const item of data?.output || []) {
      if (item?.type === 'message' && !hasOutputText) {
         content += (item.content || [])
            .filter(part => part?.type === 'output_text' || part?.type === 'text')
            .map(part => part.text || '')
            .join('')
      }
      else if (item?.type === 'function_call') {
         toolCalls.push({
            id: item.call_id || item.id,
            name: item.name,
            arguments: parseArguments(item.arguments)
         })
      }
   }
   return { content: content.trim(), toolCalls, rawMessage: data, usage: data?.usage }
}

const parseResponsesSse = raw => {
   let completed = null
   let content = ''
   const calls = new Map()
   for (const line of raw.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) continue
      const payload = trimmed.slice(5).trim()
      if (!payload || payload === '[DONE]') continue
      let event
      try { event = JSON.parse(payload) } catch { continue }
      if (event.type === 'response.completed' && event.response) completed = event.response
      if (event.type === 'response.output_text.delta' && event.delta) content += event.delta
      if (event.type === 'response.output_item.done' && event.item?.type === 'function_call')
         calls.set(event.item.call_id || event.item.id, event.item)
   }
   if (completed) return parseResponsesObject(completed)
   return {
      content: content.trim(),
      toolCalls: [...calls.values()].map(item => ({
         id: item.call_id || item.id,
         name: item.name,
         arguments: parseArguments(item.arguments)
      })),
      rawMessage: null,
      usage: null
   }
}

const endpointMismatch = error =>
   error?.status === 400 && /(unsupported|unknown|not found|invalid).*(endpoint|route|chat|response|url|path)/i.test(error.message)

export class OpenAICompatibleProvider {
   constructor(config) {
      this.config = config
      this.fetch = config.fetchImpl || fetch
      if (!['auto', 'responses', 'chat_completions'].includes(config.apiMode))
         throw new ProviderError('AI API mode must be auto, responses, or chat_completions.')
   }

   preferredMode() {
      if (this.config.apiMode !== 'auto') return this.config.apiMode
      if (this.config.baseUrl.endsWith('/responses')) return 'responses'
      if (this.config.baseUrl.endsWith('/chat/completions')) return 'chat_completions'
      return 'chat_completions'
   }

   async request(mode, { messages, tools, signal }) {
      if (!this.config.apiKey) throw new ProviderError('Missing AI API key. Configure RO_LANG_API_KEY or OPENAI_API_KEY in .env.')
      if (!this.config.model) throw new ProviderError('Missing AI model. Configure RO_LANG_MODEL or OPENAI_MODEL in .env.')
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(new Error('AI provider request timed out')), this.config.timeoutMs)
      const abort = () => controller.abort(signal?.reason)
      signal?.addEventListener('abort', abort, { once: true })
      const isResponses = mode === 'responses'
      const system = messages.filter(message => message.role === 'system').map(message => contentText(message.content)).filter(Boolean).join('\n\n')

      try {
         const response = await this.fetch(isResponses ? responsesUrl(this.config.baseUrl) : chatCompletionsUrl(this.config.baseUrl), {
            method: 'POST',
            signal: controller.signal,
            headers: {
               Authorization: `Bearer ${this.config.apiKey}`,
               'Content-Type': 'application/json',
               Accept: isResponses ? 'text/event-stream, application/json' : 'application/json',
               ...(isResponses ? { originator: 'codex_cli_rs', 'User-Agent': 'codex_cli_rs/0.20.0 (Linux x86_64)' } : {})
            },
            body: JSON.stringify(isResponses ? {
               model: this.config.model,
               instructions: system || undefined,
               input: responseInput(messages),
               tools: responseTools(tools),
               tool_choice: 'auto',
               parallel_tool_calls: false,
               store: false,
               stream: true
            } : {
               model: this.config.model,
               messages,
               tools,
               tool_choice: 'auto',
               stream: false
            })
         })

         const raw = await response.text()
         if (!response.ok) {
            let detail
            try { detail = JSON.parse(raw)?.error } catch {}
            const error = new ProviderError(detail?.message || `AI provider failed with HTTP ${response.status}`, detail)
            error.status = response.status
            throw error
         }

         if (isResponses) {
            if (response.headers.get('content-type')?.includes('text/event-stream') || raw.trimStart().startsWith('data:'))
               return parseResponsesSse(raw)
            try { return parseResponsesObject(JSON.parse(raw)) }
            catch { throw new ProviderError('Responses API returned invalid JSON.') }
         }

         try { return parseChatResponse(JSON.parse(raw)) }
         catch (error) {
            if (error instanceof ProviderError) throw error
            throw new ProviderError('Chat Completions API returned invalid JSON.')
         }
      }
      catch (error) {
         if (error instanceof ProviderError) throw error
         throw new ProviderError(error.message || 'Unable to reach the AI provider.', { cause: error.code })
      }
      finally {
         clearTimeout(timeout)
         signal?.removeEventListener('abort', abort)
      }
   }

   async complete(request) {
      const preferred = this.preferredMode()
      try {
         return await this.request(preferred, request)
      }
      catch (error) {
         const canFallback = this.config.apiMode === 'auto' && ([404, 405, 501].includes(error?.status) || endpointMismatch(error))
         if (!canFallback) throw error
         return this.request(preferred === 'responses' ? 'chat_completions' : 'responses', request)
      }
   }
}
