// lib/functions/mime.js
import { Func } from '#func'

Func.isMimeImage = (mime) =>
  typeof mime === 'string' && mime.startsWith('image')

Func.isMimeVideo = (mime) =>
  typeof mime === 'string' && mime.startsWith('video')

Func.isMimeGif = (mime) =>
  typeof mime === 'string' && mime.endsWith('gif')

Func.isMimeWebP = (mime) =>
  typeof mime === 'string' && mime.endsWith('webp')

Func.isMimeAudio = (mime) =>
  typeof mime === 'string' && mime.startsWith('audio')