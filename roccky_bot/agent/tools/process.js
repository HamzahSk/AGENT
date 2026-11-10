import { spawn } from 'child_process'
import { redactSecrets } from '../security/ProjectPolicy.js'
import { PolicyError } from '../errors.js'
import { requireConfirmation } from './helpers.js'
import { assertPublicUrl } from './network.js'

const READ_ONLY_GIT = new Set(['status', 'diff', 'log', 'show', 'grep', 'ls-files', 'branch', 'rev-parse'])
const ALLOWED = new Set(['git', 'node', 'bun', 'npm', 'ls', 'wc'])

export function runProcess(command, args, { cwd, timeoutMs = 120_000, maxOutput = 120_000, env = {} } = {}) {
   return new Promise((resolve, reject) => {
      const child = spawn(command, args, {
         cwd,
         shell: false,
         windowsHide: true,
         env: {
            PATH: process.env.PATH,
            NODE_ENV: process.env.NODE_ENV || 'development',
            TZ: process.env.TZ || 'UTC',
            ...env
         }
      })
      let stdout = ''
      let stderr = ''
      let truncated = false
      const append = (current, chunk) => {
         if (current.length >= maxOutput) { truncated = true; return current }
         const next = current + chunk.toString()
         if (next.length > maxOutput) truncated = true
         return next.slice(0, maxOutput)
      }
      child.stdout?.on('data', chunk => { stdout = append(stdout, chunk) })
      child.stderr?.on('data', chunk => { stderr = append(stderr, chunk) })
      const timer = setTimeout(() => child.kill('SIGTERM'), timeoutMs)
      child.once('error', error => { clearTimeout(timer); reject(error) })
      child.once('close', exitCode => {
         clearTimeout(timer)
         resolve({ exitCode, stdout, stderr, truncated })
      })
   })
}

const mutatesProject = (command, args) => {
   if (command === 'git') return !READ_ONLY_GIT.has(args[0])
   if (command === 'npm' || command === 'bun') return !['test', 'run'].includes(args[0])
   return false
}

const validateCommand = async (command, args, context) => {
   if (!ALLOWED.has(command)) throw new PolicyError(`Command is not allowlisted: ${command}`)
   const joined = args.join(' ')
   if (/(^|[\\/])\.env(?:\.|$)|(^|[\\/])(auth|sessions?|sessionbackup|\.git)([\\/]|$)/i.test(joined))
      throw new PolicyError('Command arguments reference a protected path.')
   if (command === 'node' && args.some(arg => ['-e', '--eval', '-p', '--print'].includes(arg)))
      throw new PolicyError('Inline Node.js evaluation is disabled. Write reviewed project code and run a file or use --check.')
   if (args.some(arg => /^(--env-file|--require=-|--import=data:)/.test(arg)))
      throw new PolicyError('Command flag is not allowed by the agent policy.')
   if (command === 'git') {
      const operation = args[0]
      if (['fetch', 'pull', 'push', 'remote', 'submodule'].includes(operation))
         throw new PolicyError(`Network Git operation is disabled: ${operation}`)
      if (operation === 'clone') {
         const source = args.find(arg => /^https?:\/\//i.test(arg))
         if (!source) throw new PolicyError('git clone only accepts a public HTTP(S) repository URL.')
         await assertPublicUrl(source)
      }
   }
   for (const arg of args.filter(arg => !arg.startsWith('-')))
      if (!/^https?:\/\//i.test(arg)) context.policy.assertReadable(arg)
}

export function registerProcessTools(registry) {
   registry.register({
      name: 'run_command',
      description: 'Run an allowlisted executable without a shell for tests, syntax checks, search, or Git inspection. Shell operators are not supported. Mutating Git/package operations require confirmation.',
      parameters: {
         type: 'object', required: ['command'],
         properties: {
            command: { type: 'string' },
            args: { type: 'array', items: { type: 'string' } },
            cwd: { type: 'string' },
            timeout_ms: { type: 'integer', minimum: 1000, maximum: 300000 }
         }
      },
      async execute(args, context) {
         const commandArgs = Array.isArray(args.args) ? args.args.map(String) : []
         await validateCommand(args.command, commandArgs, context)
         const cwd = context.policy.assertReadable(args.cwd || '.').absolute
         if (mutatesProject(args.command, commandArgs)) {
            const pending = await requireConfirmation(context, 'run_command', args, `Run potentially mutating command: ${args.command} ${commandArgs.join(' ')}`)
            if (pending) return pending
         }
         const result = await context.runProcess(args.command, commandArgs, {
            cwd,
            timeoutMs: Math.min(args.timeout_ms || context.config.commandTimeoutMs, 300_000),
            maxOutput: 120_000
         })
         return {
            command: [args.command, ...commandArgs],
            exitCode: result.exitCode,
            stdout: redactSecrets(result.stdout),
            stderr: redactSecrets(result.stderr),
            truncated: result.truncated
         }
      }
   })
}

