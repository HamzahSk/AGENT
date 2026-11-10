// lib/Utils/general.js — Utility umum pure (tanpa dependensi eksternal)
// ========== UTILITY UMUM (PURE) ==========

export const isEmptyObject = (object) => {
   for (const _ in object) return false
   return true
}

export const createFileName = () =>
   `${process.pid}_${performance.now().toString().replace('.', '')}`

export const randomHex = () =>
   `#${((Math.random() * 0xFFFFFF) | 0).toString(16).padStart(6, '0').toUpperCase()}`

export const toTitleCase = (str = 'hello') =>
   String(str).replace(/\b\w/g, c => c.toUpperCase())

export const formatNumber = (number) =>
   number.toLocaleString('en-US')

export const medal = (index) => {
   if (index === 0) return '🥇'
   if (index === 1) return '🥈'
   if (index === 2) return '🥉'
   return index + 1 + '.'
}

export const applySchema = (target, schema) => {
   for (const key in schema)
      if (!(key in target))
         target[key] = schema[key]
}

export const toArray = (value) =>
   typeof value === 'string'
      ? [value]
      : Array.isArray(value)
         ? value
         : []

export const shuffleArray = (array) => {
   if (!Array.isArray(array)) return [array]

   for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[array[i], array[j]] = [array[j], array[i]]
   }

   return array
}

export const randomInteger = (min, max) =>
   Math.floor(
      Math.pow(Math.random(), 2) * (max - min + 1)
   ) + min

export const randomValue = (array) =>
   array[Math.floor(Math.random() * array.length)]