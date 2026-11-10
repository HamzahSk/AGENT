import { copyFile, mkdir, readFile, rename, stat, unlink, writeFile } from 'fs/promises'
import { basename, dirname, join } from 'path'
import { randomUUID } from 'crypto'
import { PolicyError } from '../errors.js'
import { redactSecrets } from '../security/ProjectPolicy.js'
import { requireConfirmation } from './helpers.js'

const isBinary = buffer => buffer.subarray(0, 8000).includes(0)

async function backupFile(path, context) {
   const backupRoot = join(context.config.stateDir, 'backups')
   await mkdir(backupRoot, { recursive: true })
   const name = `${Date.now()}-${randomUUID().slice(0, 6)}-${basename(path)}`
   const target = join(backupRoot, name)
   await copyFile(path, target)
   return target
}

async function atomicWrite(path, content) {
   await mkdir(dirname(path), { recursive: true })
   const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`
   await writeFile(temporary, content, 'utf8')
   await rename(temporary, path)
}

async function confirmationForCritical(args, context, tool) {
   if (!context.policy.isCritical(args.path)) return null
   return requireConfirmation(context, tool, args, `Changing critical project file ${args.path}`)
}

export function registerFilesystemTools(registry) {
   registry.register({
      name: 'read_file',
      description: 'Read a UTF-8 project file. Credential, auth-session, Git-internal, and private runtime data are blocked. Likely secret values are redacted.',
      parameters: {
         type: 'object', required: ['path'],
         properties: {
            path: { type: 'string' },
            start_line: { type: 'integer', minimum: 1 },
            end_line: { type: 'integer', minimum: 1 }
         }
      },
      async execute(args, context) {
         const checked = context.policy.assertReadable(args.path)
         await context.policy.assertNoSymlinkEscape(checked.relative)
         const buffer = await readFile(checked.absolute)
         if (buffer.length > 1_000_000) throw new PolicyError('File is too large to read directly.', { size: buffer.length })
         if (isBinary(buffer)) throw new PolicyError('Binary files cannot be read with read_file.')
         const lines = buffer.toString('utf8').split('\n')
         const start = Math.max(1, args.start_line || 1)
         const end = Math.min(lines.length, args.end_line || start + 399)
         return {
            path: checked.relative,
            startLine: start,
            endLine: end,
            totalLines: lines.length,
            content: redactSecrets(lines.slice(start - 1, end).join('\n'))
         }
      }
   })

   registry.register({
      name: 'search_files',
      description: 'Search text across readable project source files. Protected directories and secret files are excluded.',
      parameters: {
         type: 'object', required: ['query'],
         properties: {
            query: { type: 'string' },
            path: { type: 'string' },
            case_sensitive: { type: 'boolean' },
            max_results: { type: 'integer', minimum: 1, maximum: 300 }
         }
      },
      async execute(args, context) {
         const checked = context.policy.assertReadable(args.path || '.')
         const commandArgs = ['-n', '--no-heading', '--color', 'never', '--glob', '!.env*', '--glob', '!auth/**', '--glob', '!session*/**', '--glob', '!node_modules/**', '--glob', '!.git/**']
         if (globalThis.authFolder) commandArgs.push('--glob', `!${String(globalThis.authFolder).replaceAll('\\', '/').replace(/^\.\//, '')}/**`)
         for (const privateFile of [globalThis.databaseFilename, globalThis.storeFilename].filter(Boolean))
            commandArgs.push('--glob', `!${String(privateFile).replaceAll('\\', '/').replace(/^\.\//, '')}`)
         if (!args.case_sensitive) commandArgs.push('-i')
         commandArgs.push('--', args.query, checked.relative)
         const result = await context.runProcess('rg', commandArgs, { timeoutMs: 30_000, maxOutput: 200_000 })
         const lines = redactSecrets(result.stdout).split('\n').filter(Boolean).slice(0, args.max_results || 100)
         return { matches: lines, exitCode: result.exitCode, truncated: lines.length >= (args.max_results || 100) }
      }
   })

   registry.register({
      name: 'write_file',
      description: 'Create a new UTF-8 file or replace an existing non-sensitive file atomically. Existing files are backed up; critical files require confirmation.',
      parameters: {
         type: 'object', required: ['path', 'content'],
         properties: {
            path: { type: 'string' }, content: { type: 'string' },
            mode: { type: 'string', enum: ['create', 'overwrite'], description: 'create refuses to replace an existing file' }
         }
      },
      async execute(args, context) {
         const checked = context.policy.assertWritable(args.path)
         await context.policy.assertNoSymlinkEscape(checked.relative, { allowMissing: true })
         let exists = true
         try { await stat(checked.absolute) } catch (error) { if (error.code === 'ENOENT') exists = false; else throw error }
         if (exists && (args.mode || 'create') !== 'overwrite') throw new PolicyError('File already exists. Read it first and use overwrite or apply_replacements.')
         const pending = await confirmationForCritical(args, context, 'write_file')
         if (pending) return pending
         const backup = exists ? await backupFile(checked.absolute, context) : null
         await atomicWrite(checked.absolute, args.content)
         return { ok: true, path: checked.relative, created: !exists, backup }
      }
   })

   registry.register({
      name: 'apply_replacements',
      description: 'Edit a text file using exact old/new replacements. Refuses stale or ambiguous matches, backs up the original, and requires confirmation for critical files.',
      parameters: {
         type: 'object', required: ['path', 'replacements'],
         properties: {
            path: { type: 'string' },
            replacements: {
               type: 'array', minItems: 1,
               items: { type: 'object', required: ['old', 'new'], properties: { old: { type: 'string' }, new: { type: 'string' }, all: { type: 'boolean' } } }
            }
         }
      },
      async execute(args, context) {
         const checked = context.policy.assertWritable(args.path)
         await context.policy.assertNoSymlinkEscape(checked.relative)
         const pending = await confirmationForCritical(args, context, 'apply_replacements')
         if (pending) return pending
         let content = await readFile(checked.absolute, 'utf8')
         for (const replacement of args.replacements) {
            if (!replacement.old) throw new PolicyError('Replacement old text cannot be empty.')
            const count = content.split(replacement.old).length - 1
            if (!count) throw new PolicyError('Exact replacement text was not found; re-read the file.', { old: replacement.old.slice(0, 200) })
            if (count > 1 && !replacement.all) throw new PolicyError('Replacement is ambiguous; provide more context or set all=true.', { occurrences: count })
            content = replacement.all ? content.split(replacement.old).join(replacement.new) : content.replace(replacement.old, replacement.new)
         }
         const backup = await backupFile(checked.absolute, context)
         await atomicWrite(checked.absolute, content)
         return { ok: true, path: checked.relative, replacements: args.replacements.length, backup }
      }
   })

   registry.register({
      name: 'make_directory',
      description: 'Create a project directory recursively.',
      parameters: { type: 'object', required: ['path'], properties: { path: { type: 'string' } } },
      async execute(args, context) {
         const checked = context.policy.assertWritable(args.path)
         await context.policy.assertNoSymlinkEscape(checked.relative, { allowMissing: true })
         await mkdir(checked.absolute, { recursive: true })
         return { ok: true, path: checked.relative }
      }
   })

   registry.register({
      name: 'delete_file',
      description: 'Delete one non-sensitive file. Always requires explicit owner confirmation and never deletes directories.',
      parameters: { type: 'object', required: ['path'], properties: { path: { type: 'string' } } },
      async execute(args, context) {
         const checked = context.policy.assertWritable(args.path)
         await context.policy.assertNoSymlinkEscape(checked.relative)
         const info = await stat(checked.absolute)
         if (!info.isFile()) throw new PolicyError('delete_file only accepts a regular file.')
         const pending = await requireConfirmation(context, 'delete_file', args, `Permanently delete ${checked.relative}`)
         if (pending) return pending
         const backup = await backupFile(checked.absolute, context)
         await unlink(checked.absolute)
         return { ok: true, deleted: checked.relative, recoverableBackup: backup }
      }
   })
}

