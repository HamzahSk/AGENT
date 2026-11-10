import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { deferred, turn, fakeTimers } from './helpers.js'
import { ConnectionManager } from '../lib/ConnectionManager.js'
import { Supervisor } from '../lib/Supervisor.js'
import { createTaskQueue, onEvent } from '../lib/Runtime.js'

test('per-chat ordering, cross-chat concurrency, capacity and isolated failures', async () => {
   const queue = createTaskQueue({ concurrency: 2, maxPending: 2 }), gate = deferred(), order = []
   const a = queue.add('a', async () => { order.push('a1'); await gate.promise; throw new Error('synthetic') })
   const caught = assert.rejects(a, /synthetic/)
   const b = queue.add('a', () => order.push('a2'))
   const c = queue.add('b', () => order.push('b1'))
   await turn()
   assert.deepEqual(order, ['a1', 'b1'])
   const d = queue.add('a', () => order.push('a3'))
   await assert.rejects(queue.add('a', () => {}), { code: 'QUEUE_FULL' })
   gate.resolve(); await Promise.all([caught, b, c, d]); await queue.onIdle()
   assert.deepEqual(order, ['a1', 'b1', 'a2', 'a3'])
   await queue.close(); await assert.rejects(queue.add('c', () => {}), { code: 'QUEUE_CLOSED' })
})
test('event rejections are contained and registrations are disposable', async () => {
   const emitter = new EventEmitter()
   const off = onEvent(emitter, 'message', async () => { throw new Error('synthetic') })
   emitter.emit('message'); await turn(); off()
   assert.equal(emitter.listenerCount('message'), 0)
})
test('one socket initialization, retry backoff and terminal session preservation', async () => {
   const timers = fakeTimers(), gate = deferred(), disposed = [], terminal = []
   let calls = 0
   const manager = new ConnectionManager({ ...timers, random: () => 0.5, create: () => { calls++; return calls === 1 ? gate.promise : {} }, dispose: async socket => disposed.push(socket), onTerminal: code => terminal.push(code) })
   const first = manager.start(); assert.equal(manager.start(), first)
   const socket = {}; gate.resolve(socket); await first
   await Promise.all([manager.disconnected(socket, 408), manager.disconnected(socket, 408)])
   assert.equal(disposed.length, 1); assert.equal(timers.timers.size, 1)
   assert.equal([...timers.timers.values()][0].ms, 1000)
   await timers.fire(); assert.equal(calls, 2)
   await manager.disconnected(manager.socket, 440)
   assert.deepEqual(terminal, [440]); assert.equal(timers.timers.size, 0)
   assert.equal(await manager.start(), null)
})
test('stop while socket creation is pending disposes the result once', async () => {
   const gate = deferred(), disposed = []
   const manager = new ConnectionManager({ create: () => gate.promise, dispose: async socket => disposed.push(socket) })
   const start = manager.start(), stop = manager.stop(), socket = {}
   gate.resolve(socket); await Promise.all([start, stop])
   assert.deepEqual(disposed, [socket]); assert.equal(manager.socket, null)
})
test('supervisor coalesces restart requests and waits for child exit', async () => {
   const timers = fakeTimers(), children = [], exits = []
   const supervisor = new Supervisor({ ...timers, spawn: () => {
      const child = new EventEmitter(); child.pid = children.length + 1; child.kills = []
      child.kill = signal => child.kills.push(signal); children.push(child); return child
   }, onStop: code => exits.push(code) })
   supervisor.start(); children[0].emit('message', 'reset'); children[0].emit('message', 'reset')
   assert.deepEqual(children[0].kills, ['SIGTERM']); assert.equal(children.length, 1)
   children[0].emit('exit', 75); await timers.fire()
   assert.equal(children.length, 2)
   children[1].emit('exit', 78); await turn()
   assert.deepEqual(exits, [78]); assert.equal(timers.timers.size, 0)
})
test('reconnect and shutdown wait for active socket disposal',async()=>{
   const gate=deferred(),timers=fakeTimers();let creates=0
   const manager=new ConnectionManager({...timers,create:async()=>({id:++creates}),dispose:()=>gate.promise})
   const socket=await manager.start(),disconnect=manager.disconnected(socket,408)
   await turn();const restart=manager.start();await turn();assert.equal(creates,1)
   const stop=manager.stop();gate.resolve();await Promise.all([disconnect,restart,stop])
   assert.equal(creates,1);assert.equal(timers.timers.size,0)
})
test('expiry scheduler prevents overlap and awaits an active notification on stop',async()=>{
   const {default:Scheduler}=await import('../lib/Components/Scheduler.js')
   const gate=deferred();let calls=0
   const record={premiumExpiry:Date.now()+1000}
   const scheduler=Scheduler({db:{users:new Map([['fixture',record]]),groups:new Map(),requestWrite:()=>{}},notify:async()=>{calls++;await gate.promise},expire:async()=>{},intervalMs:60000})
   const first=scheduler.tick();assert.equal(scheduler.tick(),first);await turn()
   let stopped=false;const stop=scheduler.stop().then(()=>{stopped=true});await turn();assert.equal(stopped,false)
   gate.resolve();await Promise.all([first,stop]);await scheduler.tick();assert.equal(calls,1)
})
