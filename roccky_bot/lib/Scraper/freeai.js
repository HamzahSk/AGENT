import fs from 'fs';
import path from 'path';
import { Scrap } from '#scrap';

// Konfigurasi Base URL & Proxy
const PROXY_URL = 'http://93.115.101.150:11584/proxy?url=';
const API_NONCE = 'https://aifreeforever.com/api/chat-nonce';
const API_ANSWER = 'https://aifreeforever.com/api/generate-ai-answer';

const baseHeaders = {
  'Accept': '*/*',
  'Accept-Encoding': 'gzip, deflate, br, zstd',
  'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
  'Origin': 'https://aifreeforever.com',
  'Referer': 'https://aifreeforever.com/tools/free-chat-gpt-no-login',
  'Sec-Ch-Ua': '"Chromium";v="127", "Not)A;Brand";v="99", "Microsoft Edge Simulate";v="127", "Lemur";v="127"',
  'Sec-Ch-Ua-Mobile': '?1',
  'Sec-Ch-Ua-Platform': '"Android"',
  'Sec-Fetch-Dest': 'empty',
  'Sec-Fetch-Mode': 'cors',
  'Sec-Fetch-Site': 'same-origin',
  'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Mobile Safari/537.36'
};

function getMimeType(fileName) {
  const ext = path.extname(fileName).toLowerCase();
  const mimeMap = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.pdf': 'application/pdf',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.txt': 'text/plain'
  };
  return mimeMap[ext] || 'application/octet-stream';
}

const sessions = new Map();

class AIFreeSession {
  constructor(userId) {
    this.userId = userId;
    this.conversationHistory = [];
    this.timeout = null;
    this.resetTimeout();
  }

  static getSession(userId) {
    if (!sessions.has(userId)) {
      sessions.set(userId, new AIFreeSession(userId));
    }
    return sessions.get(userId);
  }

  resetTimeout() {
    if (this.timeout) clearTimeout(this.timeout);
    this.timeout = setTimeout(() => {
      this.clearSession();
    }, 5 * 60 * 1000); // Reset otomatis setelah 5 menit tidak aktif
  }

  async _getNonce() {
    try {
      const response = await fetch(`${PROXY_URL}${API_NONCE}`, {
        method: 'GET',
        headers: baseHeaders
      });
      if (!response.ok) throw new Error(`Gagal mengambil nonce: ${response.status}`);
      const data = await response.json();
      return data.nonce;
    } catch (error) {
      console.error('Error saat mengambil nonce:', error.message);
      return null;
    }
  }

  async ask(question, fileData = null) {
    this.resetTimeout();

    const nonce = await this._getNonce();
    if (!nonce) return null;

    let filePayload = null;
    if (fileData) {
      try {
        if (typeof fileData === 'string') {
          const absolutePath = path.resolve(fileData);
          if (fs.existsSync(absolutePath)) {
            const fileName = path.basename(absolutePath);
            filePayload = {
              data: fs.readFileSync(absolutePath).toString('base64'),
              name: fileName,
              type: getMimeType(fileName)
            };
          }
        } else if (fileData.buffer) {
          filePayload = {
            data: fileData.buffer.toString('base64'),
            name: fileData.name || 'file',
            type: fileData.mime || 'application/octet-stream'
          };
        }
      } catch (err) {
        console.error('Gagal memproses file:', err.message);
      }
    }

    const currentTime = Date.now();
    const payload = {
      question: question,
      tone: "friendly",
      aiName: "",
      aiRole: "assistant",
      conversationHistory: this.conversationHistory,
      file: filePayload,
      format: "paragraph",
      interactionProof: {
        nonce: nonce,
        keystrokeCount: 0,
        pasteEvents: 0,
        startTime: currentTime,
        submitTime: currentTime,
        totalTypingTime: 0
      }
    };

    try {
      const response = await fetch(`${PROXY_URL}${API_ANSWER}`, {
        method: 'POST',
        headers: { ...baseHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      console.log(response)

      if (!response.ok) throw new Error(`Gagal memproses jawaban: ${response.status}`);
      
      const responseText = await response.text();
      let aiResponse = responseText;
      console.log(responseText)
      

      // ======================================================
      // PARSE JSON OTOMATIS AGAR LANGSUNG BERUPA TEKS BERSIH
      // ======================================================
      try {
        const json = JSON.parse(responseText);
        if (json.answer) aiResponse = json.answer;
        else if (json.text) aiResponse = json.text;
        else if (json.content) aiResponse = json.content;
      } catch {
        // Jika respons bukan JSON string, gunakan responseText langsung
      }

      // Simpan teks bersih ke dalam riwayat chat
      this.conversationHistory.push({ role: 'user', content: question });
      this.conversationHistory.push({ role: 'assistant', content: aiResponse });

      // Batasi maksimal history 10 baris chat (buang yang paling lama)
      if (this.conversationHistory.length > 10) {
        this.conversationHistory = this.conversationHistory.slice(-10);
      }

      return aiResponse;
    } catch (error) {
      console.error('Error saat memproses jawaban AI:', error.message);
      return null;
    }
  }

  clearSession() {
    if (this.timeout) clearTimeout(this.timeout);
    this.conversationHistory = [];
    sessions.delete(this.userId);
    console.log(`[System]: Sesi untuk user ${this.userId} telah dibersihkan otomatis karena 5 menit tidak ada chat.`);
  }
}

Scrap.AIFreeSession = AIFreeSession;
