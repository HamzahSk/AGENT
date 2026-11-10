import fs from 'fs';
import path from 'path';
import * as cheerio from 'cheerio';
import { catbox, uguu, quax } from '../../lib/Scraper.js';
import { isMimeImage, isMimeVideo } from '../../lib/Utilities.js';
import gtts from 'gtts';
import QRCode from 'qrcode';
import axios from 'axios';
import { Scrap } from '#scrap';

const proxy = 'http://93.115.101.150:11584/proxy?url=';
const MAX_SIZE = 1024 * 1024 * 15; // 15MB

// ======================================================
// 1. UTILITIES (Upload, Search, Fetch, Download, dll)
// ======================================================

async function uploadFile(buffer) {
    let url = null;
    try { url = await catbox(buffer); } catch {}
    if (!url) { try { url = await uguu(buffer); } catch {} }
    if (!url) { try { url = await quax(buffer); } catch {} }
    if (!url) throw new Error('Gagal upload file.');
    return url;
}

async function searchInternet(query) {
    try {
        const res = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`);
        const html = await res.text();
        const $ = cheerio.load(html);
        let results = [];
        $('.result').each((i, el) => {
            if (i > 4) return;
            const title = $(el).find('.result__title').text().trim();
            const snippet = $(el).find('.result__snippet').text().trim();
            const link = $(el).find('a.result__a').attr('href');
            results.push({ title, snippet, link });
        });
        return results;
    } catch { return []; }
}

async function searchImage(query) {
    try {
        const res = await fetch(`https://www.bing.com/images/search?q=${encodeURIComponent(query)}`);
        const html = await res.text();
        const $ = cheerio.load(html);
        let imgUrl = null;
        $('a.iusc').each((i, el) => {
            const mAttr = $(el).attr('m');
            if (mAttr && !imgUrl) {
                try {
                    const data = JSON.parse(mAttr);
                    if (data.murl) imgUrl = data.murl;
                } catch {}
            }
        });
        return imgUrl;
    } catch { return null; }
}

async function fetchWeb(url) {
    const extractText = html => {
        const $ = cheerio.load(html);
        $('script,style,noscript,svg,iframe,nav,footer').remove();
        return $('body').text().replace(/\s+/g, ' ').trim();
    };
    try {
        let res = await fetch(url);
        if (!res.ok) throw new Error();
        return extractText(await res.text()).slice(0, 6000);
    } catch {
        let res = await fetch(proxy + encodeURIComponent(url));
        return extractText(await res.text()).slice(0, 6000);
    }
}

async function rockyDownload(url) {
    const infoRes = await fetch('https://downloader-anything-rocky.vercel.app/api/info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
    });
    const info = await infoRes.json();
    if (!info.status || !info.result.medias?.length) return null;
    const media = info.result.medias[0];
    let downloadUrl = media.url;
    if (media.requiresRendering || downloadUrl.startsWith('savenow:')) {
        const resolveRes = await fetch('https://downloader-anything-rocky.vercel.app/api/resolve', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: info.result.raw?.url || url, mediaUrl: media.url })
        });
        const r = await resolveRes.json();
        if (r.status) downloadUrl = r.downloadUrl;
    }
    return { ...info.result, downloadUrl };
}

async function transcribeAudio(filePath, apiKey) {
    const formData = new FormData();
    formData.append("file", new Blob([fs.readFileSync(filePath)]), "audio.ogg");
    formData.append("model", "whisper-large-v3");
    const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
        method: "POST",
        headers: { "Authorization": `Bearer ${apiKey || ''}` },
        body: formData
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || "Gagal transkrip audio");
    return data.text;
}

async function textToSpeech(text, lang = 'id') {
    return new Promise((resolve, reject) => {
        const tts = new gtts(text, lang);
        const fileName = `tts_${Date.now()}.mp3`;
        const filePath = path.join('./temp', fileName);
        tts.save(filePath, (err) => {
            if (err) reject(err);
            else resolve(filePath);
        });
    });
}

