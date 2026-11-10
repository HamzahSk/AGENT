import { MB } from 'baileys'
import { fileURLToPath } from 'node:url'
import { dirname, isAbsolute, join, resolve } from 'node:path'

import {
   createMemoryStore,
   getConfig,
   LanguageTutor,
   LearningMemory,
   OpenAICompatibleClient,
   renderLearningComponent
} from '../../ro-lang/src/index.js'

const TIME_ZONE = 'Asia/Pontianak'
const TIME_ZONE_OFFSET_HOURS = 7
const SCHEDULER_INTERVAL_MS = 15_000
const MAX_TABLE_ROWS = 20
const LEVEL_PRESETS = {
   beginner: ['A1', 10], a1: ['A1', 10],
   elementary: ['A2', 25], a2: ['A2', 25],
   intermediate: ['B1', 50], b1: ['B1', 50],
   'upper-intermediate': ['B2', 65], b2: ['B2', 65],
   advanced: ['C1', 80], c1: ['C1', 80],
   proficient: ['C2', 95], c2: ['C2', 95]
}
const RUNTIME_KEY = Symbol.for('roccky.rockyLearn.runtime')
const PLUGIN_DIR = dirname(fileURLToPath(import.meta.url))
const RO_LANG_DIR = resolve(PLUGIN_DIR, '../../ro-lang')

const runtime = globalThis[RUNTIME_KEY] ??= {
   sock: null,
   servicesPromise: null,
   timer: null,
   schedulerRunning: false,
   processingReminders: new Set(),
   knownSessionIds: new Set(),
   queues: new Map()
}

const truncate = (value, length = 80) => {
   const text = String(value ?? '-').replace(/\s+/g, ' ').trim() || '-'
   return text.length > length ? text.slice(0, length - 1) + '…' : text
}

const sessionIdFor = (m) => `whatsapp:${m.chat}`

const defaultWhatsAppState = (chatJid) => ({
   active: true,
   chatJid,
   interactionMode: 'conversation',
   activeLanguage: '',
   studiedLanguages: [],
   currentCourse: '',
   enrolledCourses: [],
   courseProgress: {},
   reminders: [],
   lastInteractionAt: new Date().toISOString()
})

const ensureWhatsAppState = (learner, chatJid) => {
   learner.whatsappLearning = {
      ...defaultWhatsAppState(chatJid),
      ...(learner.whatsappLearning ?? {}),
      chatJid
   }
   learner.whatsappLearning.enrolledCourses = Array.isArray(learner.whatsappLearning.enrolledCourses)
      ? learner.whatsappLearning.enrolledCourses
      : []
   learner.whatsappLearning.studiedLanguages = Array.isArray(learner.whatsappLearning.studiedLanguages)
      ? learner.whatsappLearning.studiedLanguages
      : []
   learner.whatsappLearning.reminders = Array.isArray(learner.whatsappLearning.reminders)
      ? learner.whatsappLearning.reminders
      : []
   learner.whatsappLearning.courseProgress = learner.whatsappLearning.courseProgress && typeof learner.whatsappLearning.courseProgress === 'object'
      ? learner.whatsappLearning.courseProgress
      : {}
   return learner.whatsappLearning
}

const getServices = async () => {
   if (runtime.servicesPromise) return runtime.servicesPromise

   runtime.servicesPromise = (async () => {
      const config = getConfig({ envFile: join(RO_LANG_DIR, '.env') })
      if (!config.mongodbUri && !isAbsolute(config.memoryFile))
         config.memoryFile = resolve(RO_LANG_DIR, config.memoryFile)

      const store = await createMemoryStore(config)
      const memory = new LearningMemory(store)
      let tutor = null

      return {
         config,
         store,
         memory,
         getTutor() {
            tutor ??= new LanguageTutor(new OpenAICompatibleClient(config), { memory })
            return tutor
         }
      }
   })().catch(error => {
      runtime.servicesPromise = null
      throw error
   })

   return runtime.servicesPromise
}

const withSessionLock = async (sessionId, task) => {
   const previous = runtime.queues.get(sessionId) ?? Promise.resolve()
   const current = previous.catch(() => {}).then(task)
   runtime.queues.set(sessionId, current)
   try {
      return await current
   }
   finally {
      if (runtime.queues.get(sessionId) === current)
         runtime.queues.delete(sessionId)
   }
}

const initializeSession = async (m) => {
   const services = await getServices()
   const sessionId = sessionIdFor(m)
   let learner = await services.memory.getLearner(sessionId)
   if (!learner) {
      learner = await services.memory.initializeLearner({
         userId: sessionId,
         targetLanguage: 'Undetermined',
         nativeLanguage: 'Indonesian',
         level: 'beginner'
      })
   }
   const state = ensureWhatsAppState(learner, m.chat)
   state.active = true
   state.lastInteractionAt = new Date().toISOString()
   await services.memory.save(learner)
   runtime.knownSessionIds.add(sessionId)
   return { ...services, learner, state, sessionId }
}

const getActiveSession = async (m) => {
   const services = await getServices()
   const sessionId = sessionIdFor(m)
   const learner = await services.memory.getLearner(sessionId)
   if (!learner?.whatsappLearning?.active) return null
   const state = ensureWhatsAppState(learner, m.chat)
   runtime.knownSessionIds.add(sessionId)
   return { ...services, learner, state, sessionId }
}

