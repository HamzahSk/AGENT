import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { createMediaRunner } from '../lib/MediaProcess.js'
import { fetchBuffer } from '../lib/Http.js'
import { turn } from './helpers.js'

test('download cap and timeout cover the body; caller abort is preserved',async t=>{
   const server=createServer((req,res)=>{
      if(req.url==='/large'){res.writeHead(200,{'content-type':'application/octet-stream'});res.end(Buffer.alloc(100));return}
      res.writeHead(200);res.write('a')
   })
   server.listen(0,'127.0.0.1');await once(server,'listening')
   t.after(()=>{server.closeAllConnections();server.close()})
   const url=`http://127.0.0.1:${server.address().port}`
   await assert.rejects(fetchBuffer(url+'/large',{maxBytes:20}),{code:'DOWNLOAD_LIMIT'})
   await assert.rejects(fetchBuffer(url+'/slow',{timeoutMs:30}), /abort|timeout/i)
   const controller=new AbortController();controller.abort()
   await assert.rejects(fetchBuffer(url+'/large',{signal:controller.signal}), /abort/i)
})
test('media stream retains queue slot until process close',async()=>{
   const runner=createMediaRunner({concurrency:1,timeoutMs:1000})
   const stream=await runner.run(process.execPath,['-e',"process.stdout.write('a');setTimeout(()=>process.stdout.write('b'),150)"],{stream:true})
   stream.resume()
   let second=false
   const next=runner.run(process.execPath,['-e','']).then(()=>{second=true})
   await turn();assert.equal(runner.queue.pending,1);assert.equal(second,false)
   await next;await runner.queue.onIdle();assert.equal(second,true)
})
test('missing executable and timed-out process release queue capacity',async()=>{
   const runner=createMediaRunner({concurrency:1,timeoutMs:30})
   await assert.rejects(runner.run('/nonexistent-roccky-executable',[]),{code:'ENOENT'})
   await assert.rejects(runner.run(process.execPath,['-e','setInterval(()=>{},1000)']),{code:'MEDIA_TIMEOUT'})
   await runner.queue.onIdle();assert.equal(runner.queue.pending,0)
})
