// lib/Utils/datetime.js — Utility waktu & zona waktu

// Asumsikan localTimezone sudah didefinisikan di global/config
const localTimezone = global.localTimezone || 'Asia/Jakarta'

export const HourFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: localTimezone,
  hour: '2-digit',
  hour12: false
})

export const DateTimeFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: localTimezone,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false
})

export const getIndonesianTimezone = () => {
  if (localTimezone.endsWith('Jakarta')) return 'WIB'
  if (localTimezone.endsWith('Makassar')) return 'WIT'
  if (localTimezone.endsWith('Jayapura')) return 'WITA'
  return 'WIB'
}

export const getNowInTZ = () =>
  new Date(new Date().toLocaleString('en-US', { timeZone: localTimezone }))

export const getNextMidnight = () => {
  const now = new Date()
  const timezoneNow = getNowInTZ()
  const timezoneMidnight = new Date(timezoneNow)
  timezoneMidnight.setHours(24, 0, 0, 0)
  const offset = now.getTime() - timezoneNow.getTime()
  const realMidnight = timezoneMidnight.getTime() + offset
  return realMidnight - now.getTime()
}

export const greeting = (now = Date.now()) => {
  const hour = Number(HourFormatter.format(now))
  if (hour >= 4 && hour < 10) return 'Good Morning 🌄'
  if (hour >= 10 && hour < 15) return 'Good Afternoon ☀️'
  if (hour >= 15 && hour < 18) return 'Good Evening 🌆'
  return 'Good Night 🌙'
}

export const formatTime = (format = 'YYYY/MM/DD HH:mm:ss', now = Date.now()) => {
  const parts = DateTimeFormatter.formatToParts(now)
  const map = {}
  for (const { type, value } of parts)
    if (type !== 'literal') map[type] = value
  const tokens = {
    YYYY: map.year,
    MM: map.month,
    DD: map.day,
    HH: map.hour,
    mm: map.minute,
    ss: map.second
  }
  return format.replace(/YYYY|MM|DD|HH|mm|ss/g, t => tokens[t])
}