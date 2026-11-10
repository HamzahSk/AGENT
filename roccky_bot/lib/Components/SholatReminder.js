import { reportError } from '../Runtime.js'

import { delay } from 'baileys'

import { FAKE_QUOTE } from '../Constants.js'
import { request } from '../Request.js'
import { Func } from '#func'

const LOCALE_TIME_MAP = {
   'Asia/Jakarta': 1301,
   'Asia/Makassar': 2622,
   'Asia/Jayapura': 3329
}

const MESSAGES = {
   imsak: 'The time for Imsak has arrived. Please finish your pre-dawn meal.',
   subuh: 'The time for Fajr has arrived. Let us prepare for prayer.',
   terbit: 'The sun has risen. May your day go smoothly and be full of blessings.',
   dhuha: 'The time for Duha prayer has arrived. Please perform the Duha prayer.',
   dzuhur: 'The time for Dhuhr has arrived. Let us perform the prayer.',
   ashar: 'The time for Asr has arrived. Please prepare for prayer.',
   maghrib: 'The time for Maghrib has arrived. Please perform the prayer.',
   isya: 'The time for Isha has arrived. Let us complete our worship tonight.'
}

const MESSAGE_EMOJIS = {
   imsak: '🌙',
   subuh: '🌅',
   terbit: '☀️',
   dhuha: '🌤️',
   dzuhur: '🌞',
   ashar: '🌇',
   maghrib: '🌆',
   isya: '🌙'
}

const parseTime = (dateStr, timeStr) => {
   const [year, month, day] = dateStr.split('-').map(Number)
   const [hour, minute] = timeStr.split(':').map(Number)

   return new Date(year, month - 1, day, hour, minute, 0)
}

const getSchedule = async (kotaId) => {
   const now = Func.getNowInTZ()
   const year = now.getFullYear()
   const month = String(now.getMonth() + 1).padStart(2, '0')
   const day = String(now.getDate()).padStart(2, '0')

   const json = await request(`https://api.myquran.com/v2/sholat/jadwal/${kotaId}/${year}/${month}/${day}`)

   if (json?.status && json.data?.jadwal)
      return json.data

   throw new Error('Failed to get prayers schedule')
}

export default (db = {}) => {
   let socket, generation = 0, active = false
   const timers = new Set()
   const later = (run, ms, epoch) => {
      const timer = setTimeout(() => {
         timers.delete(timer)
         if (active && epoch === generation) void run().catch(error => reportError('Prayer reminder', error))
      }, ms)
      timer.unref?.(); timers.add(timer)
   }
   const stop = () => { active = false; generation++; socket = null; for (const timer of timers) clearTimeout(timer); timers.clear() }
   const refresh = async () => {
      const epoch = generation, sock = socket
      if (!active) return
      try {
         const data = await getSchedule(LOCALE_TIME_MAP[global.localTimezone] || 1301)
         const groups = await sock.groupFetchAllParticipating()
         if (!active || epoch !== generation) return
         const now = Func.getNowInTZ()
         for (const [name, value] of Object.entries(data.jadwal)) {
            if (!MESSAGES[name]) continue
            const ms = parseTime(data.jadwal.date, value) - now
            if (ms <= 0) continue
            later(async () => {
               for (const id of Object.keys(groups)) {
                  if (!active || epoch !== generation) return
                  const group = db.getGroup(id)
                  if (!group?.sholatReminder || group.mute) continue
                  try { await sock.sendText(id, Func.frame(name.toUpperCase(), [MESSAGES[name]], MESSAGE_EMOJIS[name]), FAKE_QUOTE) }
                  catch (error) { reportError('Prayer delivery', error) }
                  await delay(500)
               }
            }, ms, epoch)
         }
         later(refresh, Func.getNextMidnight(), epoch)
      } catch (error) {
         reportError('Prayer schedule; retry in five minutes', error)
         if (active && epoch === generation) later(refresh, 300000, epoch)
      }
   }
   return { stop, refresh, async start(sock) { stop(); socket = sock; active = true; await refresh() } }
}
