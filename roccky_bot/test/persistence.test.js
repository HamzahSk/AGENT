import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { deferred } from './helpers.js'
import { encode, decode, createFlushController } from '../lib/Persistence.js'
import { LocalDatabase } from '../lib/SnapshotFile.js'
import { CloudDatabase } from '../lib/CloudDatabase.js'

test('binary snapshots preserve shared values, byte offsets, DataView and BigInt', () => {
   const shared = { value: 7 }, wide = new Uint16Array([1000, 2000, 3000])
   const original = { a: shared, b: shared, buffer: Buffer.from([1, 2]), typed: wide.subarray(1), big: 123n, view: new DataView(new Uint8Array([3,4]).buffer) }
   const result = decode(encode(original))
   assert.deepEqual(result, original)
   assert.throws(() => encode({ self: (() => { const value = {}; value.self = value; return value })() }), /Circular/)
})
test('flush retains failed writes and includes mutations during an active save', async () => {
   let fail = true, value = 1, writes = []; const gate = deferred()
   const controller = createFlushController(async () => { const snapshot = value; if (fail) throw new Error('disk'); await gate.promise; writes.push(snapshot) })
   controller.requestWrite(); await assert.rejects(controller.flush(), /disk/); assert.equal(controller.isDirty(), true)
   fail = false; const flush = controller.flush(); value = 2; controller.requestWrite(); gate.resolve(); await flush
   assert.deepEqual(writes, [1, 2]); assert.equal(controller.isDirty(), false); await controller.close()
})
test('cloud interruption preserves local snapshot and retries pending upload after restart', async t => {
   const directory = await mkdtemp(join(tmpdir(), 'roccky-db-')); t.after(() => rm(directory, {recursive:true,force:true}))
   const file = join(directory, 'data.json'), remote = new Map()
   const cloud = { configured: true, connected: true, read: async key => remote.get(key), write: async (key, content) => { if (!cloud.connected) throw new Error('offline'); remote.set(key, content) } }
   const db = LocalDatabase(file, { cloud })
   assert.deepEqual(await db.read(), {})
   await db.write({ count: 1 }); cloud.connected = false
   await Promise.all([db.write({ count: 2 }), db.write({ count: 3 })])
   assert.equal(decode(await readFile(file,'utf8')).count, 3)
   assert.equal(await readFile(file+'.pending','utf8'), 'pending\n')
   const restarted = LocalDatabase(file, { cloud }); assert.equal((await restarted.read()).count, 3)
   cloud.connected = true; assert.equal(await restarted.sync(), true)
   assert.equal(decode(remote.get('data')).count, 3)
   await assert.rejects(readFile(file+'.pending'), {code:'ENOENT'})
   await writeFile(join(directory,'restore.json'), '{"count":9}')
   assert.equal((await restarted.read(join(directory,'restore.json'))).count, 9)
})
test('corrupt local data and cloud-only startup during outage fail without overwriting', async t => {
   const directory = await mkdtemp(join(tmpdir(), 'roccky-corrupt-')); t.after(() => rm(directory,{recursive:true,force:true}))
   const file = join(directory,'data.json'), cloud = {configured:true,connected:false}
   await assert.rejects(LocalDatabase(file,{cloud}).read(), /no local snapshot/)
   await writeFile(file,'{broken')
   await assert.rejects(LocalDatabase(file,{cloud}).read(), SyntaxError)
   assert.equal(await readFile(file,'utf8'), '{broken')
})
test('Mongo reconnect is single-flight and cooled down after outage', async () => {
   let attempts=0, closes=0, now=0, fail=true
   const cloud = new CloudDatabase({ now:()=>now, mongoFactory:async () => ({ connect:async()=>{ attempts++; if(fail) throw new Error('offline') }, close:async()=>{closes++}, db:()=>({command:async()=>{},collection:()=>({})}) }) })
   assert.deepEqual(await Promise.all([cloud.connect('mongodb://example.invalid/test'),cloud.connect('mongodb://example.invalid/test')]),[false,false])
   await cloud.connect(); assert.equal(attempts,1)
   now=5000;fail=false;assert.equal(await cloud.connect(),true);assert.equal(attempts,2)
   await cloud.close();assert.equal(closes,2)
})
test('PostgreSQL idle errors enter cooldown and queries remain parameterized',async()=>{
   const { EventEmitter } = await import('node:events')
   // Verify the actual lazy dependencies resolve without opening a connection.
   assert.equal(typeof (await import('mongodb')).MongoClient,'function')
   assert.equal(typeof (await import('pg')).default.Pool,'function')
   const queries=[];let closed=0,now=0
   const pool=new EventEmitter();pool.query=async(sql,params)=>{queries.push([sql,params]);return {rows:sql.startsWith('SELECT')?[{json_data:'{"value":1}'}]:[]}};pool.end=async()=>{closed++}
   const cloud=new CloudDatabase({now:()=>now,postgresFactory:async()=>pool})
   assert.equal(await cloud.connect('postgresql://example.invalid/test'),true)
   await cloud.write('fixture', '{"value":1}')
   assert.equal(await cloud.read('fixture'),'{"value":1}')
   assert.ok(queries.some(([sql,params])=>sql.includes('VALUES ($1, $2, $3)')&&params[0]==='fixture'))
   pool.emit('error',new Error('idle connection failure'))
   assert.equal(cloud.connected,false);assert.equal(await cloud.connect(),false)
   await cloud.close();assert.equal(closed,1)
})
