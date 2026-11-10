// lib/Utils/text.js — Utility teks/string umum
import { S_WHATSAPP_NET } from 'baileys'

import { MENTION_REGEX, SECOND, MINUTE, HOUR, DAY, FONT_MAPS } from '../Constants.js'

// ========== TEXT / STRING UTILITIES ==========

export const parseMentions = (text) => {
   const result = []

   if (typeof text !== 'string') return result

   if (!text.includes('@')) return result

   let match

   MENTION_REGEX.lastIndex = 0
   while ((match = MENTION_REGEX.exec(text)) !== null)
      result.push(match[1] + S_WHATSAPP_NET)

   return result
}

export const style = (text, style = 0) => {
   const map = FONT_MAPS[Number(style)] || FONT_MAPS[0]

   let result = ''
   for (const char of text)
      result += map[char] || char

   return result
}

export const toTime = (ms) => {
   const sign = ms < 0 ? '-' : ''
   ms = Math.abs(ms)

   const d = (ms / DAY) | 0
   const h = (ms / HOUR) % 24 | 0
   const m = (ms / MINUTE) % 60 | 0
   const s = (ms / SECOND) % 60 | 0

   return (
      sign +
      (d ? `${d}d ` : '') +
      `${String(h).padStart(2, '0')}h ` +
      `${String(m).padStart(2, '0')}m ` +
      `${String(s).padStart(2, '0')}s`
   )
}

export const levenshtein = (value, other, maxDistance = Infinity) => {
   if (value === other) return 0

   let length = value.length
   let lengthOther = other.length

   if (length > lengthOther) {
      [value, other] = [other, value]
      ;[length, lengthOther] = [lengthOther, length]
   }

   if (lengthOther - length > maxDistance) return maxDistance + 1

   const row = new Uint8Array(length + 1)

   for (let i = 0; i <= length; i++)
      row[i] = i

   for (let i = 1; i <= lengthOther; i++) {
      let previous = i
      let minRow = previous
      const otherChar = other.charCodeAt(i - 1)

      for (let j = 1; j <= length; j++) {
         const cost = value.charCodeAt(j - 1) === otherChar ? 0 : 1

         const deleteCost = row[j] + 1
         const insertCost = previous + 1
         const subtituteCost = row[j - 1] + cost

         let result = deleteCost
         if (insertCost < result) result = insertCost
         if (subtituteCost < result) result = subtituteCost

         row[j - 1] = previous
         previous = result

         if (result < minRow) minRow = result
      }

      row[length] = previous

      if (minRow > maxDistance)
         return maxDistance + 1
   }

   return row[length]
}