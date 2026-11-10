/**
 * Compatibility layer over the `Func` namespace (lib/Function/*).
 *
 * Historically this file carried ~700 lines of helper implementations that were
 * duplicated inside lib/Function/*. To keep every existing `import ... from
 * '../../lib/Utilities.js'` working without changes, we re-export the canonical
 * functions from the `Func` namespace instead of maintaining two copies.
 *
 * `Func` is fully populated by `loadFunc()` (called in socket.js) before any
 * plugin/component actually invokes these helpers.
 */
import { Func } from '#func'

const fromFunc = (name) =>
   (...args) => Func[name](...args)

export const isMimeImage = fromFunc('isMimeImage')
export const isMimeVideo = fromFunc('isMimeVideo')
export const isMimeGif = fromFunc('isMimeGif')
export const isMimeWebP = fromFunc('isMimeWebP')
export const isMimeAudio = fromFunc('isMimeAudio')

export const isEmptyObject = fromFunc('isEmptyObject')
export const createFileName = fromFunc('createFileName')
export const randomHex = fromFunc('randomHex')
export const toTitleCase = fromFunc('toTitleCase')
export const parseMentions = fromFunc('parseMentions')
export const cleanUpFolder = fromFunc('cleanUpFolder')
export const isFileExists = fromFunc('isFileExists')
export const isURL = fromFunc('isURL')
export const isWhatsAppURL = fromFunc('isWhatsAppURL')
export const fetchAsBuffer = fromFunc('fetchAsBuffer')
export const getDiskStats = fromFunc('getDiskStats')

export const ffmpeg = fromFunc('ffmpeg')
export const imageToWebP = fromFunc('imageToWebP')
export const videoToWebP = fromFunc('videoToWebP')
export const toAudio = fromFunc('toAudio')
export const toPTT = fromFunc('toPTT')
export const persistToFile = fromFunc('persistToFile')

export const getIndonesianTimezone = fromFunc('getIndonesianTimezone')
export const getNextMidnight = fromFunc('getNextMidnight')
export const getNowInTZ = fromFunc('getNowInTZ')
export const greeting = fromFunc('greeting')
export const formatTime = fromFunc('formatTime')

export const createExif = fromFunc('createExif')
export const ensureVP8X = fromFunc('ensureVP8X')
export const writeExif = fromFunc('writeExif')
export const resizeImage = fromFunc('resizeImage')
export const createSticker = fromFunc('createSticker')
export const bratSticker = fromFunc('bratSticker')
export const bratVideoSticker = fromFunc('bratVideoSticker')

export const levenshtein = fromFunc('levenshtein')
export const medal = fromFunc('medal')
export const toTime = fromFunc('toTime')
export const findTopSuggestions = fromFunc('findTopSuggestions')
export const formatNumber = fromFunc('formatNumber')
export const formatSize = fromFunc('formatSize')
export const style = fromFunc('style')
export const frame = fromFunc('frame')
export const messageLogger = fromFunc('messageLogger')
export const applySchema = fromFunc('applySchema')
export const toArray = fromFunc('toArray')
export const shuffleArray = fromFunc('shuffleArray')
export const randomInteger = fromFunc('randomInteger')
export const randomValue = fromFunc('randomValue')
export const fetchThumbnail = fromFunc('fetchThumbnail')
