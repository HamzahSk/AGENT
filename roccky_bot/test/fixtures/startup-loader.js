import { readFile } from 'node:fs/promises'
const project = new URL('../../', import.meta.url)
export async function resolve(specifier, context, nextResolve) {
   if (specifier === 'baileys' && context.parentURL === new URL('socket.js', project).href) return { url:new URL('startup-socket.js',import.meta.url).href,shortCircuit:true }
   return nextResolve(specifier,context)
}
export async function load(url, context, nextLoad) {
   if (url === new URL('config.js', project).href) {
      const helpers = await readFile(new URL('../helpers.js', import.meta.url), 'utf8')
      return { format:'module',shortCircuit:true,source:helpers + '\nObject.assign(global,{ databaseUrl:"",databaseFilename:process.env.ROCCKY_TEST_DIRECTORY+"/database.json",storeFilename:process.env.ROCCKY_TEST_DIRECTORY+"/store.json",temporaryFolder:process.env.ROCCKY_TEST_DIRECTORY+"/temp",pairingCode:false });' }
   }
   return nextLoad(url,context)
}
