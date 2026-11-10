// lib/Scraper/reels.js — Scraper video Reels/TikTok (reelsvideo, tikwm)
import { createHash } from 'crypto'

import { request } from '../Request.js'
import { Scrap } from '#scrap'

let cheerioLoader

export const reelsvideo = async (url) => {
   const timestampMs = Date.now() / 1000 | 0

   const html = await request('https://reelsvideo.io/reel/DUU67gXiTwU/?igsh=MTZxdm1yd3pnN3Rvdg==/', {
      method: 'POST',
      headers: {
         Accept: '*/*',
         'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
         'Hx-Request': 'true',
         'Hx-Current-Url': 'https://reelsvideo.io/',
         'Hx-Target': 'target',
         Origin: 'https://reelsvideo.io',
         Referer: 'https://reelsvideo.io/',
         'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36'
      },
      body: new URLSearchParams({
         id: url,
         locale: 'en',
         'cf-turnstile-response': '',
         tt: createHash('md5')
            .update(timestampMs + 'X-Fc-Pp-Ty-eZ')
            .digest('hex'),
         ts: timestampMs
      })
   })

   const load = cheerioLoader ??= (await import('cheerio')).load
   const $ = load(html)

   const username = $('.bg-white span.text-400-16-18').first().text().trim() || null

   const media = []
   $('a.type_videos').each((_, el) => {
      const href = $(el).attr('href')
      if (href)
         media.push({
            type: 'video',
            url: href
         })
   })

   $('a.type_images').each((_, el) => {
      const href = $(el).attr('href')
      if (href)
         media.push({
            type: 'image',
            url: href
         })
   })

   $('a.type_audio').each((_, el) => {
      const href = $(el).attr('href')
      const id = $(el).attr('data-id')
      if (href && id)
         media.push({
            id,
            type: 'audio',
            url: href
         })
   })

   return {
      username,
      media
   }
}

export const tikwm = async (url) => {
   const json = await request('https://www.tikwm.com/api/', {
      method: 'POST',
      headers: {
         'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
         Origin: 'https://www.tikwm.com',
         Referer: 'https://www.tikwm.com/',
         'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36',
         'X-Requested-With': 'XMLHttpRequest'
      },
      body: new URLSearchParams({
         url,
         hd: 1
      })
   })

   if (json.code != 0)
      throw new Error('Failed to get data')

   return json.data
}

Scrap.reelsvideo = reelsvideo
Scrap.tikwm = tikwm