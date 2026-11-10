// lib/Function/markdown.js
// Helper perapi teks Markdown keluaran AI (ChatGPT/Gemini/LLM) agar aman
// ditampilkan di WhatsApp via sock.sendMessage({ text }).
//
// MASALAH YANG DIHANDLE:
//   1. Code Block     : header bahasa (```javascript) dibersihkan menjadi
//                       pembuka ``` yang valid bawaan WhatsApp tanpa merusak
//                       penanda monospace.
//   2. Tabel Markdown : tabel (| A | B |) dikonversi ke format monospace
//                       box-drawing (┌─┬─┐) agar rapi di layar HP.
//   3. Escape Sequence: backslash-escape ( \* \_ \~ \` ) dihapus & penanda
//                       formatting ( * _ ~ ` ) di-seimbangkan agar tidak
//                       membuat teks terpotong / tampil mentah (raw).
import { FENCE_REGEX, TABLE_SEPARATOR_REGEX } from '../Constants.js'

import { Func } from '#func'

// ==================================================
// KONSTANTA BOX-DRAWING
// ==================================================
const BOX = {
   tl: '┌',
   tr: '┐',
   bl: '└',
   br: '┘',
   h: '─',
   v: '│',
   ml: '├',
   mr: '┤'
}

// Karakter yang di-escape AI sering membikin formatting WA rusak.
const UNESCAPE_MAP = /\\([*_~`\[\]()#+\-.|>\\])/g

const escapeChar = (char) => '\\' + char

// ==================================================
// UTILITY DASAR
// ==================================================
const countUnescaped = (line, char) => {
   let count = 0
   for (let i = 0; i < line.length; i++)
      if (line[i] === char && line[i - 1] !== '\\')
         count++

   return count
}

// Jika jumlah penanda formatting tidak genap, escape penanda terakhir
// agar WA tidak salah me-render (teks terpotong / raw).
const balanceMarker = (line, char) => {
   if (countUnescaped(line, char) % 2 === 0)
      return line

   const idx = line.lastIndexOf(char)
   return line.slice(0, idx) + escapeChar(char) + line.slice(idx + 1)
}

// Hapus backslash-escape yang tidak perlu (pembersihan escape sequence).
const unescapeMarkdown = (str) =>
   str.replace(UNESCAPE_MAP, '$1')

// [text](url) -> "text (url)" agar tetap terbaca & URL tetap auto-link WA.
const linkToPlain = (str) =>
   str
      .replace(/\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/g, '$1 ($2)')
      .replace(/\[([^\]]*)\]\(([^)]+)\)/g, '$1 ($2)')

// Normalisasi penanda ganda ala Markdown ( ** / __ / ~~ / *** ) menjadi
// penanda tunggal yang dipahami WA ( * / _ / ~ ).
const normalizeDoubleMarkers = (str) =>
   str
      .replace(/\*\*\*([^*]+)\*\*\*/g, '*$1*')
      .replace(/\*\*([^*]+)\*\*/g, '*$1*')
      .replace(/___([^_]+)___/g, '_$1_')
      .replace(/__([^_]+)__/g, '_$1_')
      .replace(/~~([^~]+)~~/g, '~$1~')

// Rapikan satu baris teks non-kode non-tabel.
const cleanLine = (line) => {
   let out = unescapeMarkdown(line)
   out = linkToPlain(out)
   out = normalizeDoubleMarkers(out)

   // Seimbangkan penanda formatting WA.
   out = balanceMarker(out, '*')
   out = balanceMarker(out, '_')
   out = balanceMarker(out, '~')
   out = balanceMarker(out, '`')

   return out
}

// ==================================================
// PARSING TABEL MARKDOWN -> BOX-DRAWING
// ==================================================
const isTableSeparator = (line) =>
   TABLE_SEPARATOR_REGEX.test(line || '')

const isTableRow = (line) =>
   typeof line === 'string' && line.includes('|')

const splitTableRow = (line) => {
   let content = line.trim()
   if (content.startsWith('|')) content = content.slice(1)
   if (content.endsWith('|')) content = content.slice(0, -1)

   return content.split('|').map(cell => cell.trim())
}

const buildBoxTable = (rows) => {
   const clean = rows
      .map(splitTableRow)
      .filter(row => row.length)

   if (!clean.length)
      return []

   const cols = Math.max(...clean.map(row => row.length))
   const widths = Array.from({ length: cols }, (_, index) =>
      Math.max(1, ...clean.map(row => String(row[index] ?? '').length))
   )

   const border = (left, join, right) =>
      BOX[left] + widths.map(width => BOX.h.repeat(width + 2)).join(join) + BOX[right]

   const bodyRow = (row) =>
      BOX.v + widths.map((width, index) =>
         ` ${String(row[index] ?? '').padEnd(width)} `
      ).join(BOX.v) + BOX.v

   const lines = [border('tl', '┬', 'tr')]
   clean.forEach((row, index) => {
      lines.push(bodyRow(row))
      if (index < clean.length - 1)
         lines.push(border('ml', '┼', 'mr'))
   })
   lines.push(border('bl', '┴', 'br'))

   return lines
}

// ==================================================
// PARSING CODE BLOCK (fence ``` / ~~~ )
// ==================================================
const FENCE_ANY_REGEX = /^(`{3,}|~{3,})(\w[\w-]*)?\s*$/

const cleanFenceLine = (line) => {
   const match = line.match(FENCE_ANY_REGEX)
   if (!match) return line
   // Preserve marker pembuka/penutup WhatsApp, buang header bahasa.
   return '```'
}

// ==================================================
// INTI: formatMarkdown
// ==================================================

/**
 * Rapikan respons teks AI menjadi teks aman untuk WhatsApp.
 * @param {string} input - Respons mentah dari AI.
 * @param {object} [options]
 * @param {number} [options.maxCodeLines] - Potong baris kode terlalu panjang (default: tidak dipotong).
 * @returns {string} Teks yang sudah dirapikan.
 */
Func.formatMarkdown = (input = '', options = {}) => {
   if (typeof input !== 'string')
      return String(input ?? '')

   const text = input.replace(/\r\n/g, '\n')
   const lines = text.split('\n')
   const maxCodeLines = options.maxCodeLines || 0

   const output = []
   let inCode = false
   let codeBuffer = []
   let inTable = false
   let tableRows = []
   let textBuffer = []

   const flushText = () => {
      const joined = textBuffer.join('\n').trimEnd()
      if (joined)
         output.push(...joined.split('\n').map(cleanLine))

      textBuffer = []
   }

   const flushCode = () => {
      let code = codeBuffer.join('\n')
      if (maxCodeLines > 0 && code.split('\n').length > maxCodeLines)
         code = code.split('\n').slice(0, maxCodeLines).join('\n') + '\n… (dipotong)'

      output.push('```', code, '```')
      codeBuffer = []
   }

   const flushTable = () => {
      output.push(...buildBoxTable(tableRows))
      tableRows = []
   }

   for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      // ---- CODE BLOCK ----
      if (FENCE_ANY_REGEX.test(line)) {
         if (inCode) {
            flushCode()
            inCode = false
         }
         else {
            flushText()
            flushTable()
            inCode = true
         }
         continue
      }

      if (inCode) {
         codeBuffer.push(line)
         continue
      }

      // ---- TABEL MARKDOWN ----
      if (!inTable && isTableRow(line) && isTableSeparator(lines[i + 1])) {
         flushText()
         inTable = true
         tableRows.push(line)
         i++ // lewati baris separator
         continue
      }

      if (inTable) {
         if (isTableRow(line) && !isTableSeparator(line))
            tableRows.push(line)
         else {
            flushTable()
            inTable = false
            textBuffer.push(line)
         }
         continue
      }

      // ---- TEKS BIASA ----
      textBuffer.push(line)
   }

   if (inCode) flushCode()
   if (inTable) flushTable()
   flushText()

   // Rapikan spasi: buang spasi trailing & kolaps baris kosong berlebih.
   return output
      .map(line => line.replace(/\s+$/, ''))
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
}

