
import { MINUTE, NOTIFY_THRESHOLD } from '../Constants.js'

export default ({ db, expire, notify }) =>
   setInterval(() => {
      const timestampMs = Date.now()

      for (const user of db.users.values()) {
         const expiry = user.premiumExpiry
         if (!expiry) continue

         const remaining = expiry - timestampMs
         if (
            remaining > 0 &&
            remaining <= NOTIFY_THRESHOLD &&
            !user._notifiedPremium
         ) {
            user._notifiedPremium = true
            notify('user', user, remaining)
         }

         if (remaining <= 0 && expiry > 0) {
            user.limit = defaultLimit
            user.energy = 100
            user.premiumExpiry = 0
            user._notifiedPremium = false
            expire('user', user, remaining)
         }
      }

      for (const group of db.groups.values()) {
         const expiry = group.rentExpiry
         if (!expiry) continue

         const remaining = expiry - timestampMs
         if (
            remaining > 0 &&
            remaining <= NOTIFY_THRESHOLD &&
            !group._notifiedRent
         ) {
            group._notifiedRent = true
            notify('group', group, remaining)
         }

         if (remaining <= 0 && expiry > 0) {
            group.rentExpiry = 0
            group._notifiedRent = false
            expire('group', group, remaining)
         }
      }
   }, MINUTE)