async function generateImage(prompt) {
    const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1024&height=1024&nologo=true`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('Gagal generate gambar');
    return Buffer.from(await res.arrayBuffer());
}

async function editImage(buffer, prompt) {
    const result = await Scrap.processEzCreateJob(buffer, prompt);
    if (!result || !result[0]) throw new Error("Gagal mengedit gambar via Scrap.");
    
    const response = await fetch(result[0]);
    if (!response.ok) throw new Error("Gagal mengunduh gambar hasil edit.");
    return Buffer.from(await response.arrayBuffer());
}

async function executeCode(code) {
    return new Promise((resolve) => {
        const sandbox = {
            console: { log: (...args) => resolve(args.join(' ')) },
            fetch: global.fetch,
            Buffer: Buffer,
            setTimeout, setInterval,
            Math, Date, JSON, Array, Object, String, Number, Boolean
        };
        try {
            const fn = new Function('sandbox', `with(sandbox) { ${code} }`);
            fn(sandbox);
            setTimeout(() => resolve('Kode dieksekusi (tidak ada output console.log).'), 100);
        } catch (err) {
            resolve(`Error: ${err.message}`);
        }
    });
}

async function makeSticker(buffer, isVideo = false) { return buffer; }
async function stickerToImage(buffer) { return buffer; }
async function generateQRCode(text) { return await QRCode.toBuffer(text); }

async function getWeather(city) {
    try {
        const res = await fetch(`https://wttr.in/${encodeURIComponent(city)}?format=%l:+%c+%t,+%w,+%h`);
        const text = await res.text();
        return text;
    } catch { return "Tidak dapat mengambil data cuaca."; }
}