/**
 * Alias / varian dari formatMarkdown.
 * - Default : mengembalikan string teks siap kirim ({ text }).
 * - asSegments:true : mengembalikan array segmen [{ type, content }]
 *   untuk keperluan richResponse/parser lanjutan.
 */
Func.parseAIMessage = (input = '', options = {}) => {
   if (options.asSegments)
      return Func.parseMarkdownSegments(input, options)

   return Func.formatMarkdown(input, options)
}

/**
 * Ubah markdown AI menjadi array segmen terstruktur.
 * @returns {Array<{type:'text'|'code'|'table', content:string|string[][]}>}
 */
Func.parseMarkdownSegments = (input = '', options = {}) => {
   if (typeof input !== 'string')
      return [{ type: 'text', content: String(input ?? '') }]

   const text = input.replace(/\r\n/g, '\n')
   const lines = text.split('\n')
   const segments = []
   let inCode = false
   let codeLanguage = 'text'
   let codeBuffer = []
   let textBuffer = []

   const flushText = () => {
      const joined = textBuffer.join('\n').trim()
      if (joined)
         segments.push({ type: 'text', content: joined.split('\n').map(cleanLine).join('\n') })
      textBuffer = []
   }

   for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const fence = line.match(FENCE_ANY_REGEX)

      if (fence) {
         if (inCode) {
            segments.push({ type: 'code', language: codeLanguage, content: codeBuffer.join('\n') })
            inCode = false
         }
         else {
            flushText()
            inCode = true
            codeLanguage = fence[2] || 'text'
            codeBuffer = []
         }
         continue
      }

      if (inCode) {
         codeBuffer.push(line)
         continue
      }

      if (isTableRow(line) && isTableSeparator(lines[i + 1])) {
         flushText()
         const rows = [line]
         i++
         while (i + 1 < lines.length && isTableRow(lines[i + 1]) && !isTableSeparator(lines[i + 1])) {
            rows.push(lines[i + 1])
            i++
         }
         segments.push({ type: 'table', content: buildBoxTable(rows) })
         continue
      }

      textBuffer.push(line)
   }

   if (inCode)
      segments.push({ type: 'code', language: codeLanguage, content: codeBuffer.join('\n') })
   flushText()

   return segments
}

