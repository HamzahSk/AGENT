import { fetchBuffer } from './Http.js'
export const request = async (url, options = {}) => {
   const { buffer, contentType } = await fetchBuffer(url, options)
   if (/^(audio|image|video)\//i.test(contentType) || /octet|application\/(pdf|zip)/i.test(contentType)) return buffer
   if (contentType.startsWith('text')) return buffer.toString('utf8')
   return JSON.parse(buffer.toString('utf8'))
}

export const deline = async (path = '', params = {}, options) =>
   request(
      `https://api.deline.web.id/` +
      path + '?' +
      new URLSearchParams(params),
      options
   )

export const faa = async (path = '', params = {}, options) =>
   request(
      `https://api-faa.my.id/faa/` +
      path + '?' +
      new URLSearchParams(params),
      options
   )

export const nekolabs = async (path = '', params = {}, options) =>
   request(
      `https://rynekoo-api.hf.space/` +
      path + '?' +
      new URLSearchParams(params),
      options
   )

export const nexray = async (path = '', params = {}, options) =>
   request(
      `https://api.nexray.web.id/` +
      path + '?' +
      new URLSearchParams(params),
      options
   )

export const zenzxz = async (path = '', params = {}, options) =>
   request(
      `https://api.zenzxz.my.id/` +
      path + '?' +
      new URLSearchParams(params),
      options
   )