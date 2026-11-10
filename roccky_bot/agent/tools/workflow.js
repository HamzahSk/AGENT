import { randomUUID } from 'crypto'
import { AgentError } from '../errors.js'

export function registerWorkflowTools(registry) {
   registry.register({
      name: 'manage_task',
      description: 'Create or update a persistent development task so ongoing work survives across WhatsApp conversations.',
      parameters: {
         type: 'object', required: ['action'],
         properties: {
            action: { type: 'string', enum: ['list', 'create', 'update'] },
            id: { type: 'string' }, title: { type: 'string' }, details: { type: 'string' },
            status: { type: 'string', enum: ['planned', 'in_progress', 'blocked', 'done'] }
         }
      },
      async execute(args, context) {
         const state = await context.memory.load(context.ownerId)
         if (args.action === 'list') return state.tasks
         if (args.action === 'create') {
            if (!args.title) throw new AgentError('title is required to create a task.', 'INVALID_TOOL_ARGUMENTS')
            const task = { id: randomUUID().slice(0, 8), title: args.title, details: args.details || '', status: args.status || 'planned', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
            await context.memory.update(context.ownerId, memory => memory.tasks.push(task))
            return task
         }
         if (!args.id) throw new AgentError('id is required to update a task.', 'INVALID_TOOL_ARGUMENTS')
         let updated
         await context.memory.update(context.ownerId, memory => {
            const task = memory.tasks.find(item => item.id === args.id)
            if (!task) throw new AgentError(`Task not found: ${args.id}`, 'TASK_NOT_FOUND')
            for (const key of ['title', 'details', 'status']) if (args[key] !== undefined) task[key] = args[key]
            task.updatedAt = new Date().toISOString()
            updated = task
         })
         return updated
      }
   })

   registry.register({
      name: 'remember_decision',
      description: 'Persist an architectural or development decision with its rationale for future turns.',
      parameters: { type: 'object', required: ['decision'], properties: { decision: { type: 'string' }, rationale: { type: 'string' } } },
      async execute(args, context) {
         const item = { id: randomUUID().slice(0, 8), decision: args.decision, rationale: args.rationale || '', createdAt: new Date().toISOString() }
         await context.memory.update(context.ownerId, memory => {
            memory.decisions.push(item)
            memory.decisions = memory.decisions.slice(-50)
         })
         return item
      }
   })

   registry.register({
      name: 'confirm_action',
      description: 'Execute one previously queued sensitive action after the owner has naturally and explicitly approved it. Use the pending confirmation id shown in context.',
      parameters: { type: 'object', required: ['confirmation_id'], properties: { confirmation_id: { type: 'string' } } },
      async execute(args, context) {
         const pending = await context.memory.takeConfirmation(context.ownerId, args.confirmation_id)
         if (!pending) throw new AgentError('Confirmation was not found or expired.', 'CONFIRMATION_NOT_FOUND')
         return context.registry.execute(pending.tool, pending.arguments, { ...context, confirmed: true })
      }
   })
}

