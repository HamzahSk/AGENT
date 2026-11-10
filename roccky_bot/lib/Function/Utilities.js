
import { fileTypeFromBuffer, fileTypeFromFile, fileTypeStream } from 'file-type'
import { LRUCache } from 'lru-cache'
import { once } from 'events'
import { spawn } from 'child_process'
import { createWriteStream } from 'fs'
import { access, unlink, readdir, readFile, rm, stat } from 'fs/promises'
import { join, resolve } from 'path'
import { Readable } from 'stream'
import { pipeline } from 'stream/promises'
import { strToU8, zipSync } from 'fflate'

import { MINUTE, WEBP_EXIF_HEADER } from '../Constants.js'
import { request } from '../Request.js'
import { CommandIndex } from '../Watcher.js'

// Objek Func sebagai namespace
import { Func } from '#func'

// ========== KONSTANTA ==========
Func.ProfilePictureCache = new LRUCache({
   max: 512,
   ttl: MINUTE * 10,
   updateAgeOnGet: false,
   updateAgeOnHas: false,
   ttlAutopurge: true
})

let napiImage

// ========== FUNGSI UTILITY ==========
// Utility umum (isEmptyObject, toArray, formatSize, isURL, toTime, style, dll)
// kini dimuat & diekspor via namespace `Utils` (#utils) lalu di-bridge ke `Func`.

Func.cleanUpFolder = async (path) => {
   try {
      const statistic = await stat(path)
      if (statistic.isFile()) {
         await unlink(path)
         return
      }

      const entries = await readdir(path)
      await Promise.all(
         entries.map(name =>
            rm(join(path, name), { recursive: true, force: true })
         )
      )
   }
   catch (error) {
      console.error('❌ ', error.message)
   }
}

Func.isFileExists = async (path) => {
   try {
      await access(path)
      return true
   }
   catch (error) {
      if (error.code === 'ENOENT') return false
      throw error
   }
}

Func.fetchAsBuffer = (url) => {
   if (url instanceof Buffer) return url

   if (typeof url !== 'string') return null

   if (Func.isURL(url))
      return request(url)

   return readFile(url)
}

Func.getDiskStats = async () => {
   const df = spawn('df', ['-k'])

   let output = ''
   df.stdout.on('data', chunk => {
      output += chunk
   })

   await once(df, 'close')

   const lines = output.trim().split('\n').slice(1)
   let primaryDisk = null

   for (const line of lines) {
      const parts = line.split(/\s+/)
      const [fs, size, used, avail, , mount] = parts

      if (
         fs.includes('tmpfs') ||
         fs.includes('devtmpfs') ||
         fs.includes('overlay') ||
         mount.startsWith('/dev') ||
         mount.startsWith('/proc')
      )
         continue

      const totalBytes = parseInt(size) * 1024

      if (!primaryDisk || totalBytes > primaryDisk.total)
         primaryDisk = {
            total: totalBytes,
            used: parseInt(used) * 1024,
            free: parseInt(avail) * 1024,
            mount
         }
   }

   return primaryDisk
}

