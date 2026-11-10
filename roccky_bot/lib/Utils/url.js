// lib/Utils/url.js — Utility URL umum
import { WHATSAPP_URL_REGEX } from '../Constants.js'

// ========== URL UTILITIES ==========
/**
 * Memeriksa apakah string adalah URL yang valid.
 * Dibuat lebih fleksibel untuk menangani link CDN/Downloader yang kompleks.
 */
export const isURL = (url) => {
   if (!url || typeof url !== 'string') return false

   try {
      if (typeof URL.canParse === 'function' && URL.canParse(url)) return true

      const URL_REGEX = /^(https?:\/\/)[^\s]+$/i
      if (URL_REGEX.test(url)) return true

      if (url.startsWith('http://') || url.startsWith('https://')) {
         if (url.includes('googlevideo.com') || url.includes('.vercel.app')) return true
      }

      new URL(url)
      return true
   } catch {
      return false
   }
}

export const isWhatsAppURL = (string) => {
   if (typeof string !== 'string') return false

   return string.includes('whatsapp.com') || WHATSAPP_URL_REGEX.test(string)
}