const plainTable = (rows = []) => rows
   .map(row => row.map(cell => truncate(cell, 55)).join(' | '))
   .join('\n')

const jsonForHtml = value => JSON.stringify(value)
   .replace(/</g, '\\u003c')
   .replace(/>/g, '\\u003e')
   .replace(/&/g, '\\u0026')
   .replace(/\u2028/g, '\\u2028')
   .replace(/\u2029/g, '\\u2029')

const renderQuickActions = suggestions => {
   const actions = [...new Set(suggestions
      .map(value => String(value ?? '').trim())
      .filter(Boolean))]
      .slice(0, 6)
   if (!actions.length) return null

   const html = `<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<style>
:root{color-scheme:light dark;--bg:#f4f7fb;--card:#fff;--ink:#172033;--muted:#667085;--accent:#6c4cff;--line:#dbe2ee}
*{box-sizing:border-box}body{margin:0;padding:14px;background:var(--bg);color:var(--ink);font:14px/1.4 system-ui,-apple-system,sans-serif}
h2{font-size:17px;margin:0 0 4px}.hint{color:var(--muted);margin:0 0 10px}.actions{display:grid;gap:8px}
button{width:100%;border:1px solid var(--line);border-radius:12px;padding:11px 12px;background:var(--card);color:var(--ink);font:inherit;font-weight:650;text-align:left}
button:active,button.active{border-color:var(--accent);background:#6c4cff18}.selected{display:none;margin-top:10px;padding:11px;border-radius:12px;background:var(--card);border:1px solid var(--line)}
.selected.show{display:block}.label{color:var(--muted);font-size:12px;margin-bottom:3px}.value{font-weight:700;overflow-wrap:anywhere}
@media(prefers-color-scheme:dark){:root{--bg:#11151e;--card:#1c2230;--ink:#f5f7fb;--muted:#aab4c5;--line:#343e50}}
</style>
</head>
<body>
<h2>Pilihan cepat</h2>
<p class="hint">Ketuk satu pilihan, lalu kirim kalimat yang tampil melalui chat WhatsApp.</p>
<main class="actions" id="actions"></main>
<section class="selected" id="selected"><div class="label">Balas di chat dengan:</div><div class="value" id="value"></div></section>
<script>
const ACTIONS=${jsonForHtml(actions)};
const list=document.getElementById('actions');
const selected=document.getElementById('selected');
const value=document.getElementById('value');
ACTIONS.forEach(action=>{const button=document.createElement('button');button.type='button';button.textContent=action;button.onclick=()=>{list.querySelectorAll('button').forEach(node=>node.classList.remove('active'));button.classList.add('active');value.textContent=action;selected.classList.add('show')};list.append(button)});
</script>
</body>
</html>`

   return {
      html,
      height: Math.min(520, 155 + actions.length * 53)
   }
}

const isOwnMessage = (m, sock) => {
   if (m?.fromMe === true || m?.isMe === true || m?.key?.fromMe === true) return true

   const ownIds = new Set([
      sock?.user?.id,
      sock?.user?.decodedId,
      sock?.user?.decodedLid
   ].filter(Boolean).map(String))

   return [m?.sender, m?.senderLid]
      .filter(Boolean)
      .some(sender => ownIds.has(String(sender)))
}

const sendRich = async (sock, jid, {
   title = 'ROCKY Learn',
   text = '',
   table = [],
   suggestions = [],
   html = '',
   htmlHeight,
   footer = 'AI Learning · ro-lang',
   quoted
} = {}) => {
   const normalizedTable = table
      .slice(0, MAX_TABLE_ROWS)
      .map(row => row.map(cell => truncate(cell)))
   const quickActions = renderQuickActions(suggestions)

   try {
      const rich = new MB.AIRich(sock)
         .setTitle(title)
         .setFooter(footer)

      if (text) rich.addText(String(text).slice(0, 12_000))
      if (normalizedTable.length) rich.addTable(normalizedTable)
      if (html && typeof MB.htmlSection === 'function')
         rich.addSection(MB.htmlSection(String(html), htmlHeight ? { height: htmlHeight } : {}))
      if (quickActions && typeof MB.htmlSection === 'function')
         rich.addSection(MB.htmlSection(quickActions.html, { height: quickActions.height }))
      else if (suggestions.length)
         rich.addText(`Pilihan: ${suggestions.slice(0, 6).join(' · ')}`)
      return await rich.send(jid, quoted ? { quoted } : {})
   }
   catch (error) {
      console.error('[ROCKY Learn] AIRich fallback:', error.message)
      const fallback = [
         `*${title}*`,
         text,
         normalizedTable.length ? plainTable(normalizedTable) : '',
         suggestions.length ? `Pilihan: ${suggestions.join(' · ')}` : '',
         footer
      ].filter(Boolean).join('\n\n')
      return sock.sendMessage(jid, { text: fallback }, quoted ? { quoted } : {})
   }
}

const sendPlain = (sock, jid, text, quoted) => sock.sendMessage(
   jid,
   { text: String(text).slice(0, 12_000) },
   quoted ? { quoted } : {}
)

const profileTable = learner => [
   ['Profil', 'Nilai'],
   ['Bahasa target', learner.profile.targetLanguage],
   ['Bahasa utama', learner.profile.nativeLanguage],
   ['Level', learner.profile.estimatedLevel],
   ['Target', learner.profile.goals.join(', ') || '-'],
   ['Minat', learner.profile.interests.join(', ') || '-']
]

