import { spawn } from 'child_process'
import { once } from 'events'
import { join, resolve } from 'path'
import { writeFile, mkdir, unlink } from 'fs/promises'
import { createMediaRunner } from '../MediaProcess.js'
import { positiveInt } from '../Runtime.js'

import { BRAT_GIF_ARGS, FFMPEG_CONCAT_ARGS, IMAGE_TO_WEBP, VIDEO_TO_WEBP, AUDIO_TO_MPEG, AUDIO_TO_OPUS } from '../Constants.js'

import { Func } from '#func'

const runner = createMediaRunner({ concurrency: positiveInt(global.ffmpegConcurrency, 1, 4), maxPending: positiveInt(global.mediaQueueLimit, 8), timeoutMs: positiveInt(global.ffmpegTimeout, 60000) })
Func.FFmpegQueue = runner.queue
Func.ffmpeg = async (inputPath, inputArgs = [], outputArgs = [], extension, stream = false) => {
   if (!/^[a-z0-9]+$/i.test(extension || '')) throw new TypeError('Valid media extension required')
   const directory = join(process.cwd(), global.temporaryFolder || 'temp')
   await mkdir(directory, { recursive: true })
   const filePath = join(directory, `${Func.createFileName()}.${extension}`)
   const threads = String(positiveInt(global.ffmpegThreads, 1, 4))
   const args = ['-y', '-loglevel', 'error', '-nostdin', '-threads', threads, ...inputArgs, '-i', inputPath, ...outputArgs, '-threads', threads,
      ...(stream ? ['-f', extension === 'opus' ? 'ogg' : extension, 'pipe:1'] : [filePath])]
   try {
      const output = await runner.run('ffmpeg', args, { stream })
      return stream ? output : filePath
   } catch (error) { await unlink(filePath).catch(() => {}); throw error }
}

Func.bratVideoSticker = async (text = 'Hi', stream = false) => {
   const words = text.trim().split(/\s+/)
   if (words.length > 30 || text.length > 500) throw new RangeError('Brat animation is limited to 30 words / 500 characters')
   const files = []
   const directory = resolve(process.cwd(), global.temporaryFolder || 'temp')
   const listPath = join(directory, `${Func.createFileName()}.txt`)
   const cleanup = async () => { for (const file of [...files, listPath]) await unlink(file).catch(() => {}) }
   try {
      for (let index = 0; index < words.length; index++) files.push(await Func.persistToFile(`https://aqul-brat.hf.space/?text=${encodeURIComponent(words.slice(0, index + 1).join(' '))}`))
      const quote = file => resolve(file).replace(/'/g, "'\\''")
      await writeFile(listPath, files.map(file => `file '${quote(file)}'\nduration 0.4`).join('\n') + `\nfile '${quote(files.at(-1))}'\nduration 3\n`)
      const output = await Func.ffmpeg(listPath, FFMPEG_CONCAT_ARGS, BRAT_GIF_ARGS, 'gif', stream)
      if (stream) { output.once('close', () => { void cleanup() }); return output }
      await cleanup(); return output
   } catch (error) { await cleanup(); throw error }
}

Func.imageToWebP = (media, stream = false) =>
   Func.ffmpeg(
      media,
      [],
      IMAGE_TO_WEBP,
      'webp',
      stream
   )

Func.videoToWebP = (media, stream = false) =>
   Func.ffmpeg(
      media,
      [],
      VIDEO_TO_WEBP,
      'webp',
      stream
   )

Func.toAudio = (media, stream = false) =>
   Func.ffmpeg(
      media,
      [],
      AUDIO_TO_MPEG,
      'mp3',
      stream
   )

Func.toPTT = (media, stream = false) =>
   Func.ffmpeg(
      media,
      [],
      AUDIO_TO_OPUS,
      'opus',
      stream
   )
   
Func.videoToAudio = (media, stream = false) =>
   Func.ffmpeg(
      media,
      [],
      [
         '-vn',
         '-c:a', 'libmp3lame',
         '-b:a', '192k'
      ],
      'mp3',
      stream
   )
   

// Tambahkan fungsi ini untuk mengecek codec asli file
Func.detectCodec = async file => {
   const proc = spawn('ffprobe', ['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=codec_name', '-of', 'default=noprint_wrappers=1:nokey=1', file], { stdio: ['ignore', 'pipe', 'ignore'] })
   let output = ''
   const timer = setTimeout(() => proc.kill('SIGKILL'), 10000)
   proc.stdout.on('data', chunk => { if (output.length < 1024) output += chunk; else proc.kill('SIGKILL') })
   try { const [code] = await once(proc, 'close'); return code === 0 ? output.trim() : 'unknown' }
   catch { return 'unknown' }
   finally { clearTimeout(timer) }
}

// Fungsi utama untuk memproses Metadata Audio & Cover
Func.toAudioAlbum = async (inputPath, opts = {}, stream = false) => {
   const { cover, title, artist, album, year, type = 'audio' } = opts
   let inputArgs = []
   let outputArgs = []

   const codec = await Func.detectCodec(inputPath)
   const isMP3 = codec === 'mp3'

   // Trik Mapping FFmpeg: Jika ada cover, jadikan cover sebagai input ke-0, dan raw audio sebagai input ke-1
   if (cover) {
      inputArgs.push('-i', cover)
      outputArgs.push('-map', '1:a', '-map', '0:v')
   } else {
      outputArgs.push('-map', '0:a')
   }

   if (type === 'ptt') {
      outputArgs.push('-c:a', 'libopus', '-b:a', '64k')
   } else {
      // INI YANG BIKIN CEPAT: Jika audio dari API sudah MP3, cukup "copy" tanpa render ulang
      outputArgs.push('-c:a', isMP3 ? 'copy' : 'libmp3lame')
      if (!isMP3) outputArgs.push('-b:a', '192k')
   }

   // Set ID3 Tags (Metadata)
   if (type !== 'ptt') {
      outputArgs.push(
         '-metadata', `title=${title || 'Unknown Title'}`,
         '-metadata', `artist=${artist || 'Unknown Artist'}`,
         '-metadata', `album=${album || 'ROCKYY Audio'}`,
         '-metadata', `date=${year || new Date().getFullYear()}`,
         '-id3v2_version', '3'
      )
   }

   // Embed Thumbnail Cover
   if (cover && type !== 'ptt') {
      outputArgs.push(
         '-c:v', 'mjpeg',
         '-metadata:s:v', 'title=Album cover',
         '-metadata:s:v', 'comment=Cover (front)',
         '-disposition:v', 'attached_pic'
      )
   }

   // Jalankan melalui Func.ffmpeg agar masuk ke dalam Queue
   return Func.ffmpeg(inputPath, inputArgs, outputArgs, type === 'ptt' ? 'opus' : 'mp3', stream)
}
