import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp,rm,readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

test('existing launcher starts a worker and stops cleanly on terminal disconnect',async t=>{
   const directory=await mkdtemp(join(tmpdir(),'roccky-startup-'));t.after(()=>rm(directory,{recursive:true,force:true}))
   const child=spawn(process.execPath,['--import',fileURLToPath(new URL('./fixtures/startup-register.js',import.meta.url)),'index.js'],{
      cwd:fileURLToPath(new URL('../',import.meta.url)),env:{PATH:process.env.PATH,ROCCKY_AI_SERVER:'false',ROCCKY_DATABASE_URL:'',ROCCKY_TEST_DIRECTORY:directory},stdio:['ignore','pipe','pipe']
   })
   let output='';child.stdout.on('data',chunk=>{output+=chunk});child.stderr.on('data',chunk=>{output+=chunk})
   const timer=setTimeout(()=>child.kill('SIGKILL'),15000)
   try {
      const [code]=await once(child,'exit')
      // Fixture output contains no actual configuration or auth records.
      assert.equal(code,78,output)
      assert.match(output,/WhatsApp connected/)
      assert.match(output,/session preserved/)
      assert.doesNotMatch(output,/Plugin load|Worker startup|Unexpected runtime failure/)
      assert.ok(!(await readdir(directory)).includes('auth'))
   } finally {clearTimeout(timer);child.kill()}
})