const progressTable = progress => [
   ['Progress', 'Nilai'],
   ['Level', progress.profile.estimatedLevel],
   ['Skor', `${progress.progress.proficiencyScore}/100`],
   ['Pelajaran', progress.progress.lessonsCompleted],
   ['Latihan', progress.progress.practicesCompleted],
   ['Jawaban dinilai', progress.progress.answersReviewed],
   ['Percakapan', progress.progress.conversationsCompleted],
   ['Confidence asesmen', `${Math.round((progress.assessment?.confidence ?? 0) * 100)}%`],
   ['Bahasa dipelajari', progress.studiedLanguages?.map(item => item.language).join(', ') || progress.profile.targetLanguage],
   ['Kosakata', progress.vocabulary.total],
   ['Review jatuh tempo', progress.vocabulary.due],
   ['Dikuasai', progress.vocabulary.mastered]
]

const mainMenu = async (m, sock, session) => {
   const progress = await session.memory.getProgress(session.sessionId)
   const course = session.state.activeLanguage || progress.profile.targetLanguage || 'Belum ditentukan'
   return sendRich(sock, m.chat, {
      title: 'ROCKY Learn · Personal Tutor',
      text: [
         `Sesi belajar khusus chat ini aktif untuk *${m.pushName || 'Owner'}*.`,
         `Kursus aktif: *${course}*. Semua profil, kosakata, level, dan riwayat dipisahkan berdasarkan chat.`,
         '',
         'Sekarang cukup bicara secara alami. Ceritakan bahasa yang ingin dipelajari, jawab pertanyaan tutor, atau tanyakan apa yang sebaiknya dipelajari hari ini.'
      ].join('\n'),
      table: progressTable(progress),
      suggestions: ['Apa yang kita pelajari hari ini?', 'Beri saya latihan singkat', 'Bagaimana progres saya?', 'Ayo lanjutkan'],
      quoted: m
   })
}

const helpMessage = async (m, sock) => sendRich(sock, m.chat, {
   title: 'ROCKY Learn · Panduan',
   text: 'Tidak ada format wajib. Setelah *.rockylearn* aktif, berbicaralah seperti dengan guru manusia. Tutor akan mengenali bahasa, menilai kemampuan secara bertahap, mengoreksi jawaban, dan memilih pelajaran berikutnya. Perintah teknis di bawah tetap tersedia untuk pengelolaan.',
   table: [
      ['Tujuan', 'Contoh alami'],
      ['Mulai bahasa', 'Aku ingin belajar bahasa Jepang untuk kerja'],
      ['Lanjut belajar', 'Apa yang kita pelajari hari ini?'],
      ['Minta latihan', 'Uji kosakata saya'],
      ['Lihat kemajuan', 'Bagaimana progres saya?'],
      ['Ganti bahasa', 'Sekarang bantu aku belajar Spanyol'],
      ['Review jatuh tempo', 'vocab due'],
      ['remind learn', 'remind learn 20:00'],
      ['remind vocab', 'remind vocab 19:00'],
      ['alarm', 'alarm 2026-11-06 07:00 | Mulai lesson'],
      ['cancel', 'cancel <id>'],
      ['stop', 'stop']
   ],
   suggestions: ['Apa yang kita pelajari hari ini?', 'Uji kemampuan saya', 'Bagaimana progres saya?'],
   quoted: m
})

const pontianakParts = (date = new Date()) => {
   const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: TIME_ZONE,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hourCycle: 'h23'
   }).formatToParts(date)
   return Object.fromEntries(parts.filter(part => part.type !== 'literal').map(part => [part.type, Number(part.value)]))
}

const nextDailyAt = (time, from = new Date()) => {
   const match = String(time).match(/^([01]?\d|2[0-3]):([0-5]\d)$/)
   if (!match) throw new Error('Waktu harus menggunakan format HH:mm, misalnya 19:30.')
   const local = pontianakParts(from)
   let timestamp = Date.UTC(
      local.year,
      local.month - 1,
      local.day,
      Number(match[1]) - TIME_ZONE_OFFSET_HOURS,
      Number(match[2])
   )
   if (timestamp <= from.getTime()) timestamp += 24 * 60 * 60 * 1000
   return new Date(timestamp)
}

const parseAlarmAt = value => {
   const match = String(value).trim().match(/^(\d{4})-(\d{2})-(\d{2})\s+([01]?\d|2[0-3]):([0-5]\d)$/)
   if (!match) throw new Error('Alarm harus menggunakan format YYYY-MM-DD HH:mm.')
   const [, year, month, day, hour, minute] = match
   const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour) - TIME_ZONE_OFFSET_HOURS, Number(minute)))
   const parsed = pontianakParts(date)
   if (
      parsed.year !== Number(year) || parsed.month !== Number(month) || parsed.day !== Number(day) ||
      parsed.hour !== Number(hour) || parsed.minute !== Number(minute)
   ) throw new Error('Tanggal alarm tidak valid.')
   if (date.getTime() <= Date.now()) throw new Error('Waktu alarm harus berada di masa depan.')
   return date
}

const formatLocalTime = value => new Intl.DateTimeFormat('id-ID', {
   timeZone: TIME_ZONE,
   dateStyle: 'medium',
   timeStyle: 'short'
}).format(new Date(value))

