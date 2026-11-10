import { spawn } from 'child_process'
import { once } from 'events'
import { join, resolve } from 'path'
import { writeFile } from 'fs/promises'
import PQueue from 'p-queue'

import { BRAT_GIF_ARGS, FFMPEG_CONCAT_ARGS, IMAGE_TO_WEBP, VIDEO_TO_WEBP, AUDIO_TO_MPEG, AUDIO_TO_OPUS } from '../Constants.js'

import { Func } from '#func'

// ========== FFMPEG QUEUE ==========
Func.FFmpegQueue = new PQueue({
   concurrency: ffmpegConcurrency
})

// ========== FFMPEG UTILITIES ==========
Func.ffmpeg = async (inputPath, inputArgs = [], outputArgs = [], extension, stream = false) =>
   Func.FFmpegQueue.add(async () => {
      if (!extension)
         throw new Error('Extension required')

      const fileName = Func.createFileName() + '.' + extension
      const filePath = join(process.cwd(), temporaryFolder, fileName)

      // Jika mode stream true, arahkan ke stdout (-) dan set format (-f). Jika false, ke file.
      const finalOutputArgs = stream
         ? [...outputArgs, '-threads', '0', '-f', extension, '-']
         : [...outputArgs, '-threads', '0', filePath]

      const ff = spawn('ffmpeg', [
         '-y',
         '-loglevel', 'quiet',
         '-nostdin',
         ...inputArgs,
         '-threads', '0',
         '-i', inputPath,
         ...finalOutputArgs
      ], {
         // Tangkap stdout jika mode stream, abaikan jika ke file
         stdio: stream ? ['ignore', 'pipe', 'ignore'] : 'ignore'
      })

      let timeout
      const timeoutId = setTimeout(() => {
         timeout = true
         ff.kill('SIGKILL')
      }, ffmpegTimeout)

      // Langsung return stream-nya jika mode stream true
      if (stream) {
         ff.once('close', () => clearTimeout(timeoutId))
         return ff.stdout
      }

      try {
         const [code] = await once(ff, 'close')

         if (code !== 0)
            throw new Error(`FFmpeg failed (${code})`)

         return filePath
      }
      catch (error) {
         if (timeout)
            throw new Error(`FFmpeg timeout after ${ffmpegTimeout}ms`)
         throw error
      }
      finally {
         clearTimeout(timeoutId)
         ff.removeAllListeners()
      }
   })

Func.bratVideoSticker = async (text = 'Hi', stream = false) => {
   const texts = text.trim().split(' ')
   const temporaryDirectory = resolve(process.cwd(), temporaryFolder)

   const files = await Promise.all(
      texts.map((_, index) =>
         Func.persistToFile(`https://aqul-brat.hf.space/?text=${encodeURIComponent(texts.slice(0, index + 1).join(' '))}`)
      )
   )

   const list = files.map(file => `file '${resolve(temporaryDirectory, file)}'\nduration 0.4`).join('\n') 
      + `\nfile '${resolve(temporaryDirectory, files[files.length - 1])}'\nduration 3\n`

   const listPath = resolve(temporaryDirectory, `${Func.createFileName()}.txt`)
   await writeFile(listPath, list)

   return Func.ffmpeg(listPath, FFMPEG_CONCAT_ARGS, BRAT_GIF_ARGS, 'gif', stream)
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
Func.detectCodec = (file) => {
   return new Promise((resolve) => {
      const proc = spawn('ffprobe', [
         '-v', 'error',
         '-select_streams', 'a:0',
         '-show_entries', 'stream=codec_name',
         '-of', 'default=noprint_wrappers=1:nokey=1',
         file
      ])
      let out = ''
      proc.stdout.on('data', d => out += d)
      proc.on('close', () => resolve(out.trim()))
      proc.on('error', () => resolve('unknown'))
   })
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
