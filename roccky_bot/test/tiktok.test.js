import test from 'node:test'
import assert from 'node:assert/strict'
import tiktok from '../plugins/download/tiktok.js'

const sourceUrl = 'https://vt.tiktok.com/ZSUYJLQfg/'
const media = {
   audio: 'https://example.invalid/music.mp3',
   video_no_watermark: 'https://example.invalid/video.mp4',
   video_with_watermark: 'https://example.invalid/watermark.mp4'
}
const metadata = () => ({
   ok: true,
   title: 'TikTok / sample: title',
   author: { nickname: 'Tester', username: 'tester' },
   duration: 15,
   stats: { plays: 12345, likes: 0, comments: 12, shares: 3 },
   music: { title: 'Sample music' },
   media: { ...media }
})

function fixture(t, {
   command = 'tiktok', prefix = '.', args = [sourceUrl], data = metadata(),
   fileSize = { bytes: 1024, size: '1 KB' }, status = 200, body,
   fetchError, mediaError, buttonError, replyError, withButtons = true
} = {}) {
   const calls = { requests: [], sizes: [], media: [], buttons: [], replies: [], reactions: [], events: [], errors: [] }
   const sentMedia = { key: { id: 'media', remoteJid: 'chat' }, message: { videoMessage: {} } }
   t.mock.method(globalThis, 'fetch', async (...args) => {
      calls.requests.push(args)
      if (fetchError) throw fetchError
      return new Response(body ?? JSON.stringify(data), { status })
   })
   t.mock.method(console, 'error', (...args) => calls.errors.push(args))
   const m = {
      chat: 'chat',
      react: async emoji => {
         calls.reactions.push(emoji)
         calls.events.push('react:' + emoji)
      },
      reply: async text => {
         calls.replies.push(text)
         if (replyError) throw replyError
         return { key: { id: 'text' } }
      }
   }
   const sock = {
      sendMedia: async (...args) => {
         calls.media.push(args)
         calls.events.push('media')
         if (mediaError) throw mediaError
         return sentMedia
      }
   }
   if (withButtons) sock.sendButton = async (...args) => {
      calls.buttons.push(args)
      calls.events.push('buttons')
      if (buttonError) throw buttonError
      return { key: { id: 'buttons' } }
   }
   const context = {
      sock, isPrefix: prefix, command, args,
      func: { getFileSize: async url => { calls.sizes.push(url); return fileSize } }
   }
   return { calls, context, m, sentMedia, run: () => tiktok.run(m, context) }
}

test('downloads immediately and offers usable quick replies after the video', async t => {
   const { calls, m, sentMedia, run } = fixture(t)
   await run()
   assert.equal(calls.requests.length, 1)
   assert.equal(new URL(calls.requests[0][0]).searchParams.get('url'), sourceUrl)
   assert.ok(calls.requests[0][1].signal instanceof AbortSignal)
   assert.deepEqual(calls.sizes, [media.video_no_watermark])
   assert.equal(calls.media.length, 1)
   assert.equal(calls.media[0][1], media.video_no_watermark)
   assert.equal(calls.media[0][3], m)
   assert.equal(calls.media[0][4].type, 'video')
   assert.equal(calls.media[0][4].toStream, true)
   assert.equal(calls.media[0][4].document, false)
   assert.match(calls.media[0][2], /Tester \(@tester\)/)
   assert.match(calls.media[0][2], /12\.345/)
   assert.match(calls.media[0][2], /\*Likes\*: 0/)
   assert.match(calls.media[0][2], /Sample music/)
   assert.match(calls.media[0][2], /1 KB/)
   assert.deepEqual(calls.reactions, ['🕒', '✅'])
   assert.deepEqual(calls.events, ['react:🕒', 'media', 'react:✅', 'buttons'])
   const options = calls.buttons[0][1]
   assert.equal(options.quoted, sentMedia)
   assert.equal(options.fallback, false)
   assert.equal(options.fallbackText, options.text)
   assert.deepEqual(options.buttons.map(button => button.id), [
      '.ttmp3 ' + sourceUrl, '.ttvn ' + sourceUrl, '.tikwm ' + sourceUrl
   ])
   for (const button of options.buttons) {
      assert.equal(button.type, 'reply')
      assert.ok(options.text.includes(button.id), 'commands remain visible if controls are hidden')
   }
   assert.equal(calls.replies.length, 0)
})