const createReminderId = () => Math.random().toString(36).slice(2, 8).toUpperCase()

const saveReminder = async (session, reminder) => {
   const learner = await session.memory.getLearner(session.sessionId)
   const state = ensureWhatsAppState(learner, session.state.chatJid)
   state.reminders.push(reminder)
   await session.memory.save(learner)
   session.learner = learner
   session.state = state
}

const addDailyReminder = async (m, sock, session, type, time) => {
   const nextAt = nextDailyAt(time)
   const reminder = {
      id: createReminderId(),
      type,
      label: type === 'vocabulary' ? 'Review kosakata' : 'Sesi belajar',
      repeat: 'daily',
      time,
      nextAt: nextAt.toISOString(),
      enabled: true,
      createdAt: new Date().toISOString()
   }
   await saveReminder(session, reminder)
   return sendRich(sock, m.chat, {
      title: 'ROCKY Learn · Reminder Tersimpan',
      text: `Reminder *${reminder.label}* akan dikirim setiap hari pukul *${time}* (${TIME_ZONE}).`,
      table: [['ID', 'Jadwal berikutnya'], [reminder.id, formatLocalTime(reminder.nextAt)]],
      suggestions: ['reminders', 'lesson', 'vocab due'],
      quoted: m
   })
}

const addAlarm = async (m, sock, session, input) => {
   const [dateTime, ...messageParts] = input.split('|')
   const message = messageParts.join('|').trim()
   if (!message) throw new Error('Tambahkan pesan alarm setelah tanda |.')
   const at = parseAlarmAt(dateTime)
   const reminder = {
      id: createReminderId(),
      type: 'alarm',
      label: message,
      repeat: 'once',
      nextAt: at.toISOString(),
      enabled: true,
      createdAt: new Date().toISOString()
   }
   await saveReminder(session, reminder)
   return sendRich(sock, m.chat, {
      title: 'ROCKY Learn · Alarm Aktif',
      text: message,
      table: [['ID', 'Waktu'], [reminder.id, formatLocalTime(reminder.nextAt)]],
      suggestions: ['reminders', 'progress'],
      quoted: m
   })
}

const listReminders = async (m, sock, session) => {
   const learner = await session.memory.getLearner(session.sessionId)
   const state = ensureWhatsAppState(learner, m.chat)
   const reminders = state.reminders.filter(reminder => reminder.enabled)
   return sendRich(sock, m.chat, {
      title: 'ROCKY Learn · Reminder & Alarm',
      text: reminders.length ? 'Jadwal aktif untuk sesi chat ini.' : 'Belum ada reminder aktif.',
      table: reminders.length
         ? [['ID', 'Aktivitas', 'Berikutnya'], ...reminders.map(item => [item.id, item.label, formatLocalTime(item.nextAt)])]
         : [['Status', 'Kosong']],
      suggestions: ['remind learn 20:00', 'remind vocab 19:00', 'help'],
      quoted: m
   })
}

const cancelReminder = async (m, sock, session, id) => {
   if (!id) throw new Error('Masukkan ID reminder yang akan dibatalkan.')
   const learner = await session.memory.getLearner(session.sessionId)
   const state = ensureWhatsAppState(learner, m.chat)
   const reminder = state.reminders.find(item => item.id.toLowerCase() === id.trim().toLowerCase() && item.enabled)
   if (!reminder) throw new Error(`Reminder dengan ID ${id} tidak ditemukan.`)
   reminder.enabled = false
   reminder.cancelledAt = new Date().toISOString()
   await session.memory.save(learner)
   return sendRich(sock, m.chat, {
      title: 'ROCKY Learn · Reminder Dibatalkan',
      text: `Reminder *${reminder.label}* (${reminder.id}) telah dinonaktifkan.`,
      suggestions: ['reminders', 'help'],
      quoted: m
   })
}

const updateProfile = async (m, sock, session, input) => {
   if (!input) {
      const learner = await session.memory.getLearner(session.sessionId)
      return sendRich(sock, m.chat, {
         title: 'ROCKY Learn · Profil',
         text: 'Profil personal untuk sesi chat ini.',
         table: profileTable(learner),
         suggestions: ['lesson', 'progress', 'help'],
         quoted: m
      })
   }

   const values = input.split('|').map(value => value.trim())
   const targetLanguage = values[0]
   const nativeLanguage = values[1] || session.learner.profile.nativeLanguage
   const level = values[2] || ''
   const goals = values.length >= 4 ? values[3] : undefined
   const interests = values.length >= 5 ? values[4] : undefined
   if (!targetLanguage) throw new Error('Bahasa target wajib diisi.')
   const levelPreset = level ? LEVEL_PRESETS[level.toLowerCase()] : null
   if (level && !levelPreset)
      throw new Error('Level harus beginner/A1, A2, B1, B2, C1, atau C2.')

   await session.memory.initializeLearner({
      userId: session.sessionId,
      targetLanguage,
      nativeLanguage,
      level,
      goals,
      interests
   })
   const learner = await session.memory.getLearner(session.sessionId)
   ensureWhatsAppState(learner, m.chat).active = true
   if (levelPreset) {
      const [estimatedLevel, score] = levelPreset
      learner.profile.declaredLevel = level
      learner.profile.estimatedLevel = estimatedLevel
      learner.progress.proficiencyScore = score
      for (const skill of Object.keys(learner.progress.skillScores))
         learner.progress.skillScores[skill] = score
   }
   await session.memory.save(learner)
   session.learner = learner

   return sendRich(sock, m.chat, {
      title: 'ROCKY Learn · Profil Diperbarui',
      text: 'Tutor akan menyesuaikan kurikulum, tingkat kesulitan, dan contoh berdasarkan profil ini.',
      table: profileTable(learner),
      suggestions: ['lesson', 'practice', 'progress'],
      quoted: m
   })
}

