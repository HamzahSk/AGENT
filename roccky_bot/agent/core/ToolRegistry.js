import { AgentError } from '../errors.js'

const validateArguments = (schema = {}, value = {}) => {
   if (schema.type === 'object' && (value === null || typeof value !== 'object' || Array.isArray(value)))
      throw new AgentError('Tool arguments must be an object.', 'INVALID_TOOL_ARGUMENTS')

   for (const name of schema.required || [])
      if (value[name] === undefined || value[name] === null || value[name] === '')
         throw new AgentError(`Missing required tool argument: ${name}`, 'INVALID_TOOL_ARGUMENTS')
}

export class ToolRegistry {
   constructor() {
      this.tools = new Map()
   }

   register(definition) {
      if (!definition?.name || typeof definition.execute !== 'function')
         throw new TypeError('A tool requires a name and execute function.')
      if (this.tools.has(definition.name)) throw new Error(`Duplicate tool: ${definition.name}`)
      this.tools.set(definition.name, definition)
      return this
   }

   definitions() {
      return [...this.tools.values()].map(tool => ({
         type: 'function',
         function: {
            name: tool.name,
            description: tool.description || '',
            parameters: tool.parameters || { type: 'object', properties: {} }
         }
      }))
   }

   async execute(name, args, context) {
      const tool = this.tools.get(name)
      if (!tool) throw new AgentError(`Unknown tool: ${name}`, 'UNKNOWN_TOOL')
      validateArguments(tool.parameters, args)
      return tool.execute(args, context)
   }
}

