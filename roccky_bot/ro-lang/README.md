# ro-lang

`ro-lang` adalah mesin tutor bahasa percakapan dengan memory jangka panjang. Tutor mengenali bahasa yang ingin dipelajari dari percakapan, menilai kemampuan secara bertahap, menyusun kurikulum adaptif, mengingat kelemahan, dan menjadwalkan review kosakata dengan spaced repetition.

Integrasi WhatsApp berada di `plugins/ai/_rocky-learning.js`. Akses tetap owner-only dan setiap chat memakai learner ID terpisah (`whatsapp:<jid>`), sehingga konteks, bahasa, kosakata, dan progress tidak tercampur antar-chat.

## Cara belajar di WhatsApp

Mulai sekali dengan:

```text
.rockylearn
```

Setelah sesi aktif, pengguna cukup berbicara secara alami, misalnya:

```text
Aku ingin belajar bahasa Jepang untuk liburan.
Apa yang kita pelajari hari ini?
Tolong koreksi kalimat ini: I go to office yesterday.
Uji kosakata saya.
Sekarang bantu aku belajar bahasa Spanyol.
```

Tutor akan:

- memulai diagnostik tanpa formulir konfigurasi;
- mendeteksi bahasa target, bahasa utama, tujuan, minat, dan preferensi;
- mengingat beberapa bahasa dengan progress yang terpisah;
- memilih review, remediasi, atau materi baru berdasarkan mastery;
- menilai vocabulary, grammar, conversation, listening, pronunciation, reading, dan writing secara konservatif;
- menyimpan aktivitas yang sedang menunggu jawaban agar respons berikutnya dapat dinilai;
- mengoreksi kesalahan dan meneruskan percakapan dengan pertanyaan atau latihan yang relevan.

Perintah teknis seperti `vocab due`, reminder, alarm, dan `stop` tetap tersedia untuk kompatibilitas dan pengelolaan.

## Memory dan kurikulum

Memory menggunakan MongoDB jika dikonfigurasi, atau file JSON atomic sebagai fallback. Record lama otomatis dinormalisasi ke model course baru.

Setiap bahasa menyimpan:

- level estimasi dan confidence assessment;
- skor per skill;
- tujuan, minat, dan preferensi mengajar;
- topic mastery, grammar yang telah dibahas, objective aktif, dan review queue;
- kekuatan, kesalahan berulang, dan aktivitas yang menunggu jawaban;
- vocabulary dan jadwal spaced repetition khusus bahasa tersebut;
- ringkasan percakapan serta riwayat belajar terbaru.

CEFR A1-C2 dipakai sebagai kerangka jalur belajar, bukan label yang ditentukan dari satu jawaban. Topic baru hanya dianggap mastered setelah ada bukti assessment; mengirim lesson saja tidak menandai mastery.

## WhatsApp AI Rich

Tutor dapat memilih plain text, AIRich table, atau mini-app HTML untuk flashcard, quiz, fill-in-the-blank, matching, progress, dan pronunciation guide.

Implementasinya mengikuti `DOCS_BAILEYS.md`:

- HTML dibungkus dengan `MB.htmlSection(...)` di dalam `MB.AIRich`;
- seluruh HTML, CSS, dan JavaScript bersifat inline tanpa resource remote atau storage;
- model hanya menghasilkan data aktivitas terstruktur, bukan HTML mentah;
- semua konten model di-escape sebelum ditanam ke script;
- setiap komponen memiliki text/table fallback karena AIRich eksperimental dan HTML mini-app hanya dirender pada klien yang mendukungnya;
- jawaban yang perlu dicatat tetap dikirim sebagai pesan WhatsApp karena klik di WebView tidak otomatis kembali ke bot.

## Konfigurasi API

Konfigurasi tetap kompatibel dengan API key dan base URL kustom:

```env
RO_LANG_API_KEY=your-api-key
RO_LANG_BASE_URL=https://api.openai.com/v1
RO_LANG_MODEL=gpt-4.1-mini
RO_LANG_API_MODE=auto
```

Alias `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_MODEL`, dan `OPENAI_API_MODE` juga didukung.

`RO_LANG_API_MODE` menerima:

- `auto` — gunakan endpoint eksplisit jika diberikan; jika tidak, coba Chat Completions dan fallback ke Responses pada error endpoint;
- `chat_completions` — paksa `/chat/completions`;
- `responses` — paksa `/responses`.

Penyimpanan file lokal:

```env
RO_LANG_MEMORY_FILE=./data/memory.json
```

MongoDB:

```env
MONGODB_URI=mongodb://127.0.0.1:27017
MONGODB_DB=ro_lang
MONGODB_COLLECTION=learners
```

## Digunakan sebagai module

```js
import {
  createMemoryStore,
  getConfig,
  LanguageTutor,
  LearningMemory,
  OpenAICompatibleClient,
} from './src/index.js'

const config = getConfig()
const store = await createMemoryStore(config)
const memory = new LearningMemory(store)
const tutor = new LanguageTutor(new OpenAICompatibleClient(config), { memory })

await memory.initializeLearner({
  userId: 'alice',
  targetLanguage: 'Undetermined',
  nativeLanguage: 'Indonesian'
})

const turn = await tutor.converse({
  userId: 'alice',
  targetLanguage: 'Undetermined',
  nativeLanguage: 'Indonesian',
  message: 'Aku ingin belajar Mandarin untuk bekerja.'
})

console.log(turn.reply)
await store.close()
```

API lama seperti `createLesson`, `createPractice`, `reviewAnswer`, vocabulary management, dan CLI tetap tersedia untuk kompatibilitas.

## Test

Dari root project:

```sh
node --test ro-lang/test/*.test.js
```

Test menggunakan server HTTP dan memory sementara lokal; tidak ada request ke AI atau MongoDB nyata.