const setCourse = async (m, sock, session, courseName) => {
   const learner = await session.memory.getLearner(session.sessionId)
   const state = ensureWhatsAppState(learner, m.chat)
   if (courseName) {
      state.currentCourse = courseName.trim()
      if (!state.enrolledCourses.some(course => course.toLowerCase() === state.currentCourse.toLowerCase()))
         state.enrolledCourses.push(state.currentCourse)
      state.courseProgress[state.currentCourse] ??= {
         lessonsCompleted: 0,
         topics: [],
         startedAt: new Date().toISOString(),
         lastLessonAt: null
      }
      await session.memory.save(learner)
   }

   return sendRich(sock, m.chat, {
      title: 'ROCKY Learn · Kursus',
      text: state.currentCourse
         ? `Kursus aktif: *${state.currentCourse}*.`
         : 'Belum ada kursus khusus. Tutor menggunakan kurikulum adaptif ro-lang.',
      table: state.enrolledCourses.length
         ? [['Kursus', 'Lesson', 'Status'], ...state.enrolledCourses.map(course => [
            course,
            state.courseProgress[course]?.lessonsCompleted ?? 0,
            course === state.currentCourse ? 'Aktif' : 'Terdaftar'
         ])]
         : [['Kursus', 'Kurikulum adaptif']],
      suggestions: ['lesson', 'progress', 'help'],
      quoted: m
   })
}

const createLesson = async (m, sock, session, topic) => {
   const learner = await session.memory.getLearner(session.sessionId)
   const state = ensureWhatsAppState(learner, m.chat)
   const selectedTopic = topic || state.currentCourse || undefined
   const lesson = await session.getTutor().createLesson({
      userId: session.sessionId,
      targetLanguage: learner.profile.targetLanguage,
      nativeLanguage: learner.profile.nativeLanguage,
      level: learner.profile.estimatedLevel,
      topic: selectedTopic,
      goals: learner.profile.goals,
      interests: learner.profile.interests
   })

   const updated = await session.memory.getLearner(session.sessionId)
   const updatedState = ensureWhatsAppState(updated, m.chat)
   const latestLesson = [...updated.history].reverse().find(event => event.type === 'lesson_completed')
   if (latestLesson?.topic) {
      const courseName = updatedState.currentCourse || 'Adaptive Curriculum'
      if (!updatedState.enrolledCourses.some(course => course.toLowerCase() === courseName.toLowerCase()))
         updatedState.enrolledCourses.push(courseName)
      updatedState.courseProgress[courseName] ??= {
         lessonsCompleted: 0,
         topics: [],
         startedAt: new Date().toISOString(),
         lastLessonAt: null
      }
      const course = updatedState.courseProgress[courseName]
      course.lessonsCompleted += 1
      course.lastLessonAt = new Date().toISOString()
      if (!course.topics.some(topicName => topicName.toLowerCase() === latestLesson.topic.toLowerCase()))
         course.topics.push(latestLesson.topic)
   }
   await session.memory.save(updated)
   const progress = await session.memory.getProgress(session.sessionId)

   return sendRich(sock, m.chat, {
      title: 'ROCKY Learn · Lesson',
      text: lesson,
      table: [
         ['Progress sesi', 'Nilai'],
         ['Topik', latestLesson?.topic || selectedTopic || 'Adaptif'],
         ['Level', progress.profile.estimatedLevel],
         ['Pelajaran selesai', progress.progress.lessonsCompleted],
         ['Total kosakata', progress.vocabulary.total]
      ],
      suggestions: ['practice', 'progress', 'vocab due'],
      quoted: m
   })
}

const createPractice = async (m, sock, session, focus) => {
   const learner = await session.memory.getLearner(session.sessionId)
   const result = await session.getTutor().createPractice({
      userId: session.sessionId,
      targetLanguage: learner.profile.targetLanguage,
      nativeLanguage: learner.profile.nativeLanguage,
      level: learner.profile.estimatedLevel,
      focus: focus || session.state.currentCourse || 'mixed skills'
   })
   return sendRich(sock, m.chat, {
      title: 'ROCKY Learn · Practice',
      text: result,
      table: [['Cara menjawab', 'answer <pertanyaan> | <jawaban Anda>']],
      suggestions: ['progress', 'vocab due', 'lesson'],
      quoted: m
   })
}