// ==================================================
// SHORTHAND SENDS
// ==================================================

/**
 * Kirim teks AI yang sudah dirapikan via sock.sendMessage, dengan
 * fallback otomatis ke teks mentah jika proses/send gagal.
 *
 * PAYLOAD SELALU MURNI `{ text }`:
 *   - Input dipaksa menjadi string agar tidak pernah mengirim objek
 *     non-teks (sumber utama error "Invalid media type").
 *   - Hanya key aman (mentions / contextInfo) yang ikut diteruskan.
 *   - Tidak ada key media (image/document/header) bernilai null/undefined.
 *
 * @param {object} sock
 * @param {string} jid
 * @param {string} aiResponse
 * @param {object} opts - { quoted, content, options }
 */
Func.sendAI = async (sock, jid, aiResponse = '', opts = {}) => {
   const {
      quoted = null,
      content = {},
      options = {}
   } = opts

   const rawText = typeof aiResponse === 'string' ? aiResponse : String(aiResponse ?? '')
   const cleaned = Func.formatMarkdown(rawText)

   const { mentions, contextInfo } = content || {}

   const buildPayload = (text) => {
      const payload = { text }
      if (Array.isArray(mentions))
         payload.mentions = mentions
      if (contextInfo && typeof contextInfo === 'object')
         payload.contextInfo = contextInfo
      return payload
   }

   // Percobaan utama: teks Markdown yang sudah dirapikan.
   try {
      return await sock.sendMessage(jid, buildPayload(cleaned), { quoted, ...options })
   }
   catch (error) {
      console.error('❌ sendAI (formatMarkdown) error:', error?.message || error)

      // Fallback 1: teks mentah (tanpa formatting apa pun).
      try {
         return await sock.sendMessage(jid, buildPayload(rawText), { quoted, ...options })
      }
      catch (fallbackError) {
         console.error('❌ sendAI (fallback raw) error:', fallbackError?.message || fallbackError)
      }
   }

   return undefined
}
