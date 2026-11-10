import test from 'node:test'
import assert from 'node:assert/strict'
import { solvePow } from '../AI-SEERVER/pow.js'
import { dsSolve } from '../AI-SEERVER/deepseek_apk.js'

test('PoW worker matches the existing solver and keeps the main loop responsive',async()=>{
   const challenge='00'.repeat(32),prefix='synthetic_1_'
   let timerFired=false
   const timer=setTimeout(()=>{timerFired=true},0)
   const answer=await solvePow(challenge,prefix,20)
   clearTimeout(timer)
   assert.equal(answer,dsSolve(challenge,prefix,20));assert.equal(timerFired,true)
})
test('PoW cancellation and failure do not poison the queue',async()=>{
   const abort=new AbortController();abort.abort(new Error('synthetic cancellation'))
   await assert.rejects(solvePow('00'.repeat(32),'fixture_',10,{signal:abort.signal}),/cancellation/)
   await assert.rejects(solvePow('invalid','fixture_',10),/failed/)
   assert.equal(await solvePow('00'.repeat(32),'fixture_',1),undefined)
})