const reviewAnswer = async (m, sock, session, input) => {
   const [question, ...answerParts] = input.split('|')
   const answer = answerParts.join('|').trim()
   if (!question?.trim() || !answer) throw new Error('Gunakan: answer <pertanyaan> | <jawaban Anda>.')
   const learner = await session.memory.getLearner(session.sessionId)
   const result = await session.getTutor().reviewAnswer({
      userId: session.sessionId,
      targetLanguage: learner.profile.targetLanguage,
      nativeLanguage: learner.profile.nativeLanguage,
      level: learner.profile.estimatedLevel,
      question: question.trim(),
      answer
   })
   const progress = await session.memory.getProgress(session.sessionId)
   return sendRich(sock, m.chat, {
      title: 'ROCKY Learn · Answer Review',
      text: result,
      table: [
         ['Proficiency', 'Nilai'],
         ['Level terbaru', progress.profile.estimatedLevel],
         ['Skor kemampuan', `${progress.progress.proficiencyScore}/100`],
         ['Jawaban dinilai', progress.progress.answersReviewed]
      ],
      suggestions: ['practice', 'lesson', 'progress'],
      quoted: m
   })
}

const conversationHistory = learner => learner.history
   .filter(event => ['conversation_turn', 'tutor_turn'].includes(event.type) && event.message && event.reply)
   .filter(event => !event.languageKey || event.languageKey === learner.activeLanguageKey)
   .slice(-6)
   .flatMap(event => [
      { role: 'user', content: event.message },
      { role: 'assistant', content: event.reply }
   ])

const sendTutorTurn = async (sock, jid, turn, learner, quoted) => {
   const component = renderLearningComponent(turn.activity)
   const language = learner.profile.targetLanguage === 'Undetermined'
      ? 'Personal Tutor'
      : learner.profile.targetLanguage
   const replyPrompt = turn.activity?.replyPrompt
   const responseText = [
      turn.reply,
      replyPrompt && !turn.reply.includes(replyPrompt) ? replyPrompt : ''
   ].filter(Boolean).join('\n\n')

   if (!component)
      return sendPlain(sock, jid, responseText, quoted)

   const useHtml = turn.activity.type !== 'table'
   return sendRich(sock, jid, {
      title: `ROCKY Learn · ${component.label || language}`,
      text: responseText,
      table: component.table,
      html: useHtml ? component.html : '',
      htmlHeight: component.height,
      suggestions: turn.quickReplies,
      quoted
   })
}

const runTutorTurn = async (m, sock, session, { message = '', event = 'message' } = {}) => {
   const learner = await session.memory.getLearner(session.sessionId)
   const turn = await session.getTutor().converse({
      userId: session.sessionId,
      targetLanguage: learner.profile.targetLanguage,
      nativeLanguage: learner.profile.nativeLanguage,
      level: learner.profile.estimatedLevel,
      history: conversationHistory(learner),
      message,
      event
   })
   const updated = await session.memory.getLearner(session.sessionId)
   const state = ensureWhatsAppState(updated, m.chat)
   state.activeLanguage = updated.profile.targetLanguage
   state.studiedLanguages = Object.values(updated.courses)
      .filter(course => course.language !== 'Undetermined')
      .map(course => course.language)
   state.lastInteractionAt = new Date().toISOString()
   await session.memory.save(updated)
   return sendTutorTurn(sock, m.chat, turn, updated, m)
}

const startConversation = (m, sock, session) => runTutorTurn(m, sock, session, {
   event: 'session_start'
})

const continueConversation = (m, sock, session, message) => runTutorTurn(m, sock, session, {
   message,
   event: 'message'
})

const showProgress = async (m, sock, session) => {
   const progress = await session.memory.getProgress(session.sessionId)
   const learner = await session.memory.getLearner(session.sessionId)
   const state = ensureWhatsAppState(learner, m.chat)
   const weaknesses = progress.progress.weaknesses
      .sort((a, b) => b.count - a.count)
      .slice(0, 3)
      .map(item => item.name)
      .join(', ') || '-'
   return sendRich(sock, m.chat, {
      title: 'ROCKY Learn · Learning Progress',
      text: `Bahasa aktif: *${state.activeLanguage || progress.profile.targetLanguage}*\nFokus perbaikan: ${weaknesses}`,
      table: progressTable(progress),
      suggestions: ['Apa langkah berikutnya?', 'Uji kelemahan saya', 'Ayo lanjutkan'],
      quoted: m
   })
}

const showVocabulary = async (m, sock, session, dueOnly = false) => {
   const words = await session.memory.listVocabulary(session.sessionId, { dueOnly })
   return sendRich(sock, m.chat, {
      title: dueOnly ? 'ROCKY Learn · Vocabulary Review' : 'ROCKY Learn · Vocabulary',
      text: words.length
         ? `${words.length} kosakata ${dueOnly ? 'siap direview' : 'tersimpan'} untuk sesi ini.`
         : dueOnly ? 'Tidak ada kosakata yang jatuh tempo.' : 'Kosakata masih kosong. Mulai sebuah lesson untuk menambah kata otomatis.',
      table: words.length
         ? [['Kata', 'Arti', 'Daftar', 'Review'], ...words.slice(0, MAX_TABLE_ROWS - 1).map(word => [word.word, word.translation, word.list, formatLocalTime(word.nextReviewAt)])]
         : [['Status', 'Kosong']],
      suggestions: ['Uji kosakata saya', 'Pakai kata-kata ini dalam percakapan', 'Apa langkah berikutnya?'],
      quoted: m
   })
}

