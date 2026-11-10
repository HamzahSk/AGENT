// lib/Scraper/search.js — Scraper pencarian (meloboom, getStickerPack, stickerLy)
import { request } from '../Request.js'
import { Scrap } from '#scrap'

let cheerioLoader

export const meloboom = async (query) => {
   const html = await request(`https://meloboom.com/en/search/${encodeURIComponent(query)}`)
   const load = cheerioLoader ??= (await import('cheerio')).load
   const $ = load(html)

   const result = []
   $('#__next > main > section > div.jsx-2244708474.container > div > div > div > div:nth-child(4) > div > div > div > ul > li').each((a, b) => {
      result.push({
         title: $(b).find('h4').text(),
         source: 'https://meloboom.com/'+$(b).find('a').attr('href'),
         audio: $(b).find('audio').attr('src')
      })
   })

   if (!result.length)
      throw new Error('Failed to get data')

   return result
}

export const getStickerPack = Object.freeze({
   search: async (query) => {
      const json = await request('https://getstickerpack.com/api/v1/stickerdb/search', {
         method: 'POST',
         body: JSON.stringify({
            query,
            page: Math.floor(Math.random() * 3) + 1
         })
      })

      if (!json.data?.length)
         throw new Error('Failed to get data')

      return json.data
   },
   detail: async (slug) => {
      const json = await request('https://getstickerpack.com/api/v1/stickerdb/stickers/' + slug)

      if (!json.data?.images?.length)
         throw new Error('Failed to get data')

      return json.data
   }
})

export const stickerLy = async (query) => {
   const json = await request('https://api.sticker.ly/v4/stickerPack/smartSearch', {
      method: 'POST',
      headers: {
         'Content-Type': 'application/json',
         'User-Agent': 'androidapp.stickerly/3.17.0 (Linux; Android 10; Redmi Note 8 Build/QKQ1.200114.002; wv; in-ID)'
      },
      body: JSON.stringify({
         keyword: query,
         enabledKeywordSearch: true,
         filter: {
            extendSearchResult: false,
            sortBy: 'RECOMMENDED',
            languages: [
               'ALL'
            ],
            minStickerCount: 5,
            searchBy: 'ALL',
            stickerType: 'ALL'
         }
      })
   })

   if (!json.result?.stickerPacks?.length)
      throw new Error('Failed to get data')

   return json.result.stickerPacks
}

Scrap.meloboom = meloboom
Scrap.getStickerPack = getStickerPack
Scrap.stickerLy = stickerLy