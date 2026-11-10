import { MINUTE, NOTIFY_THRESHOLD } from '../Constants.js'
import { reportError } from '../Runtime.js'

export default ({ db, expire, notify, intervalMs = MINUTE }) => {
   let active = null, stopped = false
   const tick = () => {
      if (active) return active
      if (stopped) return Promise.resolve()
      active = (async () => {
         const now = Date.now()
         for (const [type, records, field, notified] of [
            ['user', db.users, 'premiumExpiry', '_notifiedPremium'],
            ['group', db.groups, 'rentExpiry', '_notifiedRent']
         ]) for (const record of records.values()) {
            if (stopped) return
            const expiry = record[field]
            if (!(expiry > 0)) continue
            const remaining = expiry - now
            try {
               if (remaining > 0 && remaining <= NOTIFY_THRESHOLD && !record[notified]) {
                  await notify(type, record, remaining)
                  record[notified] = true
                  db.requestWrite()
               }
               if (remaining <= 0) {
                  record[field] = 0
                  record[notified] = false
                  if (type === 'user') { record.limit = global.defaultLimit ?? 25; record.energy = 100 }
                  db.requestWrite()
                  await expire(type, record, remaining)
               }
            } catch (error) { reportError('Expiry notification', error) }
         }
      })().finally(() => { active = null })
      return active
   }
   const timer = setInterval(() => { void tick().catch(error => reportError('Scheduler', error)) }, intervalMs)
   timer.unref?.()
   return { tick, stop() { stopped = true; clearInterval(timer); return active || Promise.resolve() } }
}
