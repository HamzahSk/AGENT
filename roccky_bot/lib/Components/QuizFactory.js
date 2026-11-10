import { reportError } from '../Runtime.js'

import { readFile } from 'fs/promises'
import { join } from 'path'

import { CONSONANT_REGEX, MINUTE } from '../Constants.js'
import { frame, isFileExists, levenshtein, randomInteger, randomValue, toTime, toTitleCase } from '../Utilities.js'
import { LRUCache } from 'lru-cache'

const QUIZ_DATA_PATH = join(process.cwd(), 'media', 'Text')

const DEFAULT_GAME_CONFIG = Object.freeze({
   title: 'STARSEED GAME',
   emoji: '🎮',
   timeout: 60000,
   questionField: 'soal',
   answerField: 'jawaban',
   mediaSource: null
})

const GameData = new LRUCache({ max: 3 })
const RegisteredGame = new Map()
const sessions = new Set()
export const stopQuizzes = () => { for (const map of sessions) { for (const session of map.values()) clearTimeout(session.timeout); map.clear() } }

const getRemainingTimeout = (timeout, startTime) =>
   Math.max(0, timeout - (Date.now() - startTime))

export default async (gameName, gameConfig = {}) => {
   if (RegisteredGame.has(gameName))
      return RegisteredGame.get(gameName)

   const quizDataPath = join(QUIZ_DATA_PATH, gameName)

   const isQuizDataExists = await isFileExists(quizDataPath)
   if (!isQuizDataExists)
      throw new Error(`❌ Game data file not found at ${quizDataPath}`)


   gameConfig = {
      ...DEFAULT_GAME_CONFIG,
      ...gameConfig
   }

   if (!gameConfig.command)
      throw new Error(`❌ Missing command name for ${gameName}`)

   if (!gameConfig.clueCommand)
      throw new Error(`❌ Missing clue command for ${gameName}`)

   if (!gameConfig.passCommand)
      throw new Error(`❌ Missing pass command for ${gameName}`)

   const GameSession = new Map()
   sessions.add(GameSession)
   const Processing = new Set()

   const gameCommand = {
      command: gameConfig.command,
      hidden: gameConfig.hidden,
      category: 'games',
      async run(m, {
         sock,
         isPrefix,
         command,
         user
      }) {
         const gameSession = GameSession.get(m.chat)
         if (gameSession)
            return sock.sendText(m.chat, `❌ There is already a game running in this chat @${m.sender.split('@')[0]}.`, gameSession.chat)
         if (Processing.has(m.chat))
            return m.reply('🔗 Please wait, previous request is still processing.')
         Processing.add(m.chat)
         try {
         const timeout = gameConfig.timeout
         const reward = randomInteger(1, 5)
         if (!GameData.has(gameName)) GameData.set(gameName, JSON.parse(await readFile(quizDataPath, 'utf8')))
         const data = randomValue(GameData.get(gameName))
         const question = data[gameConfig.questionField] || gameConfig.questionField
         const correctAnswer = data[gameConfig.answerField]?.toLowerCase()
         if (!correctAnswer)
            return m.reply('❌ Game correct answer not found.')
         let print = frame(gameConfig.title, [
            `*Question*: ${question}`,
            `*Timeout*: ${timeout / MINUTE} min`,
            `*Reward*: ${reward} limit`
         ], gameConfig.emoji)
         print += '\n\n'
         print += frame('TIP', [
            `Send \`${isPrefix + gameConfig.clueCommand}\` to get a clue or send \`${isPrefix + gameConfig.passCommand}\` to delete the game session`
         ], '📄')
         const chat = gameConfig.mediaSource ?
            await sock.sendMedia(m.chat, data[gameConfig.mediaSource], print, m) :
            await m.reply(print)
         GameSession.set(m.chat, {
            chat,
            correctAnswer,
            reward,
            usageClue: 0,
            createdAt: Date.now(),
            isAnswered: false,
            timeout: setTimeout(() => {
               GameSession.delete(m.chat)
               void sock.sendText(m.chat, `🕒 Time's up! The correct answer was: *${toTitleCase(correctAnswer)}*`, chat).catch(error => reportError('Quiz timeout', error))
            }, timeout).unref()

         })
         } finally { Processing.delete(m.chat) }
      },
      group: true,
      energy: 15
   }

   const clueCommand = {
      command: gameConfig.clueCommand,
      async run(m, {
         isPrefix
      }) {
         const gameSession = GameSession.get(m.chat)
         if (!gameSession)
            return m.reply(`❌ No game is currently running. Start a new one with: \`${isPrefix + gameConfig.command}\``)
         if (gameSession.usageClue >= 3)
            return m.reply(`❌ All clue attempts already used.`)
         CONSONANT_REGEX.lastIndex = 0
         await m.reply(`💬 *Clue*: \`${gameSession.correctAnswer.replace(CONSONANT_REGEX, '_')}\``)
         ++gameSession.usageClue
      },
      group: true,
      limit: 1
   }

   const passCommand = {
      command: gameConfig.passCommand,
      async run(m, {
         sock,
         isPrefix,
         user
      }) {
         const gameSession = GameSession.get(m.chat)
         if (!gameSession)
            return m.reply(`❌ No game is currently running. Start a new one with: \`${isPrefix + gameConfig.command}\``)
         if (Processing.has(m.chat))
            return m.reply('🔗 Please wait, previous request is still processing.')
         Processing.add(m.chat)
         try {
         GameSession.delete(m.chat)
         clearTimeout(gameSession.timeout)
         if (user.limit >= gameSession.reward) {
            user.limit -= gameSession.reward
            await m.reply(`✅ Successfully deleted *${toTitleCase(gameConfig.title.toLowerCase())}* game session. ${gameSession.reward} of your limit has been removed.`)
         }
         else {
            user.limit = 0
            await m.reply(`✅ Successfully deleted *${toTitleCase(gameConfig.title.toLowerCase())}* game session. All of your limit has been removed.`)
         }
         } finally { Processing.delete(m.chat) }
      },
      group: true
   }

   const gameEvent = {
      async run(m, {
         sock,
         body,
         user
      }) {
         const gameSession = GameSession.get(m.chat)
         if (
            !body ||
            !gameSession ||
            (
               m.type !== 'conversation' &&
               m.type !== 'extendedTextMessage'
            )
         ) return
         const answerLength = body.length
         const maxDistance = Math.max(2, answerLength >> 1)
         const distance = levenshtein(body.toLowerCase(), gameSession.correctAnswer, maxDistance)
         if (distance > maxDistance) return
         const similarity = (1 - distance / answerLength) * 100
         if (similarity > 90) {
            if (gameSession.isAnswered) return
            gameSession.isAnswered = true
            GameSession.delete(m.chat)
            clearTimeout(gameSession.timeout)
            const remainingTimeout = getRemainingTimeout(gameConfig.timeout, gameSession.createdAt)
            if ((remainingTimeout / gameConfig.timeout) >= 0.8) {
               const bonusReward = randomInteger(1, gameSession.reward)
               user.limit += gameSession.reward + bonusReward
               await m.reply(`⚡ That was quick! Correct, you've got +${gameSession.reward} limit and more +${bonusReward} limit!`)
            }
            else {
               user.limit += gameSession.reward
               await m.reply(`✅ Correct, you've got +${gameSession.reward} limit!`)
            }
            GameSession.delete(m.chat)
         }
         else if (similarity > 70)
            await m.reply('🤏🏻 Almost there.')
      },
      group: true
   }

   const modules = [gameCommand, clueCommand, passCommand, gameEvent]
   RegisteredGame.set(gameName, modules)
   return modules
}