test('a format button can be routed back into the downloader', async t => {
   const state = fixture(t)
   await state.run()
   const button = state.calls.buttons[0][1].buttons.find(button => button.id.startsWith('.ttmp3 '))
   const [command, ...args] = button.id.slice(1).split(' ')
   state.context.command = command
   state.context.args = args
   await state.run()
   assert.equal(state.calls.media.length, 2)
   assert.equal(state.calls.media[1][1], media.audio)
   assert.equal(state.calls.media[1][4].audio, true)
   assert.equal(state.calls.media[1][4].ptt, false)
   assert.match(state.calls.buttons[1][1].text, /Sample music/)
   assert.match(state.calls.buttons[1][1].text, /TikTok \/ sample: title/)
})

test('all existing aliases retain their video, MP3 and voice-note behavior', async t => {
   for (const [command, url, audio, ptt] of [
      ['tiktok', media.video_no_watermark], ['tt', media.video_no_watermark],
      ['ttmp4', media.video_no_watermark], ['tikwm', media.video_with_watermark],
      ['ttwm', media.video_with_watermark], ['ttmp3', media.audio, true, false],
      ['ttvn', media.audio, true, true]
   ]) await t.test(command, async t => {
      const { calls, run } = fixture(t, { command })
      await run()
      assert.equal(calls.media[0][1], url)
      const options = calls.media[0][4]
      assert.equal(options.audio, audio)
      assert.equal(options.ptt, ptt)
      assert.equal(options.mimetype, audio ? 'audio/mpeg' : 'video/mp4')
      assert.match(options.fileName, audio ? /\.mp3$/ : /\.mp4$/)
      assert.ok(!/[\/\\:*?"<>|]/.test(options.fileName))
      assert.deepEqual(calls.reactions, ['🕒', '✅'])
   })
})

test('50 MB stays native and larger video/audio/voice-note files become documents', async t => {
   for (const command of ['tiktok', 'ttmp3', 'ttvn']) {
      for (const bytes of [50 * 1024 * 1024, 50 * 1024 * 1024 + 1]) {
         await t.test(command + ':' + bytes, async t => {
            const { calls, run } = fixture(t, { command, fileSize: { bytes, size: '50 MB' } })
            await run()
            const options = calls.media[0][4]
            const document = bytes > 50 * 1024 * 1024
            assert.equal(options.document, document)
            if (document) {
               assert.equal(options.type, undefined)
               assert.equal(options.audio, undefined)
               assert.equal(options.ptt, undefined)
               assert.match(calls.media[0][2], /dikirim sebagai dokumen/)
            }
            assert.deepEqual(calls.reactions, ['🕒', '✅'])
         })
      }
   }
})

test('missing metadata and unknown file size do not interrupt the download', async t => {
   const { calls, run } = fixture(t, { data: { ok: true, media: { ...media } }, fileSize: {} })
   await run()
   assert.equal(calls.media[0][4].fileName, 'tiktok_media.mp4')
   assert.equal(calls.media[0][4].document, false)
   assert.match(calls.media[0][2], /Tanpa judul/)
   assert.match(calls.media[0][2], /Tidak diketahui/)
   assert.doesNotMatch(calls.media[0][2], /undefined|NaN/)
   assert.deepEqual(calls.reactions, ['🕒', '✅'])
})

test('video fallback uses its real label and menus omit unavailable formats', async t => {
   const data = metadata()
   delete data.media.video_no_watermark
   const { calls, run } = fixture(t, { data })
   await run()
   assert.equal(calls.media[0][1], media.video_with_watermark)
   assert.match(calls.media[0][2], /Video dengan watermark/)
   assert.deepEqual(calls.buttons[0][1].buttons.map(button => button.id), [
      '.ttmp3 ' + sourceUrl, '.ttvn ' + sourceUrl
   ])
   const onlyVideo = fixture(t, { data: { ok: true, media: { video_no_watermark: media.video_no_watermark } } })
   await onlyVideo.run()
   assert.equal(onlyVideo.calls.media.length, 1)
   assert.equal(onlyVideo.calls.buttons.length, 0)
})

test('help and invalid TikTok links do not make API requests', async t => {
   for (const args of [
      [], ['not-a-url'], ['https://notiktok.com/video'],
      ['https://tiktok.com.example.invalid/video'], ['https://example.invalid/?url=tiktok.com'],
      ['ftp://www.tiktok.com/video']
   ]) await t.test(args[0] || 'help', async t => {
      const { calls, run } = fixture(t, { args })
      await run()
      assert.equal(calls.requests.length, 0)
      assert.equal(calls.media.length, 0)
      assert.equal(calls.replies.length, 1)
      assert.ok(calls.replies[0].includes('.ttmp3 <url>'))
      assert.ok(calls.replies[0].includes('.ttvn <url>'))
   })
})

test('bare TikTok URLs and configured prefixes work in every button command', async t => {
   for (const prefix of ['!', '']) await t.test(prefix || 'no prefix', async t => {
      const { calls, run } = fixture(t, { prefix, args: ['vt.tiktok.com/ZSUYJLQfg/'] })
      await run()
      assert.equal(new URL(calls.requests[0][0]).searchParams.get('url'), sourceUrl)
      for (const button of calls.buttons[0][1].buttons)
         assert.ok(button.id.startsWith(prefix) && button.id.endsWith(' ' + sourceUrl))
      assert.ok(calls.buttons[0][1].buttons.some(button => button.id === prefix + 'ttmp3 ' + sourceUrl))
   })
})

test('missing or failing buttons fall back once without failing a delivered download', async t => {
   for (const options of [
      { withButtons: false },
      { buttonError: new Error('Unsupported controls') },
      { buttonError: new Error('Unsupported controls'), replyError: new Error('Text offline') }
   ]) await t.test(JSON.stringify(Object.keys(options)), async t => {
      const { calls, run } = fixture(t, options)
      await run()
      assert.equal(calls.media.length, 1)
      assert.equal(calls.replies.length, 1)
      assert.ok(calls.replies[0].includes('.ttmp3 ' + sourceUrl))
      assert.deepEqual(calls.reactions, ['🕒', '✅'])
   })
})

test('API, timeout, missing-media and upload failures offer a usable retry', async t => {
   for (const [name, options, reason] of [
      ['HTTP failure', { status: 503 }, /tidak tersedia/],
      ['API failure', { data: { ok: false } }, /Gagal mengambil data/],
      ['invalid JSON', { body: 'not JSON' }, /❌/],
      ['timeout', { fetchError: new DOMException('Timed out', 'TimeoutError') }, /terlalu lama/],
      ['missing video', { data: { ok: true, media: {} } }, /Video.*tidak tersedia/],
      ['missing audio', { command: 'ttmp3', data: { ok: true, media: {} } }, /Audio.*tidak tersedia/],
      ['upload failure', { mediaError: new Error('Upload failed') }, /Upload failed/]
   ]) await t.test(name, async t => {
      const { calls, context, run } = fixture(t, { prefix: '!', ...options })
      await run()
      assert.deepEqual(calls.reactions, ['🕒', '❌'])
      assert.equal(calls.buttons.length, 1)
      const retry = calls.buttons[0][1]
      assert.match(retry.text, reason)
      assert.equal(retry.buttons[0].id, '!' + context.command + ' ' + sourceUrl)
      assert.ok(retry.text.includes(retry.buttons[0].id))
   })
})

test('failed retry text propagates once instead of creating duplicate fallbacks', async t => {
   const { calls, run } = fixture(t, {
      status: 503, buttonError: new Error('Controls offline'), replyError: new Error('Text offline')
   })
   await assert.rejects(run(), /Text offline/)
   assert.equal(calls.buttons.length, 1)
   assert.equal(calls.replies.length, 1)
   assert.equal(calls.media.length, 0)
})
