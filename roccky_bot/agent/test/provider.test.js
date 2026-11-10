import test from 'node:test'
import assert from 'node:assert/strict'

import { createAgentConfig } from '../config.js'
import { OpenAICompatibleProvider } from '../core/OpenAICompatibleProvider.js'

const baseConfig = overrides => ({
   apiKey: 'test-key',
   baseUrl: 'https://example.test/v1',
   model: 'test-model',
   apiMode: 'auto',
   timeoutMs: 5_000,
   ...overrides
})

test('agent configuration shares RO_LANG environment values', () => {
   const names = ['RO_LANG_API_KEY', 'RO_LANG_BASE_URL', 'RO_LANG_MODEL', 'RO_LANG_API_MODE', 'AGENT_API_KEY', 'AGENT_BASE_URL', 'AGENT_MODEL', 'AGENT_API_MODE']
   const previous = Object.fromEntries(names.map(name => [name, process.env[name]]))
   try {
      for (const name of names) delete process.env[name]
      process.env.RO_LANG_API_KEY = 'shared-key'
      process.env.RO_LANG_BASE_URL = 'https://shared.example/v1/chat/completions'
      process.env.RO_LANG_MODEL = 'shared-model'
      process.env.RO_LANG_API_MODE = 'auto'
      const config = createAgentConfig({ envFile: '/path/that/does/not/exist' })
      assert.equal(config.provider.apiKey, 'shared-key')
      assert.equal(config.provider.baseUrl, 'https://shared.example/v1/chat/completions')
      assert.equal(config.provider.model, 'shared-model')
      assert.equal(config.provider.apiMode, 'auto')
   }
   finally {
      for (const name of names) {
         if (previous[name] === undefined) delete process.env[name]
         else process.env[name] = previous[name]
      }
   }
})

test('chat completions endpoint is not duplicated and tool calls are parsed', async () => {
   let request
   const provider = new OpenAICompatibleProvider(baseConfig({
      baseUrl: 'https://example.test/v1/chat/completions',
      fetchImpl: async (url, options) => {
         request = { url, body: JSON.parse(options.body) }
         return new Response(JSON.stringify({
            choices: [{
               message: {
                  role: 'assistant',
                  content: null,
                  tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'read_file', arguments: '{"path":"README.md"}' } }]
               }
            }]
         }), { status: 200, headers: { 'content-type': 'application/json' } })
      }
   }))

   const result = await provider.complete({
      messages: [{ role: 'user', content: 'Read the docs' }],
      tools: [{ type: 'function', function: { name: 'read_file', parameters: { type: 'object' } } }]
   })
   assert.equal(request.url, 'https://example.test/v1/chat/completions')
   assert.equal(request.body.model, 'test-model')
   assert.deepEqual(result.toolCalls[0].arguments, { path: 'README.md' })
})

test('Responses SSE tool calls are parsed using the shared API mode', async () => {
   let request
   const responseObject = {
      id: 'resp_1',
      output: [{ id: 'fc_1', type: 'function_call', call_id: 'call_2', name: 'inspect_project', arguments: '{}' }]
   }
   const provider = new OpenAICompatibleProvider(baseConfig({
      baseUrl: 'https://example.test/v1/responses',
      fetchImpl: async (url, options) => {
         request = { url, body: JSON.parse(options.body) }
         const body = `event: response.completed\ndata: ${JSON.stringify({ type: 'response.completed', response: responseObject })}\n\n`
         return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } })
      }
   }))

   const result = await provider.complete({
      messages: [{ role: 'system', content: 'System' }, { role: 'user', content: 'Inspect' }],
      tools: [{ type: 'function', function: { name: 'inspect_project', description: 'Inspect', parameters: { type: 'object' } } }]
   })
   assert.equal(request.url, 'https://example.test/v1/responses')
   assert.equal(request.body.instructions, 'System')
   assert.equal(request.body.tools[0].name, 'inspect_project')
   assert.equal(result.toolCalls[0].name, 'inspect_project')
})