Func.persistToFile = async (source) => {
   const isSourceURL = Func.isURL(source)

   if (typeof source === 'string' && !isSourceURL)
      return source

   if (source instanceof ArrayBuffer)
      source = Buffer.from(source)

   let readable, check

   if (source instanceof Buffer) {
      readable = Readable.from(source)
      check = await fileTypeFromBuffer(source)
   }
   else if (typeof source === 'string' && isSourceURL) {
      const response = await fetch(source, {
         headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': '*/*'
         }
      })

      if (!response.ok) {
         await response.body?.cancel()
         throw new Error(`Gagal fetch URL: ${response.status} ${response.statusText}`)
      }

      readable = await fileTypeStream(
         Readable.fromWeb(response.body)
      )
      check = readable.fileType
   }
   else
      throw new Error('Invalid source type')

   const extension = check?.ext || 'txt'
   const fileName = resolve(process.cwd(), temporaryFolder, Func.createFileName())
   const filePath = fileName + '.' + extension

   try {
      await pipeline(
         readable,
         createWriteStream(filePath)
      )
   } catch (err) {
      console.error('Error saat menulis file:', err)
      throw new Error('Gagal menyimpan media ke penyimpanan lokal')
   }

   return filePath
}

Func.createExif = (json) => {
   const jsonBuffer = Buffer.from(JSON.stringify(json))
   const exif = Buffer.concat([WEBP_EXIF_HEADER, jsonBuffer])

   exif.writeUIntLE(jsonBuffer.length, 14, 4)

   return exif
}

/* ********** EXPERIMENTAL FUNCTIONS ********** */
Func.ensureVP8X = (webpBuffer) => {
   const firstChunk = webpBuffer.toString('ascii', 12, 16)

   if (firstChunk === 'VP8X') return webpBuffer

   if (firstChunk !== 'VP8 ' && firstChunk !== 'VP8L')
      throw new Error('Unsupported WebP format')

   const width = 512 - 1
   const height = 512 - 1

   const vp8xChunk = Buffer.alloc(18)
   vp8xChunk.write('VP8X', 0)
   vp8xChunk.writeUInt32LE(10, 4)

   vp8xChunk[8] = 0

   vp8xChunk.fill(0, 9, 12)

   vp8xChunk.writeUIntLE(width, 12, 3)
   vp8xChunk.writeUIntLE(height, 15, 3)

   const before = webpBuffer.slice(0, 12)
   const after = webpBuffer.slice(12)

   const newBuffer = Buffer.concat([before, vp8xChunk, after])
   newBuffer.writeUInt32LE(newBuffer.length - 8, 4)

   return newBuffer
}

Func.writeExif = (webpBuffer, metadataJson) => {
   webpBuffer = Func.ensureVP8X(webpBuffer)

   const exifData = Func.createExif(metadataJson)

   let offset = 12
   let vp8xOffset = -1

   while (offset < webpBuffer.length) {
      const type = webpBuffer.toString('ascii', offset, offset + 4)
      const size = webpBuffer.readUInt32LE(offset + 4)

      if (type === 'VP8X') {
         vp8xOffset = offset
         break
      }

      offset += 8 + size + (size % 2)
   }

   webpBuffer[vp8xOffset + 8] |= 0b00001000

   const exifChunkHeader = Buffer.alloc(8)
   exifChunkHeader.write('EXIF', 0)
   exifChunkHeader.writeUInt32LE(exifData.length, 4)

   const exifChunk = Buffer.concat([
      exifChunkHeader,
      exifData,
      exifData.length % 2 ? Buffer.from([0x00]) : Buffer.alloc(0)
   ])

   const newBuffer = Buffer.concat([webpBuffer, exifChunk])
   newBuffer.writeUInt32LE(newBuffer.length - 8, 4)

   return newBuffer
}
/* ********** ********** ********** ********** */

Func.resizeImage = async (media, width = 540, height = null, quality = 70, format = 'jpeg') => {
   if (!(media instanceof Buffer))
      media = await Func.fetchAsBuffer(media)

   const lib = napiImage ??= await import('@napi-rs/image')

   const transformer = new lib.Transformer(media)

   transformer.resize(width, height > 0 ? height : null, 0)

   return transformer[format](quality)
}

Func.createSticker = async (media, options = {}) => {
   if (!media)
      throw new Error('No media provided')

   media = await Func.persistToFile(media)

   let mimetype = options.mimetype
   if (!mimetype) {
      const check = await fileTypeFromFile(media)
      mimetype = check?.mime
   }

   if (Func.isMimeWebP(mimetype))
      media = media
   else if (Func.isMimeVideo(mimetype) || Func.isMimeGif(mimetype))
      media = await Func.videoToWebP(media)
   else if (Func.isMimeImage(mimetype))
      media = await Func.imageToWebP(media)
   else
      throw new Error('Invalid media input')

   media = await Func.fetchAsBuffer(media)

   return Func.writeExif(media, {
      'sticker-pack-id': 'rocky',
      'sticker-pack-name': options.stickerPackName ?? stickerPackName,
      'sticker-pack-publisher': options.stickerPackPublisher,
      'android-app-store-link': 'https://github.com/itsliaaa',
      'ios-app-store-link': 'https://github.com/itsliaaa',
      emojis: ['✨'],
      'accessibility-text': botName
   })
}

Func.bratSticker = async (text = 'Hi') =>
   Func.persistToFile(`https://aqul-brat.hf.space/?text=${encodeURIComponent(text)}`)

Func.findTopSuggestions = (input) => {
   const inputLength = input.length
   const maxDistance = Math.max(2, inputLength >> 1)

   let c1 = '',
      s1 = 0
   let c2 = '',
      s2 = 0
   let c3 = '',
      s3 = 0

   for (const command of CommandIndex.keys()) {
      const lenDiff = command.length - inputLength
      if (lenDiff > maxDistance || lenDiff < -maxDistance) continue

      if (command[0] !== input[0]) continue

      const distance = Func.levenshtein(input, command, maxDistance)
      if (distance > maxDistance) continue

      const similarity = (1 - distance / inputLength) * 100

      if (similarity > s1) {
         c3 = c2
         s3 = s2
         c2 = c1
         s2 = s1
         c1 = command
         s1 = similarity
      }
      else if (similarity > s2) {
         c3 = c2
         s3 = s2
         c2 = command
         s2 = similarity
      }
      else if (similarity > s3) {
         c3 = command
         s3 = similarity
      }
   }

   const out = []
   if (c1)
      out.push({
         command: c1,
         similarity: s1
      })
   if (c2)
      out.push({
         command: c2,
         similarity: s2
      })
   if (c3)
      out.push({
         command: c3,
         similarity: s3
      })

   return out
}

Func.frame = (title, lines = [], icon = '✦') => {
   const top =
      '╭' +
      '─'.repeat(1) +
      `✦ ${icon} *${Func.style(title)}*`

   const content = lines.map(l => `│ ${l}`)

   const bottom =
      '╰' +
      '─'.repeat(5) +
      '✦'

   return [
      top,
      ...content,
      bottom
   ]
      .join('\n')
}

Func.messageLogger = (message) =>
   console.log(
      '\n' +
      `🔔 Received ${message.type} from ${message.sender?.split('@')[0] || '-'} (${message.pushName || message.verifiedBizName}) in ${message.chat}` +
      '\n' +
      message.body
   )

Func.fetchThumbnail = () =>
   Func.fetchAsBuffer(botThumbnail)

// ============================================================
// GENERATOR DOKUMEN PPTX MINIMAL (untuk header menu bergaya dokumen)
// ============================================================
const escapeXml = (value = '') =>
   String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;')

Func.createMenuDocument = (title = 'ROCKYY', subtitle = '') => {
   title = escapeXml(title)
   subtitle = escapeXml(subtitle)

   const files = {
      '[Content_Types].xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  <Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
  <Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>
  <Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>
  <Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`,
      '_rels/.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`,
      'ppt/presentation.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>
  <p:sldIdLst><p:sldId id="256" r:id="rId2"/></p:sldIdLst>
  <p:sldSz cx="12192000" cy="6858000"/>
  <p:notesSz cx="6858000" cy="9144000"/>
</p:presentation>`,
      'ppt/_rels/presentation.xml.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/>
</Relationships>`,
      'ppt/slides/slide1.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
      <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
      <p:sp>
        <p:nvSpPr><p:cNvPr id="2" name="Title"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>
        <p:spPr><a:xfrm><a:off x="914400" y="914400"/><a:ext cx="10363200" cy="1524000"/></a:xfrm></p:spPr>
        <p:txBody>
          <a:bodyPr/><a:lstStyle/>
          <a:p><a:r><a:rPr lang="en-US" sz="3600" b="1"/><a:t>${title}</a:t></a:r></a:p>
        </p:txBody>
      </p:sp>
      <p:sp>
        <p:nvSpPr><p:cNvPr id="3" name="Subtitle"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>
        <p:spPr><a:xfrm><a:off x="914400" y="3048000"/><a:ext cx="10363200" cy="1524000"/></a:xfrm></p:spPr>
        <p:txBody>
          <a:bodyPr/><a:lstStyle/>
          <a:p><a:r><a:rPr lang="en-US" sz="1800"/><a:t>${subtitle}</a:t></a:r></a:p>
        </p:txBody>
      </p:sp>
    </p:spTree>
  </p:cSld>
  <p:clrMapOvr><a:overrideClrMapping bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/></p:clrMapOvr>
</p:sld>`,
      'ppt/slides/_rels/slide1.xml.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
</Relationships>`,
      'ppt/slideLayouts/slideLayout1.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank">
  <p:cSld>
    <p:spTree>
      <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
      <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
    </p:spTree>
  </p:cSld>
  <p:clrMapOvr><a:overrideClrMapping bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/></p:clrMapOvr>
</p:sldLayout>`,
      'ppt/slideLayouts/_rels/slideLayout1.xml.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/>
</Relationships>`,
      'ppt/slideMasters/slideMaster1.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:bg><p:bgPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></p:bgPr></p:bg>
    <p:spTree>
      <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
      <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
    </p:spTree>
  </p:cSld>
  <p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>
  <p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst>
  <p:txStyles>
    <p:titleStyle><a:lvl1pPr><a:defRPr sz="4400"/></a:lvl1pPr></p:titleStyle>
    <p:bodyStyle><a:lvl1pPr><a:defRPr sz="1800"/></a:lvl1pPr></p:bodyStyle>
    <p:otherStyle/>
  </p:txStyles>
</p:sldMaster>`,
      'ppt/slideMasters/_rels/slideMaster1.xml.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/>
</Relationships>`,
      'ppt/theme/theme1.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Office Theme">
  <a:themeElements>
    <a:clrScheme name="Office">
      <a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1>
      <a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>
      <a:dk2><a:srgbClr val="1F497D"/></a:dk2>
      <a:lt2><a:srgbClr val="EEECE1"/></a:lt2>
      <a:accent1><a:srgbClr val="4F81BD"/></a:accent1>
      <a:accent2><a:srgbClr val="C0504D"/></a:accent2>
      <a:accent3><a:srgbClr val="9BBB59"/></a:accent3>
      <a:accent4><a:srgbClr val="8064A2"/></a:accent4>
      <a:accent5><a:srgbClr val="4BACC6"/></a:accent5>
      <a:accent6><a:srgbClr val="F79646"/></a:accent6>
      <a:hlink><a:srgbClr val="0000FF"/></a:hlink>
      <a:folHlink><a:srgbClr val="800080"/></a:folHlink>
    </a:clrScheme>
    <a:fontScheme name="Office">
      <a:majorFont><a:latin typeface="Calibri Light"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont>
      <a:minorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont>
    </a:fontScheme>
    <a:fmtScheme name="Office">
      <a:fillStyleLst>
        <a:solidFill><a:schemeClr val="phClr"/></a:solidFill>
        <a:gradFill rotWithShape="1"><a:gsLst>
          <a:gs pos="0"><a:schemeClr val="phClr"><a:tint val="50000"/><a:satMod val="300000"/></a:schemeClr></a:gs>
          <a:gs pos="35000"><a:schemeClr val="phClr"><a:tint val="37000"/><a:satMod val="300000"/></a:schemeClr></a:gs>
          <a:gs pos="100000"><a:schemeClr val="phClr"><a:tint val="15000"/><a:satMod val="350000"/></a:schemeClr></a:gs>
        </a:gsLst><a:lin ang="16200000" scaled="1"/></a:gradFill>
        <a:gradFill rotWithShape="1"><a:gsLst>
          <a:gs pos="0"><a:schemeClr val="phClr"><a:shade val="51000"/><a:satMod val="130000"/></a:schemeClr></a:gs>
          <a:gs pos="80000"><a:schemeClr val="phClr"><a:shade val="93000"/><a:satMod val="130000"/></a:schemeClr></a:gs>
          <a:gs pos="100000"><a:schemeClr val="phClr"><a:shade val="94000"/><a:satMod val="135000"/></a:schemeClr></a:gs>
        </a:gsLst><a:lin ang="16200000" scaled="0"/></a:gradFill>
      </a:fillStyleLst>
      <a:lnStyleLst>
        <a:ln w="9525" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"><a:shade val="95000"/><a:satMod val="105000"/></a:schemeClr></a:solidFill><a:prstDash val="solid"/></a:ln>
        <a:ln w="25400" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln>
        <a:ln w="38100" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln>
      </a:lnStyleLst>
      <a:effectStyleLst>
        <a:effectStyle><a:effectLst><a:outerShdw blurRad="40000" dist="20000" dir="5400000" rotWithShape="0"><a:srgbClr val="000000"><a:alpha val="38000"/></a:srgbClr></a:outerShdw></a:effectLst></a:effectStyle>
        <a:effectStyle><a:effectLst><a:outerShdw blurRad="40000" dist="23000" dir="5400000" rotWithShape="0"><a:srgbClr val="000000"><a:alpha val="35000"/></a:srgbClr></a:outerShdw></a:effectLst></a:effectStyle>
        <a:effectStyle><a:effectLst><a:outerShdw blurRad="40000" dist="23000" dir="5400000" rotWithShape="0"><a:srgbClr val="000000"><a:alpha val="35000"/></a:srgbClr></a:outerShdw></a:effectLst></a:effectStyle>
      </a:effectStyleLst>
      <a:bgFillStyleLst>
        <a:solidFill><a:schemeClr val="phClr"/></a:solidFill>
        <a:gradFill rotWithShape="1"><a:gsLst>
          <a:gs pos="0"><a:schemeClr val="phClr"><a:tint val="40000"/><a:satMod val="350000"/></a:schemeClr></a:gs>
          <a:gs pos="100000"><a:schemeClr val="phClr"><a:shade val="30000"/><a:satMod val="350000"/></a:schemeClr></a:gs>
        </a:gsLst><a:path path="circle"><a:fillToRect l="50000" t="-80000" r="50000" b="180000"/></a:path></a:gradFill>
        <a:gradFill rotWithShape="1"><a:gsLst>
          <a:gs pos="0"><a:schemeClr val="phClr"><a:tint val="80000"/><a:satMod val="300000"/></a:schemeClr></a:gs>
          <a:gs pos="100000"><a:schemeClr val="phClr"><a:shade val="30000"/><a:satMod val="200000"/></a:schemeClr></a:gs>
        </a:gsLst><a:lin ang="16200000" scaled="0"/></a:gradFill>
      </a:bgFillStyleLst>
    </a:fmtScheme>
  </a:themeElements>
  <a:objectDefaults/>
  <a:extraClrSchemeLst/>
</a:theme>`,
      'docProps/core.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>${title}</dc:title>
  <dc:creator>ROCKYY</dc:creator>
  <cp:lastModifiedBy>ROCKYY</cp:lastModifiedBy>
</cp:coreProperties>`,
      'docProps/app.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>ROCKYY</Application>
  <Slides>1</Slides>
</Properties>`
   }

   const entries = {}
   for (const name in files)
      entries[name] = strToU8(files[name])

   return Buffer.from(zipSync(entries))
}