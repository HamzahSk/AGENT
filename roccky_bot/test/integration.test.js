import './helpers.js'
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, readdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { EventEmitter } from 'node:events'
import { turn } from './helpers.js'

// Imports are checked with synthetic config and network calls prohibited.
const previousFetch = global.fetch
global.fetch = async () => { throw new Error('External network prohibited in bot smoke test') }
const { default: loadFunc, Func } = await import('../lib/Function/index.js')
const { default: loadScrap } = await import('../lib/Scraper/index.js')
const { default: loadUtils } = await import('../lib/Utils/index.js')
await loadFunc();await loadScrap();await loadUtils()
const { Database, Store } = await import('../lib/Database.js')
const { scanDirectory, ModuleCache, CommandIndex, closeWatchers, loadModule } = await import('../lib/Watcher.js')
const { runPlugin } = await import('../lib/Listener.js')
const { registerAllEvents } = await import('../lib/Event.js')
const { extractMessageBody } = await import('../lib/Serialize.js')
const { closeUtilityWatchers } = await import('../lib/DirectoryLoader.js')
const { stopQuizzes } = await import('../lib/Components/QuizFactory.js')

test.after(()=>{global.fetch=previousFetch;closeWatchers();closeUtilityWatchers();stopQuizzes()})
test('all plugin modules load under the real dependency graph',async()=>{
   await scanDirectory('./plugins')
   async function files(dir){const result=[];for(const e of await readdir(dir,{withFileTypes:true})){const file=join(dir,e.name);if(e.isDirectory())result.push(...await files(file));else if(file.endsWith('.js'))result.push(resolve(file))}return result}
   const missing=(await files('./plugins')).filter(file=>!ModuleCache.has(file))
   assert.deepEqual(missing,[])
   assert.ok(CommandIndex.size>200)
})
test('plugin rejection is contained and later work still runs',async()=>{
   const calls=[];const context={sock:{sendText:async()=>calls.push('failure')},db:{requestWrite:()=>{}},command:'fixture'}
   await runPlugin({run:async()=>{throw new Error('fixture')}},{chat:'test'},context)
   await runPlugin({run:async()=>calls.push('next')},{chat:'test'},context)
   assert.deepEqual(calls,['failure','next'])
})
test('store strips socket closures, enforces caps and persists retry message content',async t=>{
   const dir=await mkdtemp(join(tmpdir(),'roccky-store-'));t.after(()=>rm(dir,{recursive:true,force:true}))
   const store=Store(join(dir,'store.json'));await store.readFromFile()
   const message={key:{id:'1',remoteJid:'chat'},id:'1',chat:'chat',message:{conversation:'hello'},reply:()=>{},sock:{credentials:'synthetic'}}
   store.setMessage(message);assert.equal(store.getMessage(message).reply,undefined);assert.equal(store.getMessage(message).sock,undefined)
   await store.close()
   const restored=Store(join(dir,'store.json'));await restored.readFromFile();assert.deepEqual(restored.getMessage(message).message,{conversation:'hello'});await restored.close()
})
test('event cleanup removes all listeners; append history does not run commands',async()=>{
   const ev=new EventEmitter(), seen=[], stored=[]
   const sock={ev,user:{id:'10000000001@s.whatsapp.net'}}
   const cache={has:()=>false,set:()=>{},del:()=>{}}
   const dispose=registerAllEvents(sock,{db:{getSetting:()=>({})},store:{setMessage:m=>stored.push(m)},listener:{message:async m=>seen.push(m)},groupCache:cache,processedMessages:cache,connectionManager:{},sholatReminder:{}})
   const message={key:{id:'1',remoteJid:'chat'},message:{conversation:'.menu'}}
   ev.emit('messages.upsert',{type:'append',messages:[message]});await turn();assert.equal(seen.length,0)
   ev.emit('messages.upsert',{type:'notify',messages:[message]});await turn();assert.equal(seen.length,1)
   await dispose();assert.deepEqual(ev.eventNames(),[])
})
test('native-flow replies route command IDs and invalid JSON is ignored',()=>{
   assert.equal(extractMessageBody({nativeFlowResponseMessage:{paramsJson:'{"id":".menu games"}'}}),'.menu games')
   assert.equal(extractMessageBody({nativeFlowResponseMessage:{paramsJson:'broken'}}),'')
})
test('failed hot reload keeps the previous working module',async t=>{
   const dir=await mkdtemp(join(tmpdir(),'roccky-plugin-'));t.after(()=>rm(dir,{recursive:true,force:true}))
   const file=join(dir,'fixture.js');await writeFile(file,"export default { command:'synthetic-command',run:async()=>{} }")
   assert.equal(await loadModule(file),true)
   await writeFile(file,"export default { command:'synthetic-command',run:async()=> 'updated' }")
   assert.equal(await loadModule(file,true),true)
   const old=CommandIndex.get('synthetic-command');assert.equal(await old.run(),'updated')
   await writeFile(file,'export default syntax error')
   assert.equal(await loadModule(file,true),false);assert.equal(CommandIndex.get('synthetic-command'),old)
})
test('all nine menu styles preserve commands on rich-send failure; text mode sends no rich payload',async()=>{
   const { default: menu } = await import('../plugins/menu.js')
   const { SCHEMA } = await import('../lib/Constants.js')
   const replies=[], rich=[]
   const oldThumbnail=Func.fetchThumbnail, oldResize=Func.resizeImage
   Func.fetchThumbnail=async()=>Buffer.from([1]);Func.resizeImage=async()=>Buffer.from([1])
   const m={chat:'chat',sender:'10000000000@s.whatsapp.net',pushName:'Test',reply:async text=>{replies.push(text);return {key:{id:'test'}}}}
   const sock={profilePicture:async()=> 'https://example.invalid/photo'}
   for(const method of ['sendList','sendCard','sendButton','sendCarousel']) sock[method]=async(_jid,options)=>{rich.push(options);throw new Error('synthetic delivery failure')}
   try {
      for(let style=1;style<=9;style++) {
         replies.length=0
         await menu.run(m,{sock,db:{users:new Map(),groups:new Map()},setting:{...SCHEMA.Setting,menuStyle:style,menuMusic:false},isPrefix:'.',command:'menu',text:''})
         assert.equal(replies.length,1,`style ${style}`);assert.match(replies[0],/\.menu games/,`style ${style} missing commands`)
      }
      const count=rich.length
      await menu.run(m,{sock,db:{users:new Map(),groups:new Map()},setting:{...SCHEMA.Setting,menuStyle:9,menuMusic:false},isPrefix:'.',command:'menu',text:'text'})
      assert.equal(rich.length,count)
      for(const options of rich) if(options.buttons) assert.ok(options.buttons.every(button=>button.type==='reply'))
      const document=rich.find(options=>options.document)
      assert.match(document.fileName,/\.pptx$/);assert.match(document.mimetype,/openxmlformats/)
   } finally {Func.fetchThumbnail=oldThumbnail;Func.resizeImage=oldResize}
})
test('restore validation leaves existing in-memory users intact on malformed records',async t=>{
   const dir=await mkdtemp(join(tmpdir(),'roccky-restore-'));t.after(()=>rm(dir,{recursive:true,force:true}))
   const db=Database(join(dir,'database.json'));await db.readFromFile();db.updateUser('existing',{name:'preserved'})
   const bad=join(dir,'bad.json');await writeFile(bad,'{"users":{"bad":null}}')
   await assert.rejects(db.readFromFile(bad));assert.equal(db.getUser('existing').name,'preserved');await db.close()
})
test('plain send failure propagates without a duplicate send',async()=>{
   const {default:Client}=await import('../lib/SocketClient.js')
   let sends=0
   const sock=Client({sendMessage:async()=>{sends++;throw new Error('synthetic transport failure')}})
   await assert.rejects(sock.sendText('chat','message'),/synthetic transport failure/)
   assert.equal(sends,1)
})
test('audio cleanup preserves caller files and removes owned output on failure',async t=>{
   const {default:Client}=await import('../lib/SocketClient.js')
   const {readFile}=await import('node:fs/promises')
   const dir=await mkdtemp(join(tmpdir(),'roccky-audio-'));t.after(()=>rm(dir,{recursive:true,force:true}))
   const input=join(dir,'input.mp3'),cover=join(dir,'cover.jpg'),output=join(dir,'output.mp3')
   await Promise.all([writeFile(input,'input'),writeFile(cover,'cover'),writeFile(output,'output')])
   const original=Func.toAudioAlbum;Func.toAudioAlbum=async()=>output
   try {
      const sock=Client({sendMessage:async()=>{throw new Error('synthetic upload failure')}})
      await assert.rejects(sock.sendAudio('chat',input,{cover}),/synthetic upload failure/)
      assert.equal(await readFile(input,'utf8'),'input');assert.equal(await readFile(cover,'utf8'),'cover')
      await assert.rejects(readFile(output),{code:'ENOENT'})
   } finally {Func.toAudioAlbum=original}
})
test('failed streaming media send closes its source stream',async()=>{
   const {default:Client}=await import('../lib/SocketClient.js')
   let stream
   const sock=Client({sendMessage:async(_jid,content)=>{stream=content.document.stream;throw new Error('synthetic send failure')}})
   await assert.rejects(sock.sendMedia('chat',Buffer.from('test'),'',null,{toStream:true,document:true,mimetype:'text/plain'}),/synthetic send failure/)
   assert.equal(stream.destroyed,true)
})
