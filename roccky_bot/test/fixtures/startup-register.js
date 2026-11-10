import { register } from 'node:module'
register('./startup-loader.js',import.meta.url)
global.fetch=async()=>{throw new Error('External network prohibited in startup fixture')}
