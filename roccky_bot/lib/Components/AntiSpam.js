

export default () => {
   const storedUser = new Map()

   const cooldown = 3000
   const maxCount = 4

   return (userId) => {
      const timestampMs = Date.now()
      const user = storedUser.get(userId)

      if (!user || timestampMs >= user.expiry) {
         storedUser.set(userId, {
            expiry: timestampMs + cooldown,
            messageCount: 1
         })
         return false
      }

      user.messageCount++

      return user.messageCount > maxCount
   }
}