// lib/Scraper/uploader.js — File uploader eksternal (catbox / uguu / quax)
import { fileTypeFromBuffer } from 'file-type'

import { Func } from '#func'
import { request } from '../Request.js'
import { Scrap } from '#scrap'

export const catbox = async (buffer) => {
   if (!(buffer instanceof Buffer))
      throw new TypeError('Invalid input type, expects buffer')

   const check = await fileTypeFromBuffer(buffer)
   if (!check?.ext)
      throw new Error('Invalid media type')

   const form = new FormData()
   const blob = new Blob([buffer], { type: check.mime })
   form.append('reqtype', 'fileupload')
   form.append('fileToUpload', blob, `${Date.now()}.${check.ext}`)

   const data = await request('https://catbox.moe/user/api.php', {
      method: 'POST',
      headers: {
         Origin: 'https://catbox.moe',
         Referer: 'https://catbox.moe/',
         'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36'
      },
      body: form
   })

   if (!Func.isURL(data))
      throw new Error('Invalid response')

   return data.trim()
}

export const uguu = async (buffer) => {
   if (!(buffer instanceof Buffer))
      throw new TypeError('Invalid input type, expects buffer')

   const check = await fileTypeFromBuffer(buffer)
   if (!check?.ext)
      throw new Error('Invalid media type')

   const form = new FormData()
   const blob = new Blob([buffer], { type: check.mime })
   form.append('files[]', blob, `${Date.now()}.${check.ext}`)

   const data = await request('https://uguu.se/upload.php', {
      method: 'POST',
      headers: {
         Origin: 'https://uguu.se',
         Referer: 'https://uguu.se/',
         'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36'
      },
      body: form
   })

   const resultUrl = data.files?.[0]?.url

   if (!resultUrl)
      throw new Error('Invalid response')

   return resultUrl.trim()
}

export const quax = async (buffer) => {
   if (!(buffer instanceof Buffer))
      throw new TypeError('Invalid input type, expects buffer')

   const check = await fileTypeFromBuffer(buffer)
   if (!check?.ext)
      throw new Error('Invalid media type')

   const form = new FormData()
   const blob = new Blob([buffer], { type: check.mime })
   form.append('files[]', blob, `${Date.now()}.${check.ext}`)

   const data = await request('https://qu.ax/upload.php', {
      method: 'POST',
      headers: {
         Origin: 'https://qu.ax',
         Referer: 'https://qu.ax/',
         'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36'
      },
      body: form
   })

   const resultUrl = data.files?.[0]?.url
   if (!resultUrl)
      throw new Error('Invalid response')

   return resultUrl
}

Scrap.catbox = catbox
Scrap.uguu = uguu
Scrap.quax = quax