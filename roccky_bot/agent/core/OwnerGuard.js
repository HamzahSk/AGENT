import { AuthorizationError } from '../errors.js'

const bareJid = (value) => String(value || '')
   .split('@')[0]
   .split(':')[0]
   .replace(/\D/g, '')

const phoneIdentity = value => {
   const jid = String(value || '').trim().toLowerCase()
   if (jid.endsWith('@lid')) return ''
   return bareJid(jid)
}

const configuredOwners = () => {
   const values = [globalThis.ownerNumber, ...(Array.isArray(globalThis.owners) ? globalThis.owners : [])]
   return new Set(values.map(bareJid).filter(Boolean))
}

const inputIdentities = input => [
   input.sender,
   input.senderJid,
   input.senderPn,
   input.resolvedPn,
   input.participant,
   input.message?.sender,
   input.message?.senderPn
].map(phoneIdentity).filter(Boolean)

export class OwnerGuard {
   isAuthorized(input = {}) {
      if (input.isOwner !== true) return false

      const owners = configuredOwners()
      if (!owners.size) return false

      const identities = inputIdentities(input)

      return identities.some(identity => owners.has(identity))
   }

   assert(input) {
      if (!this.isAuthorized(input)) throw new AuthorizationError()
      return true
   }

   ownerId(input) {
      this.assert(input)
      const owners = configuredOwners()
      const identities = inputIdentities(input)
      return identities.find(identity => owners.has(identity)) || [...owners][0]
   }
}

export { bareJid }