const addVocabulary = async (m, sock, session, input) => {
   const [word, translation, example = '', list = 'general'] = input.split('|').map(value => value.trim())
   if (!word || !translation) throw new Error('Gunakan: vocab add <kata> | <arti> | <contoh> | <daftar>.')
   const item = await session.memory.addVocabulary(session.sessionId, { word, translation, example, list })
   return sendRich(sock, m.chat, {
      title: 'ROCKY Learn · Vocabulary Added',
      text: item.example || 'Kosakata baru disimpan ke memory personal.',
      table: [['Kata', 'Arti', 'Daftar'], [item.word, item.translation, item.list]],
      suggestions: ['vocab', 'vocab due', 'lesson'],
      quoted: m
   })
}

const reviewVocabulary = async (m, sock, session, input) => {
   const [word, qualityText] = input.split('|').map(value => value.trim())
   const quality = Number(qualityText)
   if (!word || !Number.isInteger(quality) || quality < 0 || quality > 5)
      throw new Error('Gunakan: vocab review <kata> | <nilai 0-5>.')
   const item = await session.memory.reviewVocabulary(session.sessionId, word, quality)
   return sendRich(sock, m.chat, {
      title: 'ROCKY Learn · Vocabulary Reviewed',
      text: `Hasil review *${item.word}* tersimpan. Jadwal berikutnya telah disesuaikan otomatis.`,
      table: [['Nilai', 'Status', 'Review berikutnya'], [quality, item.status, formatLocalTime(item.nextReviewAt)]],
      suggestions: ['vocab due', 'practice', 'progress'],
      quoted: m
   })
}

const stopSession = async (m, sock, session) => {
   const learner = await session.memory.getLearner(session.sessionId)
   const state = ensureWhatsAppState(learner, m.chat)
   state.active = false
   state.lastInteractionAt = new Date().toISOString()
   await session.memory.save(learner)
   return sendRich(sock, m.chat, {
      title: 'ROCKY Learn · Session Closed',
      text: 'Sesi dihentikan. Progress, kosakata, level, riwayat, dan reminder tetap tersimpan. Mulai lagi dengan *.rockylearn*.',
      table: [['Penyimpanan', 'Tersimpan'], ['Mulai kembali', '.rockylearn']],
      quoted: m
   })
}

const stripPrefix = input => String(input ?? '').trim()

const handleLearningInput = async (m, context, session, rawInput) => {
   const { sock } = context
   const input = stripPrefix(rawInput)
   if (!input) return startConversation(m, sock, session)
   if (/^(menu|dashboard)$/i.test(input)) return mainMenu(m, sock, session)
   if (/^(help|bantuan)$/i.test(input)) return helpMessage(m, sock)
   if (/^progress$/i.test(input)) return showProgress(m, sock, session)
   if (/^vocab\s+add\s+/i.test(input)) return addVocabulary(m, sock, session, input.replace(/^vocab\s+add\s+/i, ''))
   if (/^vocab\s+review\s+/i.test(input)) return reviewVocabulary(m, sock, session, input.replace(/^vocab\s+review\s+/i, ''))
   if (/^vocab(?:\s+list)?$/i.test(input)) return showVocabulary(m, sock, session, false)
   if (/^vocab\s+due$/i.test(input)) return showVocabulary(m, sock, session, true)
   if (/^remind\s+learn\s+/i.test(input)) return addDailyReminder(m, sock, session, 'learning', input.replace(/^remind\s+learn\s+/i, '').trim())
   if (/^remind\s+vocab\s+/i.test(input)) return addDailyReminder(m, sock, session, 'vocabulary', input.replace(/^remind\s+vocab\s+/i, '').trim())
   if (/^alarm\s+/i.test(input)) return addAlarm(m, sock, session, input.replace(/^alarm\s+/i, ''))
   if (/^reminders$/i.test(input)) return listReminders(m, sock, session)
   if (/^cancel\s+/i.test(input)) return cancelReminder(m, sock, session, input.replace(/^cancel\s+/i, ''))
   if (/^(stop|end|quit)$/i.test(input)) return stopSession(m, sock, session)
   const naturalInput = input.replace(/^chat\s+/i, '')
   return continueConversation(m, sock, session, naturalInput)
}

const reportError = async (m, sock, error) => {
   console.error('[ROCKY Learn]', error)
   return sendRich(sock, m.chat, {
      title: 'ROCKY Learn · Error',
      text: error.message || String(error),
      table: [['Bantuan', 'Ketik help untuk melihat panduan percakapan']],
      suggestions: ['help', 'Coba lanjutkan pelajaran saya'],
      quoted: m
   })
}

const allReminderLearners = async services => {
   const learners = new Map()

   if (typeof services.store.readState === 'function') {
      const state = await services.store.readState()
      for (const learner of Object.values(state.learners ?? {}))
         if (learner?.id) learners.set(learner.id, learner)
   }
   else if (services.store.collection) {
      const documents = await services.store.collection
         .find({ 'whatsappLearning.reminders.enabled': true })
         .toArray()
      for (const { _id, ...learner } of documents)
         learners.set(String(_id), { id: String(_id), ...learner })
   }

   for (const sessionId of runtime.knownSessionIds) {
      if (learners.has(sessionId)) continue
      const learner = await services.memory.getLearner(sessionId)
      if (learner) learners.set(sessionId, learner)
   }
   return [...learners.values()]
}

