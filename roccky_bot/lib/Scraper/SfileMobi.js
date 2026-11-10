
import * as cheerio from 'cheerio'
import fs from 'fs'
import path from 'path'
import { Buffer } from 'node:buffer'
import crypto from 'crypto'
import FormData from 'form-data'
import { Scrap } from '#scrap';

class SfileMobi {
  constructor() {
    // Base URL
    this.baseUrl = 'https://sfile.co'
  }

  async latest() {
    try {
      const url = this.baseUrl + '/latest'
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
        }
      })

      if (!res.ok) {
        throw new Error(`Request failed: ${res.status}`)
      }

      const html = await res.text()
      const $ = cheerio.load(html)

      const results = []

      // tiap item file
      $('.divide-y > .group').each((_, el) => {
        const anchor = $(el).find('a').first()

        const title = anchor.text().trim()
        const link = anchor.attr('href')

        const metaText = $(el)
          .find('p.text-xs')
          .text()
          .trim()

        // contoh: "18.01 MB • 26 Feb 2026"
        let size = null
        let date = null
        if (metaText.includes('•')) {
          const split = metaText.split('•').map(v => v.trim())
          size = split[0]
          date = split[1]
        }

        const icon = $(el)
          .find('img')
          .attr('src')

        if (title && link) {
          results.push({
            title,
            url: link,
            size,
            date,
            icon
          })
        }
      })

      return {
        status: true,
        total: results.length,
        results
      }

    } catch (err) {
      return {
        status: false,
        message: err.message || String(err)
      }
    }
  }

  async search(query, page = 1) {
    try {
      const url = this.baseUrl + `/search?q=${encodeURIComponent(query)}&page=${page}`
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
        }
      })

      if (!res.ok) throw new Error(`Request failed: ${res.status}`)

      const html = await res.text()
      const $ = cheerio.load(html)

      /* ===== INFO HEADER ===== */
      const titleText = $('h1.text-2xl').text().trim()
      const subtitleText = $('p.text-sm').text().trim()

      const totalResults =
        titleText.match(/([\d.]+)\sresults/i)?.[1] || null

      const showing =
        subtitleText.match(/Showing\s(.+)/i)?.[1] || null

      /* ===== LIST FILE ===== */
      const results = []

      $('div.divide-y > div.group').each((_, el) => {
        const container = $(el)

        const name = container
          .find('a.search-result-link')
          .first()
          .text()
          .trim()

        const link = container
          .find('a.search-result-link')
          .first()
          .attr('href')

        const icon = container
          .find('img')
          .attr('src')

        const infoText = container
          .find('p.text-xs')
          .text()
          .trim()

        // contoh: "149.48 KB • 26 Feb 2026"
        const [size, date] = infoText.split(' • ').map(v => v?.trim())

        if (name && link) {
          results.push({
            name,
            url: link,
            size: size || null,
            upload_date: date || null,
            icon
          })
        }
      })

      return {
        query,
        total_results: totalResults,
        showing,
        page,
        count: results.length,
        results
      }

    } catch (err) {
      return {
        error: true,
        message: err.message
      }
    }
  }

  async download(url) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
        }
      })

      const setCookies = res.headers.raw()['set-cookie'] || [];
      const cookies = setCookies
        .filter(c => c.includes('path=/download/'))
        .map(c => c.split(';')[0])
        .join('; ');

      const html = await res.text()
      const $ = cheerio.load(html)

      // 🔥 filename dari img alt
      const filename =
        $('img[src*="/icon/smallicon/"]').attr('alt') || null

      // MIME
      const mime =
        $('span.text-sm.text-slate-600')
          .map((_, el) => $(el).text().trim())
          .get()
          .find(t =>
          /^[a-z]+\/[a-z0-9.+-]+$/i.test(t)
          ) || null
          
      // author & category (1 blok)
      const infoSpan = $('span.text-sm.text-slate-600')
        .has('a[href^="https://sfile.co/user/"]')

      const authorEl = infoSpan.find('a[href^="https://sfile.co/user/"]')
      const catEl = infoSpan.find('a[href^="https://sfile.co/category/"]')

      const author = authorEl.text().trim() || null
      const author_url = authorEl.attr('href') || null

      const category = catEl.text().trim() || null
      const category_url = catEl.attr('href') || null

      // upload date & download count
      const upload_date =
        $('span:contains("Uploaded:") span.font-semibold')
          .text()
          .trim() || null

      const download_count = parseInt(
        $('span:contains("Downloads:") span.font-semibold')
          .text()
          .trim() || 0
      )

      // 📄 description
      const description =
        $('div.text-center.text-sm\\/7 p.text-slate-600')
          .text()
          .trim() || null

      // download step 1
      const dwUrl = $('[data-dw-url]').attr('data-dw-url')
      if (!dwUrl) throw new Error('Download URL not found')

      const dwRes = await fetch(dwUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0',
          'Cookie': cookies
        }
      })

      const dwHtml = await dwRes.text()
      const $$ = cheerio.load(dwHtml)

      const size =
        $$('.text-white\\/90').text().trim() || null

      const dlUrl = dwHtml
        .match(/adblockDetected\s*\?\s*"([^"]+)"/)?.[1]
        ?.replace(/\\\//g, '/')

      if (!dlUrl) throw new Error('Final download URL not found')

      return {
        success: true,
        results: {
          filename,
          mime_type: mime,
          author,
          author_url,
          category,
          category_url,
          upload_date,
          download_count,
          description,
          size,
          download_url: dlUrl
        }
      }
    } catch (e) {
      return { success: false, error: e.message }
    }
  }

  // ============= UPLOAD FUNCTIONALITY =============
  
  async upload(filename, buffer, description = '') {
    try {
      if (!buffer) throw new Error('Buffer kosong')

      // Hitung hash file dengan MD5 TERLEBIH DAHULU
      const hash = crypto
        .createHash('md5')
        .update(buffer)
        .digest('hex')

      console.log('File hash:', hash)

      // Ambil cookie dengan session yang valid
      const cookieString = await this._getSessionCookies()
      
      // ENDPOINT upload
      const uploadUrl = 'https://sfile.co/upload/resume_v2.php'
      
      // 1. CHECK HASH - menggunakan URLSearchParams (bukan FormData)
      const checkPayload = new URLSearchParams({
        'intent': 'check-hash',
        'file_hash': hash,
        'file_name': filename || ''
      })

      console.log('Checking hash...')
      const checkResponse = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
          'Accept': '*/*',
          'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'Cookie': cookieString,
          'Origin': 'https://sfile.co',
          'Referer': 'https://sfile.co/user/v1/uploads',
          'User-Agent': 'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Mobile Safari/537.36',
          'X-Requested-With': 'XMLHttpRequest'
        },
        body: checkPayload
      })

      const checkResult = await checkResponse.json()
      console.log('Check result:', checkResult)
      
      if (!checkResponse.ok || checkResult?.status !== 'success') {
        // Handle specific error cases
        if (checkResult?.reason === 'duplicate_hash') {
          return {
            status: 'error',
            message: 'File sudah ada di akun Anda',
            reason: 'duplicate_hash',
            file_short: checkResult.file_short
          }
        }
        if (checkResult?.reason === 'duplicate_name') {
          return {
            status: 'error',
            message: 'File dengan nama ini sudah ada',
            reason: 'duplicate_name',
            file_short: checkResult.file_short
          }
        }
        if (checkResult?.reason === 'daily_limit_reached') {
          return {
            status: 'error',
            message: 'Batas upload harian tercapai',
            reason: 'daily_limit_reached'
          }
        }
        throw new Error(checkResult?.message || 'Gagal check hash')
      }

      // Dapatkan normalized filename
      const normalizedFilename = checkResult.file_name || filename

      // 2. UPLOAD FILE - PAKAI FORMDATA UNTUK SEMUA PARAMETER
      const formData = new FormData()
      
      // Tambahkan file ke FormData
      formData.append('file', buffer, {
        filename: normalizedFilename,
        contentType: 'application/octet-stream'
      })

      // Tambahkan semua parameter Flow.js ke FormData
      formData.append('flowChunkNumber', '1')
      formData.append('flowChunkSize', buffer.length.toString())
      formData.append('flowCurrentChunkSize', buffer.length.toString())
      formData.append('flowTotalSize', buffer.length.toString())
      formData.append('flowIdentifier', `${buffer.length}-${hash}`)
      formData.append('flowFilename', normalizedFilename)
      formData.append('flowRelativePath', normalizedFilename)
      formData.append('flowTotalChunks', '1')
      formData.append('des', description || '') // Description
      formData.append('file_hash', hash) // HASH DI SINI - DALAM FORMDATA
      formData.append('desired_name', normalizedFilename)

      console.log('Uploading file with FormData...')
      const uploadResponse = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
          'Accept': '*/*',
          'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
          'Cookie': cookieString,
          'Origin': 'https://sfile.co',
          'Referer': 'https://sfile.co/user/v1/uploads',
          'User-Agent': 'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Mobile Safari/537.36',
          'X-Requested-With': 'XMLHttpRequest',
          ...formData.getHeaders() // Ini penting untuk boundary FormData
        },
        body: formData
      })

      const uploadResult = await uploadResponse.json()
      console.log('Upload result:', uploadResult)

      // Cek response
      if (uploadResult.share_url || uploadResult.file) {
        return {
          status: 'success',
          share_url: uploadResult.share_url,
          file: uploadResult.file,
          message: uploadResult.message || 'Upload berhasil'
        }
      }

      // Handle chunk response (untuk file besar nantinya)
      if (uploadResult.message === 'Chunk received.' || uploadResult.message === 'Chunk received') {
        return {
          status: 'success',
          message: 'Chunk received',
          chunk_received: true
        }
      }

      throw new Error(uploadResult?.message || 'Upload gagal')

    } catch (err) {
      console.error('Sfile upload error:', err)
      return {
        status: 'error',
        message: err.message || 'Upload failed',
        error: err.toString()
      }
    }
  }

  // Fungsi untuk mendapatkan cookies dengan session yang valid
  async _getSessionCookies() {
    try {
      const UA = 'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Mobile Safari/537.36'

      // 1. Request awal untuk ambil cookie
      const res1 = await fetch('https://sfile.co', {
        headers: {
          'User-Agent': UA
        }
      })

      const rawCookies = res1.headers.get('set-cookie') || ''

      const cookieArray = rawCookies
        .split(',')
        .map(c => c.split(';')[0].trim())
        .filter(Boolean)

      // 2. Ambil PHPSESSID
      let phpSessionId = cookieArray.find(c => c.startsWith('PHPSESSID='))

      if (!phpSessionId) {
        phpSessionId = 'PHPSESSID=s5j6ia1gbs8hjtfnkjl30l7tac'
      }

      // 3. Cookie wajib
      const requiredCookies = [
       '_u=d6c9d43ae0424e1b5685f7b7f85091ed',
       '_r=kuE0cjfwsL0k9BtlrE8zUiENKFKNoDfovHtiDZi73UUQz32BHfkoEURi1zZsfkpHOsUC%2Fa5RkK2T2rAq2jCI9uuPpFh5OK3zMbI4Pp2%2FtUFn0cL4adcfpD4Q9146dZS7DqbXoQgw1aw9Sr1Pc%2FfgABoGFovieXvzXlR0e1BujU8%3D',
       '_n=vbmH3NFnA%2B7YiYeB5xrbpquRl9cc%2FpEjqQKT0u40fJ%2FmfzSO0ustsBs9PB16FRaExaPvGknbeFzxArU36J1EvNhkXFyBbY%2FD%2B6%2FaxTQit4j3ac6MchkmkD5vS98iX5u%2B',
        'file_ad_cycle=2',
        phpSessionId
      ]

      const allCookies = [...new Set([...requiredCookies, ...cookieArray])]
      const cookieHeader = allCookies.join('; ')

      // 4. Request ke endpoint upload
      const res2 = await fetch('https://sfile.co/user/v1/uploads', {
        headers: {
          Accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
          'Accept-Language': 'id-ID',
          Cookie: cookieHeader,
          Origin: 'https://sfile.co',
          Referer: 'https://sfile.co/user/v1/',
          'User-Agent': UA
        }
      })

      const rawCookies2 = res2.headers.get('set-cookie') || ''

      const cookieArray2 = rawCookies2
        .split(',')
        .map(c => c.split(';')[0].trim())
        .filter(Boolean)

      const finalCookies = [...new Set([...allCookies, ...cookieArray2])]

      return finalCookies.join('; ')
    } catch (err) {
      console.error('Error getting session cookies:', err)

      return '_u=18bf16982576e1ed40384916f699a0e2; file_ad_cycle=2; PHPSESSID=s5j6ia1gbs8hjtfnkjl30l7tac; _r=JtDWYwJzMD8w5SCwxZoMRuQcW3xOoaU2vlDbRQ%2FBSdhVXmoDEog3PLXWZ3%2ByPfKpRg%2FsVNojyvAFTsVgP8QJnKitZfT5pK9aYwf3NW17pO%2FX1L9%2FYSVB4y21NyhZsvhQ2WwneZ%2BzLQ%2FWhj12HVxiI1Qp47YdhrVnbwaRDlrW%2F0o%3D; _n=S8Wif%2FA8OWnfJ07AKyYNU%2Brz8NptOWCplOKSRQcOJyEvZsr2FuvX3vsbFHeCtVcxfBitcg4VLZ6A2dqYEWHooc94c1Lf2WiNF3JijWgJS7awBn6Zf5lZmroOwtjzbUwQ'
    }
  }

  // Fungsi untuk validasi ekstensi file
  isValidExtension(filename, allowedExtensions = this._getAllowedExtensions()) {
    const ext = filename.split('.').pop().toLowerCase()
    return allowedExtensions.includes(ext)
  }

  // Daftar ekstensi yang diizinkan
  _getAllowedExtensions() {
    return [
      'ktr', 'gif', 'jpg', 'png', 'bmp', 'jar', 'jad', 'apk', 'mid', 'jpeg',
      'gz', 'tar', 'txt', 'ttf', 'pdf', 'doc', 'docx', 'cab', 'bin', 'csv',
      'css', 'dll', 'dmg', 'dwg', 'psd', 'raw', 'svg', 'tiff', 'eps', 'ai',
      'indd', 'webp', 'ico', 'iso', 'js', 'ehi', 'ehil', 'midi', 'ktc', 'ktcu',
      'ktcf', 'acm', 'ovpn', 'epro', 'twk', 'vcf', 'swf', 'acl', 'xml', 'lua',
      'm3u', 'zip', 'otf', 'mcpack', 'mcworld', 'hc', 'tls', 'viz', 'json',
      'npv2', 'npv3', 'npv4', 'pnv4', 'tnl', 'garuda', 'hat', 'v2', 'nm',
      'bussidmod', 'ssh', 'sks', 'ssc', 'pptx', 'pb', 'ziv', 'srt', 'rar',
      'xlsx', 'rtf', 'xapk', 'apks', '7z', 'dark', 'epub'
    ]
  }
}

// Buat instance SfileMobi
const sfileMobiInstance = new SfileMobi()

// Ekspor instance sebagai Scrap.SfileMobi
Scrap.SfileMobi = sfileMobiInstance
/*
// Untuk kompatibilitas dengan kode lama, ekspor juga fungsi upload langsung
Scrap.sfileUpload = async (filename, buffer, description = '') => {
  return sfileMobiInstance.upload(filename, buffer, description)
}*/