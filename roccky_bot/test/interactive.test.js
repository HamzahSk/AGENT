import './helpers.js'
import test from 'node:test'
import assert from 'node:assert/strict'
import { proto } from 'baileys'
import { Func } from '../lib/Function/index.js'
import { stripNullish, buttonToNativeFlow, buildNativeFlow, toFallbackText } from '../lib/Function/message.js'

const socket = () => {
   const calls = { relay: [], text: [] }
   return { calls, user: { id:'10000000001@s.whatsapp.net' }, relayMessage: async (...args) => { calls.relay.push(args); return 'relay-id' }, sendText: async (...args) => { calls.text.push(args); return { key:{ id:'fallback' } } } }
}
test('protobuf round-trip preserves binary header and native-flow version', () => {
   const payload = stripNullish({ header:{ hasMediaAttachment:true,imageMessage:{ mediaKey:Buffer.from([1,2,3]), fileSha256:new Uint8Array([4,5,6]), jpegThumbnail:undefined } }, body:{text:'Menu'}, nativeFlowMessage:buildNativeFlow([{name:'quick_reply',buttonParamsJson:'{"display_text":"Menu","id":".menu"}'}]) })
   const result = proto.Message.decode(proto.Message.encode({interactiveMessage:payload}).finish()).interactiveMessage
   assert.deepEqual(Buffer.from(result.header.imageMessage.mediaKey),Buffer.from([1,2,3]))
   assert.equal(result.nativeFlowMessage.messageVersion,1)
   assert.equal(JSON.parse(result.nativeFlowMessage.buttons[0].buttonParamsJson).id,'.menu')
})
test('native parameters retained, mixed buttons and excess count rejected', () => {
   const raw = {name:'single_select',buttonParamsJson:'{"title":"Pick","sections":[{"rows":[{"id":".menu games","title":"Games"}]}]}'}
   assert.deepEqual(JSON.parse(buttonToNativeFlow(raw).buttonParamsJson),JSON.parse(raw.buttonParamsJson))
   assert.throws(()=>buildNativeFlow([{type:'reply',id:'.menu',text:'Menu'},{type:'url',url:'https://example.invalid',text:'Link'}]),/must not mix/)
   assert.throws(()=>buildNativeFlow(Array.from({length:11},()=>'.menu')),/Too many/)
   assert.match(toFallbackText({buttons:[raw]}),/\.menu games/)
})
test('successful relay returns WebMessageInfo without duplicate protocol nodes',async()=>{
   const sock=socket()
   const result=await Func.sendButton(sock,'10000000000@s.whatsapp.net','Menu',['.help'])
   assert.ok(result.key.id);assert.ok(result.message.interactiveMessage)
   assert.equal(sock.calls.relay[0][2].additionalNodes,undefined)
   assert.equal(sock.calls.text.length,0)
})
test('one text fallback on relay/media failure; failed fallback propagates once',async()=>{
   const sock=socket();sock.relayMessage=async()=>{throw new Error('offline')}
   await Func.sendList(sock,'chat',{text:'Menu',sections:[{title:'Games',rows:[{title:'Play',id:'.quiz'}]}]})
   assert.match(sock.calls.text[0][1],/\.quiz/)
   await Func.sendCarousel(sock,'chat',{text:'Menu',cards:[{title:'Games',buttons:['.quiz']}]})
   assert.match(sock.calls.text[1][1],/\.quiz/)
   let failures=0;sock.sendText=async()=>{failures++;throw new Error('fallback offline')}
   await assert.rejects(Func.sendButton(sock,'chat','Menu',['.help']),/fallback offline/)
   assert.equal(failures,1)
})
test('explicit text mode bypasses upload and relay',async()=>{
   const sock=socket()
   await Func.sendCard(sock,'chat',{text:'Menu',image:'https://example.invalid',buttons:['.help'],textOnly:true})
   assert.equal(sock.calls.relay.length,0);assert.match(sock.calls.text[0][1],/\.help/)
})