const triggerReminder = async (services, learner, reminder) => {
   const key = `${learner.id}:${reminder.id}`
   if (runtime.processingReminders.has(key)) return
   runtime.processingReminders.add(key)

   try {
      const latest = await services.memory.getLearner(learner.id)
      if (!latest) return
      const state = ensureWhatsAppState(latest, latest.whatsappLearning?.chatJid)
      const current = state.reminders.find(item => item.id === reminder.id)
      if (!current?.enabled || new Date(current.nextAt).getTime() > Date.now()) return

      if (current.type === 'vocabulary') {
         const dueWords = await services.memory.listVocabulary(latest.id, { dueOnly: true })
         if (dueWords.length) {
            await sendRich(runtime.sock, state.chatJid, {
               title: 'ROCKY Learn · Vocabulary Alarm',
               text: `${dueWords.length} kosakata siap untuk spaced-repetition review.`,
               table: [['Kata', 'Arti', 'Daftar'], ...dueWords.slice(0, MAX_TABLE_ROWS - 1).map(item => [item.word, item.translation, item.list])],
               suggestions: ['vocab due', 'practice']
            })
         }
      }
      else {
         if (current.type === 'alarm') {
            await sendRich(runtime.sock, state.chatJid, {
               title: 'ROCKY Learn · Alarm',
               text: current.label,
               table: [['Aktivitas', current.label], ['Waktu', formatLocalTime(current.nextAt)]]
            })
         }
         else {
            const turn = await services.getTutor().converse({
               userId: latest.id,
               targetLanguage: latest.profile.targetLanguage,
               nativeLanguage: latest.profile.nativeLanguage,
               level: latest.profile.estimatedLevel,
               history: conversationHistory(latest),
               event: 'reminder'
            })
            const refreshed = await services.memory.getLearner(latest.id)
            await sendTutorTurn(runtime.sock, state.chatJid, turn, refreshed)
         }
      }

      const updatedLearner = await services.memory.getLearner(latest.id)
      const updatedState = ensureWhatsAppState(updatedLearner, state.chatJid)
      updatedState.activeLanguage = updatedLearner.profile.targetLanguage
      updatedState.studiedLanguages = Object.values(updatedLearner.courses)
         .filter(course => course.language !== 'Undetermined')
         .map(course => course.language)
      const updatedReminder = updatedState.reminders.find(item => item.id === current.id)
      if (!updatedReminder) return
      if (current.type === 'learning') updatedState.active = true
      updatedReminder.lastTriggeredAt = new Date().toISOString()
      if (updatedReminder.repeat === 'daily')
         updatedReminder.nextAt = nextDailyAt(updatedReminder.time, new Date()).toISOString()
      else {
         updatedReminder.enabled = false
         updatedReminder.completedAt = new Date().toISOString()
      }
      await services.memory.save(updatedLearner)
   }
   finally {
      runtime.processingReminders.delete(key)
   }
}

const schedulerTick = async () => {
   if (!runtime.sock || runtime.schedulerRunning) return
   runtime.schedulerRunning = true
   try {
      const services = await getServices()
      const learners = await allReminderLearners(services)
      const now = Date.now()
      for (const learner of learners) {
         const state = learner.whatsappLearning
         if (!state?.chatJid) continue
         for (const reminder of state.reminders ?? []) {
            if (!reminder.enabled || !reminder.nextAt) continue
            if (new Date(reminder.nextAt).getTime() <= now)
               await withSessionLock(learner.id, () => triggerReminder(services, learner, reminder))
         }
      }
   }
   catch (error) {
      console.error('[ROCKY Learn] Scheduler:', error)
   }
   finally {
      runtime.schedulerRunning = false
   }
}

if (runtime.timer) clearInterval(runtime.timer)
runtime.timer = setInterval(schedulerTick, SCHEDULER_INTERVAL_MS)
runtime.timer.unref?.()

const commandHandler = {
   command: 'rockylearn',
   category: 'ai',
   owner: true,
   async run(m, context) {
      runtime.sock = context.sock
      const sessionId = sessionIdFor(m)
      try {
         await withSessionLock(sessionId, async () => {
            const session = await initializeSession(m)
            await handleLearningInput(m, context, session, context.text)
         })
      }
      catch (error) {
         await reportError(m, context.sock, error)
      }
   }
}

// Keep the scheduler connected to the newest socket after an owner reconnect.
// This handler exposes no learning action and stores no learner data.
const socketBinder = {
   owner: true,
   onConnect(sock) { runtime.sock = sock },
   onDisconnect(sock) { if (runtime.sock === sock) runtime.sock = null },
   async run(_m, context) {
      runtime.sock = context.sock
   }
}

const conversationHandler = {
   owner: true,
   async run(m, context) {
      // AIRich emits bot-owned messages (and sometimes a protocol edit). Never
      // feed either back into the active tutor session or it will answer itself.
      if (isOwnMessage(m, context.sock)) return
      if (typeof context.body !== 'string' || !context.body.trim()) return
      runtime.sock = context.sock
      const sessionId = sessionIdFor(m)
      try {
         const session = await getActiveSession(m)
         if (!session) return
         await withSessionLock(sessionId, async () => {
            const latestSession = await getActiveSession(m)
            if (!latestSession) return
            latestSession.state.lastInteractionAt = new Date().toISOString()
            await latestSession.memory.save(latestSession.learner)
            await handleLearningInput(m, context, latestSession, context.body)
         })
      }
      catch (error) {
         await reportError(m, context.sock, error)
      }
   }
}

export default [commandHandler, socketBinder, conversationHandler]
