export class AgentError extends Error {
   constructor(message, code = 'AGENT_ERROR', details) {
      super(message)
      this.name = this.constructor.name
      this.code = code
      this.details = details
   }
}

export class AuthorizationError extends AgentError {
   constructor(message = 'This agent is restricted to the configured bot owner.') {
      super(message, 'OWNER_ONLY')
   }
}

export class PolicyError extends AgentError {
   constructor(message, details) {
      super(message, 'POLICY_DENIED', details)
   }
}

export class ProviderError extends AgentError {
   constructor(message, details) {
      super(message, 'PROVIDER_ERROR', details)
   }
}

