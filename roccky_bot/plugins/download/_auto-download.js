import { URL_EXTRACT_REGEX } from '../../lib/Constants.js'
import { nekolabs, nexray, zenzxz } from '../../lib/Request.js'
import { reelsvideo, tikwm } from '../../lib/Scraper.js'
import { isURL, resizeImage } from '../../lib/Utilities.js'

export default {
   async run(m, {
      sock,
      user,
      setting,
      isPartner,
      isPremium,
      body
   }) {
      if (
         !setting.autoDownload ||
         !isPremium ||
         !isURL(body)
      ) return
      if (!isPartner) {
         if (user.limit > 0)
            user.limit -= 1
         else
            return m.reply(`⚠️ Your limit is not enough to use auto download, try \`${setting.prefixes[0]}claim\` command to claim limit.`)
      }
      URL_EXTRACT_REGEX.lastIndex = 0
      const match = URL_EXTRACT_REGEX.exec(body)
      if (!match?.[0]) return
      const url = match[0]
      try {
         if (url.includes('capcut.com')) {
            await m.react('🕒')
            const data = await nexray('downloader/capcut', {
               url
            })
            if (!data.status)
               return m.reply('❌ Failed to get data.')
            await sock.sendMedia(m.chat, data.result.url, data.result.title, m)
         }
         else if (url.includes('douyin.com')) {
            await m.react('🕒')
            const data = await nexray('downloader/douyin', {
               url
            })
            if (!data.status)
               return m.reply('❌ Failed to get data.')
            const videoContent = data.result.media.find(media => media.type === 'video')
            const imageContent = data.result.media.filter(media => media.type === 'image')
            if (imageContent.length > 1)
               return sock.sendMessage(m.chat, {
                  album: imageContent.map(image => ({
                     image: {
                        url: image.url
                     }
                  }))
               }, {
                  quoted: m
               })
            await sock.sendMedia(m.chat, videoContent.url, data.result.title, m)
         }
         else if (url.includes('facebook.')) {
            await m.react('🕒')
            const data = await nexray('downloader/facebook', {
               url
            })
            if (!data.status)
               return m.reply('❌ Failed to get data.')
            await sock.sendMedia(m.chat, data.result.video_hd || data.result.video_sd, '', m)
         }
         else if (url.includes('drive.google')) {
            await m.react('🕒')
            const data = await nexray('downloader/googledrive', {
               url
            })
            if (!data.status)
               return m.reply('❌ Failed to get data.')
            await sock.sendMedia(m.chat, data.result.url, data.result.name, m)
         }
         else if (url.includes('instagram.')) {
            await m.react('🕒')
            const data = await reelsvideo(url)
            if (!data.media.length)
               return m.reply('❌ Failed to get data.')
            if (data.media.length <= 2) {
               const resized =
                  data.media[0].type === 'image' ?
                     await resizeImage(data.media[0].url, 720) :
                     data.media[0].url
               return sock.sendMedia(m.chat, resized, '', m)
            }
            await sock.sendMessage(m.chat, {
               album: data.media.map(media => {
                  if (media.type === 'audio') return
                  return ({
                     [media.type]: {
                        url: media.url
                     }
                  })
               })
                  .filter(Boolean)
            }, {
               quoted: m
            })
         }
         else if (url.includes('mediafire.com')) {
            await m.react('🕒')
            const data = await nexray('downloader/mediafire', {
               url
            })
            if (!data.status)
               return m.reply('❌ Failed to get data.')
            await sock.sendMedia(m.chat, data.result.download_url, '', m, {
               document: true
            })
         }
         else if (url.includes('pin.it')) {
            await m.react('🕒')
            const data = await nekolabs('downloader/pinterest', {
               url
            })
            if (!data.success)
               return m.reply('❌ Failed to get data.')
            await sock.sendMedia(m.chat, data.result.medias.at(-1).url, '', m)
         }
         else if (url.includes('open.spotify.com')) {
            await m.react('🕒')
            const data = await nexray('downloader/spotify', {
               url
            })
            if (!data.status)
               return m.reply('❌ Failed to get data.')
            await sock.sendMedia(m.chat, data.result.url, '', m, {
               audio: true
            })
         }
         else if (url.includes('tiktok.com')) {
            await m.react('🕒')
            const data = await tikwm(url)
            const videoContent = data.play
            const imageContent = data.images
            if (imageContent?.length > 1)
               return sock.sendMessage(m.chat, {
                  album: imageContent.map(imageUrl => ({
                     image: {
                        url: imageUrl
                     }
                  }))
               }, {
                  quoted: m
               })
            await sock.sendMedia(m.chat, imageContent?.[0] || videoContent, data.title, m)
         }
         else if (url.includes('twitter.com') || url.includes('x.com')) {
            await m.react('🕒')
            const data = await nexray('downloader/twitter', {
               url
            })
            if (!data.status)
               return m.reply('❌ Failed to get data.')
            if (data.result.length < 2)
               return sock.sendMedia(m.chat, data.result.download_url[0].url, '', m)
            await sock.sendMessage(m.chat, {
               album: data.result.download_url
                  .filter(result => result.type === 'image' || result.type === 'video')
                  .map(value => ({
                     [value.type]: {
                        url: value.url
                     }
                  }))
            }, {
               quoted: m
            })
         }
         else if (url.includes('videy.co')) {
            await m.react('🕒')
            const data = await nexray('downloader/videy', {
               url
            })
            if (!data.status)
               return m.reply('❌ Failed to get data.')
            await sock.sendMedia(m.chat, data.result, '', m)
         }
         else if (url.includes('youtube.com') || url.includes('youtu.be')) {
            await m.react('🕒')
            const data = await nexray('downloader/v1/ytmp4', {
               url
            })
            if (!data.status)
               return m.reply('❌ Failed to get data.')
            if (data.result.duration > 1440)
               return m.reply('❌ Video is too long. Maximum duration is 24 minutes.')
            await sock.sendMedia(m.chat, data.result.url, data.result.title, m)
         }
      }
      catch (error) {
         console.error(error)
         await m.reply('❌ ' + error.message)
      }
   }
}