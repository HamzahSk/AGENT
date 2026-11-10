
import { Agent, setGlobalDispatcher } from 'undici'

setGlobalDispatcher(
   new Agent({
      connections: 4,
      pipelining: 1,
      keepAliveTimeout: 4000,
      keepAliveMaxTimeout: 15000,
      connectTimeout: 10000,
      bodyTimeout: 60000,
      maxRedirections: 3,
      connect: {
         family: 4
      }
   })
)