import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, symlink, writeFile } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'

import { createAgent } from '../index.js'
import { OwnerGuard } from '../core/OwnerGuard.js'
import { ProjectPolicy } from '../security/ProjectPolicy.js'
import { createWhatsAppHandler } from '../integrations/whatsapp.js'

test('OwnerGuard requires listener authorization and an exact configured owner number', () => {
   const previous = globalThis.ownerNumber
   globalThis.ownerNumber = '628123456789'
   try {
      const guard = new OwnerGuard()
      assert.equal(guard.isAuthorized({ isOwner: true, sender: '628123456789@s.whatsapp.net' }), true)
      assert.equal(guard.isAuthorized({ isOwner: false, sender: '628123456789@s.whatsapp.net' }), false)
      assert.equal(guard.isAuthorized({ isOwner: true, sender: '6281234567890@s.whatsapp.net' }), false)
      assert.equal(guard.isAuthorized({
         isOwner: true,
         fromMe: true,
         sender: '628999999999@s.whatsapp.net',
         botJid: '628999999999@s.whatsapp.net'
      }), false)
      assert.throws(() => guard.ownerId({
         isOwner: true,
         fromMe: true,
         sender: '628999999999@s.whatsapp.net',
         botJid: '628999999999@s.whatsapp.net'
      }), /restricted to the configured bot owner/)
      assert.equal(guard.isAuthorized({
         isOwner: true,
         sender: '628123456789@lid'
      }), false)
      assert.equal(guard.isAuthorized({
         isOwner: true,
         sender: '123456789012345@lid',
         resolvedPn: '628123456789@s.whatsapp.net'
      }), true)
   }
   finally { globalThis.ownerNumber = previous }
})

test('WhatsApp adapter resolves a LID through the existing socket mapping', async () => {
   let captured
   const handler = createWhatsAppHandler({
      async handleMessage(input) {
         captured = input
         return { text: 'ok' }
      }
   })
   await handler({
      body: 'hello',
      sender: '123456789012345@lid',
      senderLid: '123456789012345@lid',
      key: {},
      fromMe: false,
      chat: '628123456789@s.whatsapp.net'
   }, {
      body: 'hello',
      isOwner: true,
      sock: {
         user: { decodedId: '628000000000@s.whatsapp.net' },
         async findUserId() { return { phoneNumber: '628123456789@s.whatsapp.net' } }
      }
   })
   assert.equal(captured.resolvedPn, '628123456789@s.whatsapp.net')
   assert.equal(captured.senderLid, '123456789012345@lid')
})

test('ProjectPolicy blocks traversal and credential paths', () => {
   const policy = new ProjectPolicy('/tmp/example-project')
   assert.throws(() => policy.relativePath('../outside'), /outside the bot project/)
   assert.throws(() => policy.assertReadable('.env'), /Sensitive credentials/)
   assert.throws(() => policy.assertWritable('auth/creds.json'), /write-protected/)
   assert.throws(() => policy.assertReadable('agent/.state/backups/config.js'), /Sensitive credentials/)
})

test('ProjectPolicy allows creating nested directories through the nearest existing ancestor', async () => {
   const root = await mkdtemp(join(tmpdir(), 'owner-agent-path-'))
   const policy = new ProjectPolicy(root)
   const checked = await policy.assertNoSymlinkEscape('new/nested/file.js', { allowMissing: true })
   assert.equal(checked.relative, 'new/nested/file.js')
})

test('ProjectPolicy rejects an existing file reached through an escaping symlink', async () => {
   const root = await mkdtemp(join(tmpdir(), 'owner-agent-link-'))
   await symlink(tmpdir(), join(root, 'outside'))
   const policy = new ProjectPolicy(root)
   await assert.rejects(() => policy.assertNoSymlinkEscape('outside'), /outside the bot project/)
})

test('agent chains a tool call and persists conversation memory', async () => {
   const root = await mkdtemp(join(tmpdir(), 'owner-agent-'))
   await mkdir(join(root, 'agent'), { recursive: true })
   await writeFile(join(root, 'package.json'), JSON.stringify({ name: 'fixture', type: 'module' }))
   const replies = [
      { content: '', toolCalls: [{ id: 'call_1', name: 'write_file', arguments: { path: 'feature.js', content: 'export default true\n', mode: 'create' } }] },
      { content: 'Created feature.js and verified the write.', toolCalls: [] }
   ]
   const provider = { complete: async () => replies.shift() }
   const previous = globalThis.ownerNumber
   globalThis.ownerNumber = '628111111111'
   try {
      const agent = createAgent({ projectRoot: root, stateDir: join(root, 'agent', '.state') }, { provider })
      const result = await agent.handleMessage({ text: 'Create the feature', sender: '628111111111@s.whatsapp.net', isOwner: true })
      assert.match(result.text, /Created feature/)
      assert.equal(await readFile(join(root, 'feature.js'), 'utf8'), 'export default true\n')
      const memory = JSON.parse(await readFile(join(root, 'agent', '.state', '628111111111.json'), 'utf8'))
      assert.equal(memory.messages.at(-2).content, 'Create the feature')
   }
   finally { globalThis.ownerNumber = previous }
})

test('critical file changes are queued instead of silently overwritten', async () => {
   const root = await mkdtemp(join(tmpdir(), 'owner-agent-confirm-'))
   await mkdir(join(root, 'agent'), { recursive: true })
   await writeFile(join(root, 'package.json'), '{"name":"original"}\n')
   const replies = [
      { content: '', toolCalls: [{ id: 'call_critical', name: 'write_file', arguments: { path: 'package.json', content: '{"name":"changed"}\n', mode: 'overwrite' } }] },
      { content: 'This critical change needs your confirmation.', toolCalls: [] }
   ]
   const previous = globalThis.ownerNumber
   globalThis.ownerNumber = '628222222222'
   try {
      const provider = { complete: async () => replies.shift() }
      const agent = createAgent({ projectRoot: root, stateDir: join(root, 'agent', '.state') }, { provider })
      const queued = await agent.handleMessage({ text: 'Change the manifest', sender: '628222222222@s.whatsapp.net', isOwner: true })
      assert.equal(await readFile(join(root, 'package.json'), 'utf8'), '{"name":"original"}\n')
      const memory = JSON.parse(await readFile(join(root, 'agent', '.state', '628222222222.json'), 'utf8'))
      assert.equal(memory.pendingConfirmations.length, 1)
      assert.equal(memory.pendingConfirmations[0].tool, 'write_file')
      assert.equal(queued.newPendingConfirmations.length, 1)
      assert.equal(queued.newPendingConfirmations[0].id, memory.pendingConfirmations[0].id)

      replies.push(
         { content: '', toolCalls: [{ id: 'call_confirm', name: 'confirm_action', arguments: { confirmation_id: memory.pendingConfirmations[0].id } }] },
         { content: 'The confirmed manifest change is complete.', toolCalls: [] }
      )
      await agent.handleMessage({ text: 'Yes, proceed with that change', sender: '628222222222@s.whatsapp.net', isOwner: true })
      assert.equal(await readFile(join(root, 'package.json'), 'utf8'), '{"name":"changed"}\n')
   }
   finally { globalThis.ownerNumber = previous }
})
