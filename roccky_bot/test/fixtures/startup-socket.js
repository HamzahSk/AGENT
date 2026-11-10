import { EventEmitter } from 'node:events'
export * from '../../node_modules/baileys/src/index.js'
export const useMultiFileAuthState = async () => ({state:{creds:{registered:true},keys:{get:async()=>({}),set:async()=>{}}},saveCreds:async()=>{}})
export const makeWASocket = () => {
   const ev=new EventEmitter()
   const sock={ev,user:{id:'10000000001@s.whatsapp.net'},authState:{creds:{registered:true}},sendMessage:async()=>({key:{id:'synthetic'}}),end:()=>{}}
   setTimeout(()=>ev.emit('connection.update',{connection:'open'}),10)
   setTimeout(()=>ev.emit('connection.update',{connection:'close',lastDisconnect:{error:{output:{statusCode:440}}}}),50)
   return sock
}
