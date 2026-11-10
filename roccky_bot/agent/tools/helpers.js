export async function requireConfirmation(context, tool, args, reason) {
   if (context.confirmed === true) return null
   const pending = await context.memory.addConfirmation(context.ownerId, {
      tool,
      arguments: args,
      reason
   })
   return {
      ok: false,
      confirmation_required: true,
      confirmation_id: pending.id,
      reason,
      expires_at: pending.expiresAt
   }
}

export const jsonResult = value => {
   if (typeof value === 'string') return value
   return JSON.stringify(value, null, 2)
}

