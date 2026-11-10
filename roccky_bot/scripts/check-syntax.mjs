import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
const root=fileURLToPath(new URL('../',import.meta.url)), files=[]
const excluded=new Set(['node_modules','.git','.github','.agents','.codex','.aws','auth','session','sessions','storage','logs','temp','tmp','.state'])
async function walk(dir){for(const entry of await readdir(dir,{withFileTypes:true})){if(excluded.has(entry.name))continue;const path=join(dir,entry.name);if(entry.isDirectory())await walk(path);else if(/\.(?:js|cjs|mjs)$/.test(path))files.push(path)}}
await walk(root)
let cursor=0, failed=0
await Promise.all(Array.from({length:4},async()=>{
   while(cursor<files.length){const file=files[cursor++];const child=spawn(process.execPath,['--check',file],{stdio:'ignore'});const code=await new Promise(resolve=>{child.once('error',()=>resolve(1));child.once('exit',resolve)});if(code!==0){console.error('Syntax failed:',file.slice(root.length));failed++}}
}))
console.log(`Syntax checked ${files.length} files; ${failed} failures`)
process.exitCode=failed?1:0