async function translateText(text, targetLang = 'id') {
    try {
        const res = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|${targetLang}`);
        const data = await res.json();
        return data.responseData.translatedText;
    } catch { return "Gagal menerjemahkan."; }
}

async function calculateExpression(expr) {
    try {
        if (!/^[0-9+\-*/().\s]+$/.test(expr)) return "Ekspresi tidak valid.";
        const result = eval(expr);
        return `Hasil: ${result}`;
    } catch { return "Ekspresi matematika salah."; }
}

// ======================================================
// 2. ACTION TOOLS (Eksekusi perintah AI)
// ======================================================
async function executeTool({ action, payload, m, sock, quoted, bufferMedia, mimetype, groqApiKey }) {
    switch (action) {
        case 'UPLOAD':
            if (!bufferMedia) return m.reply('❌ Reply media dulu.');
            const url = await uploadFile(bufferMedia);
            return sock.sendMessage(m.chat, { text: `✅ Berhasil upload\n🔗 ${url}` }, { quoted: m });

        case 'SEARCH':
            const searchResults = await searchInternet(payload);
            if (!searchResults.length) return m.reply('❌ Tidak ada hasil.');
            const text = searchResults.map((v, i) => `${i+1}. ${v.title}\n${v.snippet}\n🔗 ${v.link}`).join('\n\n');
            return sock.sendMessage(m.chat, { text: text.slice(0, 4000) }, { quoted: m });

        case 'SEARCH_IMAGE':
            const imgUrl = await searchImage(payload);
            if (!imgUrl) return m.reply('❌ Gambar tidak ditemukan.');
            return sock.sendMessage(m.chat, { image: { url: imgUrl }, caption: `🔍 Hasil: ${payload}` }, { quoted: m });

        case 'FETCH':
            const content = await fetchWeb(payload);
            return sock.sendMessage(m.chat, { text: content.slice(0, 4000) }, { quoted: m });

        case 'SEND_IMAGE':
            return sock.sendMessage(m.chat, { image: { url: payload } }, { quoted: m });

        case 'SEND_VIDEO':
            return sock.sendMessage(m.chat, { video: { url: payload } }, { quoted: m });

        case 'SEND_AUDIO':
            return sock.sendMessage(m.chat, { audio: { url: payload }, mimetype: 'audio/mpeg', ptt: false }, { quoted: m });

        case 'SEND_STICKER':
            return sock.sendMessage(m.chat, { sticker: { url: payload } }, { quoted: m });

        case 'MAKE_STICKER':
            if (!bufferMedia) return m.reply('❌ Reply gambar/video untuk dijadikan stiker.');
            if (!isMimeImage(mimetype) && !isMimeVideo(mimetype))
                return m.reply('❌ Hanya gambar atau video yang bisa dijadikan stiker.');
            await sock.sendMedia(m.chat, bufferMedia, '', m, { sticker: true });
            return m.reply('✅ Stiker berhasil dibuat!');

        case 'TO_IMAGE':
            if (!bufferMedia || !mimetype?.includes('webp')) return m.reply('❌ Reply stiker (webp) untuk dikonversi ke gambar.');
            const imgBuffer = await stickerToImage(bufferMedia);
            await sock.sendMessage(m.chat, { image: imgBuffer, caption: '🖼️ Konversi stiker ke gambar.' }, { quoted: m });
            return;

        case 'DOWNLOAD_VIDEO':
        case 'DOWNLOAD_AUDIO':
            const isAudio = action === 'DOWNLOAD_AUDIO';
            const dl = await rockyDownload(payload);
            if (dl?.downloadUrl) {
                const cleanTitle = dl.title ? dl.title.replace(/[^a-zA-Z0-9 ]/g, '') : 'media';
                const caption = `✅ ${isAudio ? 'Audio' : 'Video'} siap!\nJudul: ${dl.title || '-'}`;
                await sock.sendMedia(m.chat, dl.downloadUrl, caption, m, {
                    fileName: `${cleanTitle}.${isAudio ? 'mp3' : 'mp4'}`,
                    mimetype: isAudio ? 'audio/mpeg' : 'video/mp4',
                    toStream: true,
                    ...(isAudio ? { audio: true } : { type: 'video' })
                });
                return;
            }
            return m.reply('❌ Gagal download.');

        case 'TEXT_TO_SPEECH':
            const ttsPath = await textToSpeech(payload, 'id');
            await sock.sendMessage(m.chat, { audio: { url: ttsPath }, mimetype: 'audio/mpeg', ptt: false }, { quoted: m });
            fs.unlinkSync(ttsPath);
            return;

        case 'GENERATE_IMAGE':
            const genImg = await generateImage(payload);
            await sock.sendMessage(m.chat, { image: genImg, caption: `🖼️ AI: ${payload}` }, { quoted: m });
            return;

        case 'EDIT_IMAGE':
            if (!bufferMedia || !mimetype.startsWith('image/')) return m.reply('❌ Reply gambar untuk diedit.');
            const edited = await editImage(bufferMedia, payload);
            await sock.sendMessage(m.chat, { image: edited, caption: `✏️ Edit: ${payload}` }, { quoted: m });
            return;

        case 'EXECUTE_CODE':
            const output = await executeCode(payload);
            return sock.sendMessage(m.chat, { text: `💻 Output:\n${output.slice(0, 4000)}` }, { quoted: m });

        case 'FETCH_API':
            const apiRes = await fetch(payload);
            const apiText = await apiRes.text();
            return sock.sendMessage(m.chat, { text: apiText.slice(0, 4000) }, { quoted: m });

        case 'QR_CODE':
            const qrBuffer = await generateQRCode(payload);
            return sock.sendMessage(m.chat, { image: qrBuffer, caption: `📱 QR Code: ${payload}` }, { quoted: m });

        case 'WEATHER':
            const weather = await getWeather(payload);
            return sock.sendMessage(m.chat, { text: `🌤️ Cuaca: ${weather}` }, { quoted: m });

        case 'TRANSLATE':
            const translated = await translateText(payload, 'id');
            return sock.sendMessage(m.chat, { text: `🌐 Terjemahan: ${translated}` }, { quoted: m });

        case 'CALCULATE':
            const calcResult = await calculateExpression(payload);
            return sock.sendMessage(m.chat, { text: `🧮 ${calcResult}` }, { quoted: m });

        default:
            return m.reply('❌ Aksi tidak dikenal.');
    }
}

// ======================================================
// 3. SYSTEM PROMPT CONFIG
// ======================================================
function buildSystemPrompt() {
    const date = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'full', timeStyle: 'long' });
    return `Kamu ROCKYY, AI asisten WhatsApp yang super pintar, ramah, dan hemat biaya.
Waktu: ${date} WIB.

Kamu tidak memiliki model vision langsung, tetapi kamu bisa menerima data dari file/media yang diunggah. Gunakan tools berikut jika diperlukan dengan membalas menggunakan format eksak [ACTION:NAMA|parameter]:

WAJIB FORMAT EKSRAK: [ACTION:NAMA_TOOL|parameter_atau_url]
Contoh: [ACTION:DOWNLOAD_VIDEO|https://vt.tiktok.com/ZSxFVCyfs/]

TOOLS:
- UPLOAD : upload media yang direply
- SEARCH : cari informasi internet |query
- SEARCH_IMAGE : cari gambar di Bing |query
- FETCH : baca isi website |url
- SEND_IMAGE : kirim gambar dari URL |url
- SEND_VIDEO : kirim video dari URL |url
- SEND_AUDIO : kirim audio dari URL |url
- SEND_STICKER : kirim stiker dari URL |url
- MAKE_STICKER : buat stiker dari media yang direply (gambar/video)
- TO_IMAGE : konversi stiker (webp) ke gambar PNG
- DOWNLOAD_VIDEO : download video dari TikTok/IG/YouTube |url
- DOWNLOAD_AUDIO : download audio dari video |url
- TEXT_TO_SPEECH : ubah teks jadi suara (Google TTS) |teks
- GENERATE_IMAGE : buat gambar AI (Pollinations) |prompt
- EDIT_IMAGE : edit gambar yang direply |prompt
- EXECUTE_CODE : jalankan kode JavaScript (sandbox) |kode
- FETCH_API : panggil API dan tampilkan hasil |url
- QR_CODE : generate QR code dari teks |teks
- WEATHER : cek cuaca kota |nama_kota
- TRANSLATE : terjemahkan teks ke Indonesia |teks
- CALCULATE : hitung ekspresi matematika |ekspresi

PENTING:
- Jika user reply media + "jadikan url" → UPLOAD
- Jika user minta stiker dari media → MAKE_STICKER
- Jika user kasih link video → DOWNLOAD_VIDEO atau DOWNLOAD_AUDIO
- Untuk coding atau skrip → EXECUTE_CODE
- Jangan bilang tidak bisa, gunakan tools yang tersedia.`;
}

// ======================================================
// 4. PARSER ACTION & MARKDOWN
// ======================================================
function parseAction(text = '') {
    // Penggunaan [\s\S]*? memastikan seluruh baris baru dan karakter spesial ikut tertangkap
    const match = text.match(/\[(?:ACTION:)?([A-Z_]+)(?:\|([\s\S]*?))?\]/i);
    if (!match) return null;
    return { action: match[1].toUpperCase(), payload: match[2]?.trim() || '' };
}

// Formatting Markdown AI ditangani oleh helper terpusat:
// Func.formatMarkdown / func.formatMarkdown (lib/Function/markdown.js).

// ======================================================
// 5. MAIN EXPORT (Integrasi Scrap AIFreeSession)
// ======================================================
export default {
    async run(m, { sock, body, user, setting, Func, isPremium }) {
        try {
            if (!setting.chatBot || !isPremium || m.fromMe) return;

            const rawKeys = global.groqApiKeys || process.env.GROQ_API_KEYS || '';
            const keys = Array.isArray(rawKeys) ? rawKeys : rawKeys.split(',').map(k => k.trim()).filter(Boolean);
            const groqApiKey = keys.length ? keys[Math.floor(Math.random() * keys.length)] : null;

            const q = m.quoted || m;
            const mimetype = (q.msg || q).mimetype || '';
            const mediaSize = (q.msg || q).fileLength?.low || 0;
            let bufferMedia = null, mediaUrl = null;

            if (mimetype) {
                if (mediaSize > MAX_SIZE) return m.reply(`❌ Media terlalu besar (maks 15MB).`);
                bufferMedia = await q.download?.();
                if (!Buffer.isBuffer(bufferMedia)) return m.reply('❌ Gagal unduh media.');
                try { mediaUrl = await uploadFile(bufferMedia); } catch {}
            }

            let cleanBody = body || '';

            // Auto-transkrip audio
            if (mimetype && mimetype.startsWith('audio/')) {
                const filePath = await Func.persistToFile(bufferMedia);
                const transcript = await transcribeAudio(filePath, groqApiKey);
                cleanBody = `[Transkrip audio]: "${transcript}"\n\nTanggapi: ${cleanBody}`;
                fs.unlinkSync(filePath);
            }

            // Auto-baca file teks
            if (mimetype && (mimetype.includes('text') || mimetype.includes('json') || mimetype.includes('javascript'))) {
                const fileText = bufferMedia.toString('utf-8').slice(0, 4000);
                cleanBody = `[Isi file]:\n\`\`\`\n${fileText}\n\`\`\`\nPesan: ${cleanBody}`;
            }

            // Deteksi perintah "jadikan url" langsung
            const lower = cleanBody.toLowerCase();
            if (mimetype && (lower.includes('jadikan url') || lower.includes('upload ini') || lower.includes('buat link'))) {
                const upUrl = await uploadFile(bufferMedia);
                return sock.sendMessage(m.chat, { text: `✅ Link: ${upUrl}` }, { quoted: m });
            }

            // Deteksi perintah "buat stiker" langsung
            if (bufferMedia && (lower.includes('buat stiker') || lower.includes('jadikan stiker') || lower.includes('stiker'))) {
                if (!isMimeImage(mimetype) && !isMimeVideo(mimetype))
                    return m.reply('❌ Hanya gambar/video yang bisa dijadikan stiker.');
                await sock.sendMedia(m.chat, bufferMedia, '', m, { sticker: true });
                return m.reply('✅ Stiker siap!');
            }

            // Konstruksi pesan final untuk AI
            let finalMessage = cleanBody;
            if (m.quoted?.text) finalMessage = `[Reply]: ${m.quoted.text}\n\n[User]: ${cleanBody}`;
            if (mediaUrl) finalMessage = `[Media URL: ${mediaUrl}]\nMime: ${mimetype}\n\n${finalMessage}`;

            // Sisipkan instruksi sistem prompt ke dalam instruksi pesan saat ini
            const systemPrompt = buildSystemPrompt();
            finalMessage = `${systemPrompt}\n\n[Pesan Baru Dari User]: ${finalMessage}`;

            const thinking = await sock.sendMessage(m.chat, { text: '🧠 ROCKYY berpikir...' }, { quoted: m });

            // Panggil modul Sesi AI Free per Pengguna (m.sender)
            const aiSession = Scrap.AIFreeSession.getSession(m.sender);
            
            let fileData = null;
            if (bufferMedia) {
                fileData = {
                    buffer: bufferMedia,
                    name: (q.msg || q).filename || 'file_media',
                    mime: mimetype
                };
            }

            const aiResponse = await aiSession.ask(finalMessage, fileData);
            if (!aiResponse) {
                return sock.sendMessage(m.chat, { text: '❌ Gagal mendapatkan respons dari AI.' }, { quoted: m });
            }

            const actionData = parseAction(aiResponse);
            if (actionData) {
                // Regex pembersih juga diperbarui agar menghapus seluruh blok multi-line aksi dari balasan teks
                const cleanResp = aiResponse.replace(/\[(?:ACTION:)?([A-Z_]+)(?:\|([\s\S]*?))?\]/gi, '').trim() || '⚡ Memproses...';
                await sock.sendMessage(m.chat, { text: cleanResp, edit: thinking?.key });
                await executeTool({
                    action: actionData.action,
                    payload: actionData.payload,
                    m, sock, quoted: q,
                    bufferMedia, mimetype,
                    groqApiKey
                });
                return;
            }

            // Kirim balasan teks AI yang sudah dirapikan (code block, tabel,
            // escape sequence) dengan fallback otomatis ke teks mentah.
            // Helper terpusat Func.sendAI menjamin payload murni `{ text }`
            // (tanpa key media null/undefined) sehingga tidak memicu error
            // "Invalid media type" dari Baileys.
            if (thinking?.key)
                await sock.sendMessage(m.chat, { delete: thinking.key });
            await Func.sendAI(sock, m.chat, aiResponse, { quoted: m });

        } catch (error) {
            console.error(error);
            m.reply(`❌ Error: ${error.message || String(error)}`);
        }
    }
};
