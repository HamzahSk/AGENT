import { once } from 'node:events'

import { exec, spawn } from 'child_process'
import { format, promisify } from 'util'
import vm from 'vm'

const execAsync = promisify(exec)

export default {
   async run(m, context) {
      const { body, isOwner, sock, func, scrap } = context
      if (typeof body !== 'string' || !isOwner) return
      const trimmedBody = body.trim()
      const firstSpaceIndex = trimmedBody.indexOf(' ')
      if (firstSpaceIndex === -1) return
      const command = trimmedBody.slice(0, firstSpaceIndex)
      const code = trimmedBody
         .slice(firstSpaceIndex + 1)
         .trim()
      const validCommands = ['>', '=>', '~', '~>', '$', '%']
      if (!validCommands.includes(command) || !code) return
      try {
         if (['>', '=>', '~', '~>'].includes(command)) {
            const isReturn = command === '=>' || command === '~>'
            const isSafe = command === '~' || command === '~>'
            const iife = `(async () => { ${isReturn ? 'return ' : ''}${code} })()`
            let evaluate
            if (isSafe)
               evaluate = await safeEval(iife, { ...context, m })
            else
               evaluate = await eval(iife)
            const formatEval = format(evaluate)
            const isFalsyString = formatEval === 'null' ||
               formatEval === 'undefined' ||
               formatEval === 'false'
            if (!isFalsyString)
               await m.reply(formatEval)
         }
         else if (command === '$') {
            await m.react('🕒')
            const rawArgs = code.split(' ')
            const args = []
            for (let i = 0; i < rawArgs.length; i++)
               if (rawArgs[i].trim() !== '')
                  args.push(rawArgs[i].trim())
            const cmd = args.shift()
            const proc = spawn(cmd, args)
            let stdoutData = '', stderrData = ''
            const timer = setTimeout(() => proc.kill('SIGKILL'), 60000)
            proc.stdout.on('data', data => { stdoutData += data.toString(); if (stdoutData.length > 50000) { stdoutData = stdoutData.slice(0, 50000); proc.kill('SIGKILL') } })
            proc.stderr.on('data', data => { stderrData += data.toString(); if (stderrData.length > 50000) { stderrData = stderrData.slice(0, 50000); proc.kill('SIGKILL') } })
            try {
               const [code] = await once(proc, 'close')
               const result = [stdoutData && `[STDOUT]:\n${stdoutData.trim()}`, stderrData && `[STDERR]:\n${stderrData.trim()}`].filter(Boolean).join('\n\n')
               await m.reply(result || `Process exited with code ${code}`)
            } finally { clearTimeout(timer) }
         }
         else if (command === '%') {
            await m.react('🕒')
            const { stdout, stderr } = await execAsync(code, { 
               maxBuffer: 1024 * 1024, 
               timeout: 60000 
            })
            let output = ''
            if (stderr)
               output += `[STDERR]:\n${stderr.toString().trim()}\n\n`
            if (stdout)
               output += `[STDOUT]:\n${stdout.toString().trim()}`
            if (output)
               await m.reply(output.trim())
         }
      }
      catch (error) {
         await m.reply('```\n' + format(error) + '\n```')
      }
   },
   owner: true
}

const safeEval = async (code, extraContext = {}) => {
   const sandbox = {
      console: { log: () => {} },
      ...extraContext,
      process: undefined,
      global: undefined,
      globalThis: undefined,
      this: undefined,
      constructor: undefined
   }

   sandbox.eval = () => { throw new Error('eval is disabled in safe mode') }
   sandbox.Function = () => { throw new Error('Function constructor is disabled in safe mode') }
   sandbox.require = () => { throw new Error('require is disabled in safe mode') }

   Object.freeze(sandbox)
   const context = vm.createContext(sandbox)
   const script = new vm.Script(code)

   try {
      const result = await script.runInContext(context, { timeout: 3000 })
      return result
   }
   catch (error) {
      return '❌ ' + error.message
   }
}