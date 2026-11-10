import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { LanguageTutor } from "../src/language-tutor.js";
import { LearningMemory } from "../src/learning-memory.js";
import { JsonMemoryStore } from "../src/memory/json-memory-store.js";
import {
  createVocabularyItem,
  scheduleVocabularyReview,
} from "../src/spaced-repetition.js";

async function temporaryMemory(context) {
  const directory = await mkdtemp(join(tmpdir(), "ro-lang-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const filePath = join(directory, "memory.json");
  const store = new JsonMemoryStore(filePath);
  await store.init();
  return { filePath, store };
}

test("JSON memory persists profiles and organized vocabulary", async (context) => {
  const { filePath, store } = await temporaryMemory(context);
  const now = new Date("2026-01-01T00:00:00.000Z");
  const memory = new LearningMemory(store, { now: () => now });

  await memory.initializeLearner({
    userId: "alice",
    targetLanguage: "Japanese",
    goals: "travel,conversation",
  });
  await memory.addVocabulary("alice", {
    word: "こんにちは",
    translation: "hello",
    list: "greetings",
  });

  const saved = JSON.parse(await readFile(filePath, "utf8"));
  assert.equal(saved.learners.alice.profile.targetLanguage, "Japanese");
  assert.deepEqual(saved.learners.alice.profile.goals, ["travel", "conversation"]);
  assert.equal(saved.learners.alice.vocabulary[0].list, "greetings");

  const reloadedStore = new JsonMemoryStore(filePath);
  await reloadedStore.init();
  const reloaded = await reloadedStore.getLearner("alice");
  assert.equal(reloaded.vocabulary[0].word, "こんにちは");
});

test("legacy single-language records migrate without losing progress", async (context) => {
  const { filePath, store } = await temporaryMemory(context);
  await writeFile(filePath, JSON.stringify({
    learners: {
      alice: {
        id: "alice",
        profile: {
          targetLanguage: "English",
          nativeLanguage: "Indonesian",
          declaredLevel: "beginner",
          estimatedLevel: "A1",
          goals: ["work"],
          interests: [],
        },
        progress: {
          proficiencyScore: 22,
          lessonsCompleted: 3,
          skillScores: { vocabulary: 30 },
          weaknesses: [],
          completedTopics: ["greetings and introductions"],
        },
        vocabulary: [{
          key: "hello",
          word: "hello",
          translation: "halo",
          tags: [],
          nextReviewAt: "2026-01-01T00:00:00.000Z",
        }],
        history: [],
      },
    },
  }));

  const learner = await store.getLearner("alice");
  assert.equal(learner.courses.english.progress.lessonsCompleted, 3);
  assert.equal(learner.courses.english.progress.skillScores.listening, 22);
  assert.equal(learner.vocabulary[0].key, "english:hello");
});

test("spaced repetition schedules successful reviews farther apart", () => {
  const firstDate = new Date("2026-01-01T00:00:00.000Z");
  const item = createVocabularyItem(
    { word: "hello", translation: "halo" },
    firstDate,
  );
  const firstReview = scheduleVocabularyReview(item, 5, firstDate);
  const secondDate = new Date("2026-01-02T00:00:00.000Z");
  const secondReview = scheduleVocabularyReview(firstReview, 5, secondDate);

  assert.equal(firstReview.intervalDays, 1);
  assert.equal(firstReview.nextReviewAt, "2026-01-02T00:00:00.000Z");
  assert.equal(secondReview.intervalDays, 6);
  assert.equal(secondReview.nextReviewAt, "2026-01-08T00:00:00.000Z");
});

test("personal tutor stores lesson vocabulary without claiming unassessed mastery", async (context) => {
  const { store } = await temporaryMemory(context);
  const now = new Date("2026-01-01T00:00:00.000Z");
  const memory = new LearningMemory(store, { now: () => now });
  const requests = [];
  const lessonJson = JSON.stringify({
    title: "Greetings",
    topic: "greetings and introductions",
    level: "A1",
    objectives: ["Introduce yourself"],
    review: [],
    sections: [{ title: "Explanation", content: "Use hello to greet people." }],
    vocabulary: [
      { word: "hello", translation: "halo", example: "Hello, Ana!", list: "greetings", tags: ["lesson"] },
    ],
    exercises: ["Say hello."],
    answerKey: ["Hello!"],
    homework: "Greet one person.",
  });
  const tutor = new LanguageTutor(
    {
      async complete(request) {
        requests.push(request);
        return lessonJson;
      },
    },
    { memory },
  );

  const output = await tutor.createLesson({
    userId: "alice",
    targetLanguage: "English",
    topic: "greetings and introductions",
  });
  await tutor.createLesson({ userId: "alice", targetLanguage: "English" });

  const learner = await memory.getLearner("alice");
  assert.match(output, /# Greetings/);
  assert.equal(learner.vocabulary[0].word, "hello");
  assert.equal(learner.progress.lessonsCompleted, 2);
  assert.match(requests[1].messages[1].content, /greetings and introductions/);
  assert.match(requests[1].messages[1].content, /"word": "hello"/);
  assert.equal(
    learner.courses.english.curriculum.topicMastery["greetings and introductions"].status,
    "introduced",
  );
});

test("answer review updates proficiency and weakness memory", async (context) => {
  const { store } = await temporaryMemory(context);
  const memory = new LearningMemory(store, {
    now: () => new Date("2026-01-01T00:00:00.000Z"),
  });
  const tutor = new LanguageTutor(
    {
      async complete() {
        return JSON.stringify({
          feedback: "Good meaning, but the verb is missing.",
          score: 2,
          correctedAnswer: "I am hungry.",
          strengths: ["vocabulary"],
          weaknesses: ["grammar: be verb"],
          followUpExercise: "Write: She is tired.",
        });
      },
    },
    { memory },
  );

  const output = await tutor.reviewAnswer({
    userId: "alice",
    targetLanguage: "English",
    question: "Translate: Saya lapar",
    answer: "I hungry",
  });
  const learner = await memory.getLearner("alice");

  assert.match(output, /I am hungry/);
  assert.equal(learner.progress.answersReviewed, 1);
  assert.equal(learner.progress.weaknesses[0].name, "grammar: be verb");
});

test("conversational tutor infers a language and stores an assessed activity", async (context) => {
  const { store } = await temporaryMemory(context);
  const memory = new LearningMemory(store, {
    now: () => new Date("2026-01-02T00:00:00.000Z"),
  });
  const tutor = new LanguageTutor(
    {
      async complete() {
        return JSON.stringify({
          reply: "Bagus, kita mulai bahasa Jepang. Apa arti こんにちは?",
          intent: "assessment",
          profileUpdates: {
            targetLanguage: "Japanese",
            nativeLanguage: "Indonesian",
            goals: ["travel"],
            interests: [],
            preferences: { pace: "adaptive" },
          },
          assessment: {
            evaluated: false,
            skillScores: {},
            strengths: [],
            weaknesses: [],
            masteryUpdates: [],
          },
          lesson: {
            topic: "greetings and introductions",
            module: "A1 foundations",
            objectives: ["Recognize a greeting"],
            grammarConcepts: [],
            reviewTopics: [],
            newVocabulary: [{
              word: "こんにちは",
              translation: "halo",
              pronunciation: "konnichiwa",
              example: "こんにちは、アナです。",
            }],
          },
          activity: {
            type: "quiz",
            title: "Sapaan pertama",
            instructions: "Pilih arti yang tepat.",
            focus: "vocabulary",
            expectsReply: true,
            replyPrompt: "Balas dengan pilihanmu.",
            items: [{
              question: "Apa arti こんにちは?",
              options: ["Halo", "Terima kasih"],
              answer: "Halo",
            }],
          },
          quickReplies: ["Halo"],
          memorySummary: "Learner started Japanese for travel.",
        });
      },
    },
    { memory },
  );

  await memory.initializeLearner({ userId: "alice", targetLanguage: "Undetermined" });
  const turn = await tutor.converse({
    userId: "alice",
    targetLanguage: "Undetermined",
    nativeLanguage: "Indonesian",
    message: "Aku ingin belajar bahasa Jepang untuk liburan.",
  });
  const learner = await memory.getLearner("alice");

  assert.equal(turn.activity.type, "quiz");
  assert.equal(learner.profile.targetLanguage, "Japanese");
  assert.equal(learner.courses.undetermined, undefined);
  assert.equal(learner.courses.japanese.pendingActivity.type, "quiz");
  assert.equal(learner.vocabulary[0].languageKey, "japanese");
  assert.equal(learner.vocabulary[0].pronunciation, "konnichiwa");
});

test("progress and vocabulary stay independent for each studied language", async (context) => {
  const { store } = await temporaryMemory(context);
  const memory = new LearningMemory(store, {
    now: () => new Date("2026-01-03T00:00:00.000Z"),
  });
  await memory.initializeLearner({ userId: "alice", targetLanguage: "Japanese" });
  await memory.addVocabulary("alice", { word: "水", translation: "air" });
  await memory.recordTutorTurn("alice", {
    message: "こんにちは",
    turn: {
      reply: "Benar.",
      intent: "assessment",
      profileUpdates: {},
      assessment: {
        evaluated: true,
        overallScore: 80,
        confidenceDelta: 0.1,
        skillScores: { vocabulary: 80 },
        strengths: ["basic greetings"],
        weaknesses: [],
        masteryUpdates: [{ topic: "greetings and introductions", score: 85 }],
      },
      lesson: {},
      activity: { type: "none" },
    },
  });
  const japanese = await memory.getProgress("alice");

  await memory.activateLanguage("alice", "Spanish");
  await memory.addVocabulary("alice", { word: "agua", translation: "air" });
  const spanishWords = await memory.listVocabulary("alice");
  const spanish = await memory.getProgress("alice");

  assert.ok(japanese.progress.proficiencyScore > spanish.progress.proficiencyScore);
  assert.deepEqual(spanishWords.map((item) => item.word), ["agua"]);
  assert.equal(spanish.studiedLanguages.length, 2);

  await memory.activateLanguage("alice", "Japanese");
  const japaneseWords = await memory.listVocabulary("alice");
  assert.deepEqual(japaneseWords.map((item) => item.word), ["水"]);
});
