import test from 'node:test'
import assert from 'node:assert/strict'

test('owner agent plugin uses private owner handlers and cross-platform quick replies', async () => {
   const { default: handlers } = await import('../../plugins/ai/_chatbot-agent.js')
   assert.equal(Array.isArray(handlers), true)
   assert.equal(handlers.length, 2)
   assert.equal(handlers.every(handler => handler.owner === true && handler.private === true), true)

   let sent
   const m = {
      chat: 'owner@s.whatsapp.net',
      reply: async () => {},
      react: async () => {}
   }
   const context = {
      text: '',
      isPrefix: '.',
      sock: {
         sendButton: async (_jid, payload) => { sent = payload }
      }
   }

   await handlers[0].run(m, context)
   assert.ok(sent)
   assert.ok(sent.buttons.length <= 10)
   assert.equal(sent.buttons.every(button => button.type === 'reply'), true)
   assert.equal(sent.buttons.every(button => button.id.startsWith('.agent ')), true)

   const runtime = globalThis[Symbol.for('roccky.owner-agent.runtime')]
   const originalIntegration = runtime.integration
   let forwarded
   let responseText
   let callCount = 0
   runtime.integration = {
      async handleMessage(_message, forwardedContext) {
         callCount++
         forwarded = forwardedContext.body
         return { text: 'Agent response', pendingConfirmations: [] }
      }
   }
   try {
      await handlers[1].run(m, {
         ...context,
         body: 'please inspect the project naturally',
         func: {
            async sendAI(_sock, _jid, text) { responseText = text }
         }
      })
      assert.equal(forwarded, 'please inspect the project naturally')
      assert.equal(responseText, 'Agent response')

      await handlers[1].run({
         ...m,
         id: 'bot-output-1',
         fromMe: true,
         body: 'Agent response'
      }, {
         ...context,
         body: 'Agent response',
         func: {
            async sendAI() { throw new Error('Bot output must not be answered') }
         }
      })
      assert.equal(callCount, 1)

      const duplicateMessage = { ...m, id: 'incoming-1' }
      const duplicateContext = {
         ...context,
         body: 'only handle this once',
         func: { async sendAI() {} }
      }
      await handlers[1].run(duplicateMessage, duplicateContext)
      await handlers[1].run(duplicateMessage, duplicateContext)
      assert.equal(callCount, 2)
   }
   finally { runtime.integration = originalIntegration }

   await handlers[0].run(m, { ...context, text: 'close' })
})
