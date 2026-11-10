import { planCurriculum } from "./curriculum.js";
import {
  activateCourseView,
  createLanguageCourse,
  createLearner,
  languageKey,
  LANGUAGE_SKILLS,
  levelFromScore,
} from "./memory/learner-model.js";
import {
  createVocabularyItem,
  scheduleVocabularyReview,
} from "./spaced-repetition.js";

const MAX_HISTORY = 160;
const MAX_RECENT_ASSESSMENTS = 12;

function splitValues(value) {
  if (Array.isArray(value)) {
    return value.map(String).map((item) => item.trim()).filter(Boolean);
  }
  if (typeof value !== "string") return [];
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function uniqueStrings(values, limit = 30) {
  return [...new Set(splitValues(values).map((value) => value.slice(0, 120)))].slice(0, limit);
}

function appendHistory(learner, event) {
  learner.history.push(event);
  learner.history = learner.history.slice(-MAX_HISTORY);
}

function clamp(value, minimum, maximum, fallback = minimum) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(minimum, Math.min(maximum, number));
}

function normalizeTopic(topic) {
  return String(topic || "").trim().toLocaleLowerCase();
}

function validLanguage(value) {
  const language = String(value || "").trim();
  if (!language || language.length > 80) return "";
  if (/^(unknown|undetermined|null|none|not specified)$/i.test(language)) return "";
  return language;
}

function skillFromWeakness(weakness) {
  const value = weakness.toLocaleLowerCase();
  if (value.includes("vocab") || value.includes("word")) return "vocabulary";
  if (value.includes("listen")) return "listening";
  if (value.includes("pronun") || value.includes("sound") || value.includes("tone")) return "pronunciation";
  if (value.includes("speak") || value.includes("conversation")) return "conversation";
  if (value.includes("read") || value.includes("script")) return "reading";
  if (value.includes("writ") || value.includes("spell")) return "writing";
  return "grammar";
}

function courseView(course) {
  return {
    profile: {
      targetLanguage: course.language,
      nativeLanguage: course.nativeLanguage,
      declaredLevel: course.declaredLevel,
      estimatedLevel: course.estimatedLevel,
      goals: course.goals,
      interests: course.interests,
    },
    progress: course.progress,
    curriculum: course.curriculum,
    course,
  };
}

function ensureCourse(learner, language, options = {}, now = new Date()) {
  const selectedLanguage = validLanguage(language)
    || learner.profile?.targetLanguage
    || "Undetermined";
  const key = languageKey(selectedLanguage);
  if (!learner.courses[key]) {
    learner.courses[key] = createLanguageCourse({
      language: selectedLanguage,
      nativeLanguage: options.nativeLanguage || learner.profile?.nativeLanguage || "Indonesian",
      level: options.level || "beginner",
      goals: uniqueStrings(options.goals),
      interests: uniqueStrings(options.interests),
      now,
    });
  }
  activateCourseView(learner, key);
  return learner.courses[key];
}

function upsertWeakness(items, name, now) {
  const normalizedName = String(name || "").trim().slice(0, 160);
  if (!normalizedName) return;
  const existing = items.find(
    (item) => item.name.toLocaleLowerCase() === normalizedName.toLocaleLowerCase(),
  );
  if (existing) {
    existing.count = Number(existing.count || 0) + 1;
    existing.lastSeenAt = now.toISOString();
    existing.active = true;
  } else {
    items.push({
      name: normalizedName,
      count: 1,
      active: true,
      lastSeenAt: now.toISOString(),
    });
  }
}

function mergeStrengths(items, strengths, now) {
  for (const strength of uniqueStrings(strengths, 12)) {
    const existing = items.find(
      (item) => item.name.toLocaleLowerCase() === strength.toLocaleLowerCase(),
    );
    if (existing) {
      existing.count = Number(existing.count || 0) + 1;
      existing.lastSeenAt = now.toISOString();
    } else {
      items.push({ name: strength, count: 1, lastSeenAt: now.toISOString() });
    }
  }
}

function sanitizeActivity(activity) {
  if (!activity || activity.type === "none") return null;
  const allowedTypes = new Set([
    "flashcards",
    "quiz",
    "fill_blank",
    "matching",
    "table",
    "progress",
    "pronunciation",
  ]);
  const type = allowedTypes.has(activity.type) ? activity.type : "none";
  if (type === "none") return null;
  return {
    type,
    title: String(activity.title || "Practice").slice(0, 120),
    instructions: String(activity.instructions || "").slice(0, 500),
    focus: String(activity.focus || "mixed skills").slice(0, 100),
    expectsReply: Boolean(activity.expectsReply),
    replyPrompt: String(activity.replyPrompt || "").slice(0, 300),
    items: Array.isArray(activity.items)
      ? activity.items.slice(0, 16).map((item) => {
          const clean = {};
          for (const [key, value] of Object.entries(item ?? {})) {
            if (Array.isArray(value)) {
              clean[key] = value.slice(0, 8).map((entry) => String(entry).slice(0, 300));
            } else if (["string", "number", "boolean"].includes(typeof value)) {
              clean[key] = typeof value === "string" ? value.slice(0, 600) : value;
            }
          }
          return clean;
        })
      : [],
  };
}

export class LearningMemory {
  constructor(store, { now = () => new Date() } = {}) {
    this.store = store;
    this.now = now;
  }

  async initializeLearner({
    userId = "default",
    targetLanguage,
    nativeLanguage,
    level = "beginner",
    goals,
    interests,
  } = {}) {
    let learner = await this.store.getLearner(userId);
    if (!learner) {
      learner = createLearner({
        userId,
        targetLanguage: targetLanguage || "Undetermined",
        nativeLanguage: nativeLanguage || "Indonesian",
        level,
        goals: splitValues(goals),
        interests: splitValues(interests),
        now: this.now(),
      });
      await this.store.saveLearner(learner);
      return learner;
    }

    const course = ensureCourse(learner, targetLanguage, {
      nativeLanguage,
      level,
      goals,
      interests,
    }, this.now());
    if (nativeLanguage) course.nativeLanguage = nativeLanguage;
    if (goals !== undefined) course.goals = splitValues(goals);
    if (interests !== undefined) course.interests = splitValues(interests);
    course.updatedAt = this.now().toISOString();
    activateCourseView(learner, course.key);
    learner.updatedAt = this.now().toISOString();
    await this.store.saveLearner(learner);
    return learner;
  }

  async getLearner(userId = "default") {
    return this.store.getLearner(userId);
  }

  async save(learner) {
    if (learner.courses?.[learner.activeLanguageKey]) {
      const course = learner.courses[learner.activeLanguageKey];
      course.estimatedLevel = levelFromScore(course.progress.proficiencyScore);
      course.updatedAt = this.now().toISOString();
      activateCourseView(learner, learner.activeLanguageKey);
    }
    learner.updatedAt = this.now().toISOString();
    await this.store.saveLearner(learner);
    return learner;
  }

  async activateLanguage(userId, language, options = {}) {
    const learner = await this.getLearner(userId);
    if (!learner) throw new Error(`Learner profile "${userId}" does not exist.`);
    const course = ensureCourse(learner, language, options, this.now());
    await this.save(learner);
    return course;
  }

  upsertVocabularyOnLearner(learner, vocabulary, defaults = {}) {
    const course = learner.courses[learner.activeLanguageKey];
    const item = createVocabularyItem(
      {
        ...vocabulary,
        pronunciation: vocabulary.pronunciation ?? "",
        language: course.language,
        languageKey: course.key,
        list: vocabulary.list ?? defaults.list ?? "general",
        tags: vocabulary.tags ?? defaults.tags ?? [],
      },
      this.now(),
    );
    const existingIndex = learner.vocabulary.findIndex(
      (entry) => entry.key === item.key,
    );

    if (existingIndex >= 0) {
      learner.vocabulary[existingIndex] = {
        ...learner.vocabulary[existingIndex],
        translation: item.translation,
        example: item.example || learner.vocabulary[existingIndex].example,
        pronunciation: item.pronunciation || learner.vocabulary[existingIndex].pronunciation,
        list: item.list,
        tags: [...new Set([
          ...(learner.vocabulary[existingIndex].tags ?? []),
          ...item.tags,
        ])],
        updatedAt: this.now().toISOString(),
      };
    } else {
      learner.vocabulary.push(item);
    }
    return learner.vocabulary.find((entry) => entry.key === item.key);
  }

  async addVocabulary(userId, vocabulary, defaults = {}) {
    const learner = await this.getLearner(userId);
    if (!learner) throw new Error(`Learner profile "${userId}" does not exist.`);
    if (defaults.language) ensureCourse(learner, defaults.language, {}, this.now());
    const item = this.upsertVocabularyOnLearner(learner, vocabulary, defaults);
    appendHistory(learner, {
      type: "vocabulary_added",
      languageKey: learner.activeLanguageKey,
      word: item.word,
      at: this.now().toISOString(),
    });
    await this.save(learner);
    return item;
  }

  async addVocabularyBatch(userId, words, defaults = {}) {
    const added = [];
    for (const word of words ?? []) {
      if (!word?.word || !word?.translation) continue;
      added.push(await this.addVocabulary(userId, word, defaults));
    }
    return added;
  }

  async listVocabulary(userId, { list, dueOnly = false, language } = {}) {
    const learner = await this.getLearner(userId);
    if (!learner) return [];
    const selectedLanguageKey = language
      ? languageKey(language)
      : learner.activeLanguageKey;
    const now = this.now().getTime();
    return learner.vocabulary
      .filter((item) => item.languageKey === selectedLanguageKey)
      .filter((item) => !list || item.list === list)
      .filter((item) => !dueOnly || new Date(item.nextReviewAt).getTime() <= now)
      .sort((left, right) => new Date(left.nextReviewAt) - new Date(right.nextReviewAt));
  }

  async reviewVocabulary(userId, word, quality, { language } = {}) {
    const learner = await this.getLearner(userId);
    if (!learner) throw new Error(`Learner profile "${userId}" does not exist.`);
    if (language) ensureCourse(learner, language, {}, this.now());

    const wordKey = word.trim().toLocaleLowerCase();
    const index = learner.vocabulary.findIndex(
      (item) => item.wordKey === wordKey && item.languageKey === learner.activeLanguageKey,
    );
    if (index < 0) throw new Error(`Vocabulary word "${word}" was not found.`);

    learner.vocabulary[index] = scheduleVocabularyReview(
      learner.vocabulary[index],
      quality,
      this.now(),
    );
    appendHistory(learner, {
      type: "vocabulary_reviewed",
      languageKey: learner.activeLanguageKey,
      word: learner.vocabulary[index].word,
      quality: Number(quality),
      at: this.now().toISOString(),
    });
    await this.save(learner);
    return learner.vocabulary[index];
  }

  async recordLesson(userId, { topic, vocabulary = [], title }) {
    const learner = await this.getLearner(userId);
    if (!learner) return;
    const course = learner.courses[learner.activeLanguageKey];
    const now = this.now();

    course.progress.lessonsCompleted += 1;
    if (topic) {
      const key = normalizeTopic(topic);
      const previous = course.curriculum.topicMastery[key] ?? {};
      course.curriculum.topicMastery[key] = {
        ...previous,
        topic,
        score: Number(previous.score ?? 20),
        status: previous.status ?? "introduced",
        attempts: Number(previous.attempts ?? 0),
        timesTaught: Number(previous.timesTaught ?? 0) + 1,
        lastPracticedAt: now.toISOString(),
      };
      course.curriculum.currentTopic = topic;
    }
    for (const word of vocabulary) {
      if (word?.word && word?.translation) {
        this.upsertVocabularyOnLearner(learner, word, {
          list: topic || "lessons",
          tags: ["lesson"],
        });
      }
    }
    appendHistory(learner, {
      type: "lesson_completed",
      languageKey: learner.activeLanguageKey,
      topic,
      title,
      at: now.toISOString(),
    });
    await this.save(learner);
  }

  async recordPractice(userId, focus) {
    const learner = await this.getLearner(userId);
    if (!learner) return;
    const course = learner.courses[learner.activeLanguageKey];
    course.progress.practicesCompleted += 1;
    appendHistory(learner, {
      type: "practice_generated",
      languageKey: learner.activeLanguageKey,
      focus,
      at: this.now().toISOString(),
    });
    await this.save(learner);
  }

  async recordAnswerReview(userId, { score, weaknesses = [], strengths = [] }) {
    const learner = await this.getLearner(userId);
    if (!learner) return;
    const course = learner.courses[learner.activeLanguageKey];
    const now = this.now();
    const quality = clamp(score, 0, 5, 0);
    const performanceScore = quality * 20;

    course.progress.answersReviewed += 1;
    course.progress.proficiencyScore = Math.round(
      course.progress.proficiencyScore * 0.85 + performanceScore * 0.15,
    );
    for (const weakness of uniqueStrings(weaknesses, 12)) {
      upsertWeakness(course.progress.weaknesses, weakness, now);
      const skill = skillFromWeakness(weakness);
      const previous = course.progress.skillScores[skill]
        ?? course.progress.proficiencyScore;
      course.progress.skillScores[skill] = Math.round(
        previous * 0.8 + performanceScore * 0.2,
      );
    }
    mergeStrengths(course.progress.strengths, strengths, now);
    course.estimatedLevel = levelFromScore(course.progress.proficiencyScore);

    appendHistory(learner, {
      type: "answer_reviewed",
      languageKey: learner.activeLanguageKey,
      score: quality,
      strengths,
      weaknesses,
      at: now.toISOString(),
    });
    await this.save(learner);
  }

  async recordConversation(userId, message, reply) {
    const learner = await this.getLearner(userId);
    if (!learner) return;
    const course = learner.courses[learner.activeLanguageKey];
    course.progress.conversationsCompleted += 1;
    course.lastInteractionAt = this.now().toISOString();
    appendHistory(learner, {
      type: "conversation_turn",
      languageKey: learner.activeLanguageKey,
      message: message.slice(0, 600),
      reply: reply.slice(0, 900),
      at: this.now().toISOString(),
    });
    await this.save(learner);
  }

  async recordTutorTurn(userId, { message = "", event = "message", turn }) {
    const learner = await this.getLearner(userId);
    if (!learner) throw new Error(`Learner profile "${userId}" does not exist.`);
    const now = this.now();
    const profileUpdates = turn?.profileUpdates ?? {};
    const detectedLanguage = validLanguage(profileUpdates.targetLanguage);
    const course = ensureCourse(
      learner,
      detectedLanguage || learner.profile.targetLanguage,
      {
        nativeLanguage: validLanguage(profileUpdates.nativeLanguage)
          || learner.profile.nativeLanguage,
      },
      now,
    );
    if (detectedLanguage && course.key !== "undetermined") {
      delete learner.courses.undetermined;
    }

    const nativeLanguage = validLanguage(profileUpdates.nativeLanguage);
    if (nativeLanguage) {
      course.nativeLanguage = nativeLanguage;
      if (!course.preferences.explanationLanguage) {
        course.preferences.explanationLanguage = nativeLanguage;
      }
    }
    if (profileUpdates.goals?.length) {
      course.goals = uniqueStrings([...course.goals, ...profileUpdates.goals]);
    }
    if (profileUpdates.interests?.length) {
      course.interests = uniqueStrings([...course.interests, ...profileUpdates.interests]);
    }
    if (profileUpdates.preferences && typeof profileUpdates.preferences === "object") {
      const allowedPreferences = [
        "pace",
        "correctionStyle",
        "explanationLanguage",
        "preferredActivities",
      ];
      for (const key of allowedPreferences) {
        const value = profileUpdates.preferences[key];
        if (value === undefined) continue;
        course.preferences[key] = key === "preferredActivities"
          ? uniqueStrings(value, 10)
          : String(value).slice(0, 120);
      }
    }

    course.assessment.turnsObserved += event === "message" ? 1 : 0;
    const assessment = turn?.assessment ?? {};
    if (assessment.evaluated) {
      course.progress.answersReviewed += 1;
      course.assessment.lastAssessmentAt = now.toISOString();
      course.assessment.confidence = clamp(
        course.assessment.confidence + clamp(assessment.confidenceDelta, 0.01, 0.2, 0.04),
        0,
        1,
        0,
      );

      const providedSkills = [];
      for (const skill of LANGUAGE_SKILLS) {
        const observed = Number(assessment.skillScores?.[skill]);
        if (!Number.isFinite(observed)) continue;
        const score = clamp(observed, 0, 100, course.progress.skillScores[skill]);
        const previous = course.progress.skillScores[skill]
          ?? course.progress.proficiencyScore;
        course.progress.skillScores[skill] = Math.round(previous * 0.75 + score * 0.25);
        providedSkills.push(score);
      }

      let performanceScore = Number(assessment.overallScore);
      if (!Number.isFinite(performanceScore) && Number.isFinite(Number(assessment.score))) {
        performanceScore = clamp(assessment.score, 0, 5, 0) * 20;
      }
      if (!Number.isFinite(performanceScore) && providedSkills.length) {
        performanceScore = providedSkills.reduce((sum, score) => sum + score, 0) / providedSkills.length;
      }
      if (Number.isFinite(performanceScore)) {
        const weight = Math.min(0.25, 0.1 + course.assessment.confidence * 0.15);
        course.progress.proficiencyScore = Math.round(
          course.progress.proficiencyScore * (1 - weight)
          + clamp(performanceScore, 0, 100, 0) * weight,
        );
      }

      for (const weakness of uniqueStrings(assessment.weaknesses, 12)) {
        upsertWeakness(course.progress.weaknesses, weakness, now);
      }
      mergeStrengths(course.progress.strengths, assessment.strengths, now);
      course.assessment.recent.push({
        score: Number.isFinite(performanceScore) ? Math.round(performanceScore) : null,
        evidence: String(assessment.evidence || "").slice(0, 300),
        strengths: uniqueStrings(assessment.strengths, 8),
        weaknesses: uniqueStrings(assessment.weaknesses, 8),
        at: now.toISOString(),
      });
      course.assessment.recent = course.assessment.recent.slice(-MAX_RECENT_ASSESSMENTS);
      course.pendingActivity = null;
    }

    for (const update of assessment.masteryUpdates ?? []) {
      const topic = String(update?.topic || "").trim().slice(0, 160);
      if (!topic) continue;
      const key = normalizeTopic(topic);
      const previous = course.curriculum.topicMastery[key] ?? {
        topic,
        score: 0,
        attempts: 0,
      };
      const observed = clamp(update.score, 0, 100, previous.score);
      const attempts = Number(previous.attempts || 0) + 1;
      const score = attempts === 1
        ? Math.round(observed)
        : Math.round(Number(previous.score || 0) * 0.65 + observed * 0.35);
      const status = score >= 80
        ? "mastered"
        : score >= 55
          ? "practicing"
          : "needs_review";
      course.curriculum.topicMastery[key] = {
        ...previous,
        topic,
        score,
        status,
        attempts,
        lastPracticedAt: now.toISOString(),
      };
      if (status === "mastered" && !course.progress.completedTopics.some(
        (completed) => normalizeTopic(completed) === key,
      )) {
        course.progress.completedTopics.push(topic);
      }
    }

    const lesson = turn?.lesson ?? {};
    const lessonTopic = String(lesson.topic || "").trim().slice(0, 160);
    if (lessonTopic) {
      course.curriculum.currentTopic = lessonTopic;
      course.curriculum.currentModule = String(lesson.module || "").slice(0, 160);
      course.curriculum.learningObjectives = uniqueStrings(
        lesson.objectives,
        12,
      );
      if (turn.intent === "lesson") course.progress.lessonsCompleted += 1;
    }
    course.curriculum.grammarConcepts = uniqueStrings([
      ...course.curriculum.grammarConcepts,
      ...(lesson.grammarConcepts ?? []),
    ], 60);
    course.curriculum.reviewQueue = uniqueStrings([
      ...course.curriculum.reviewQueue,
      ...(lesson.reviewTopics ?? []),
    ], 30);
    for (const vocabulary of lesson.newVocabulary ?? []) {
      if (!vocabulary?.word || !vocabulary?.translation) continue;
      this.upsertVocabularyOnLearner(learner, vocabulary, {
        list: lessonTopic || "conversation",
        tags: ["tutor"],
      });
    }

    const activity = sanitizeActivity(turn?.activity);
    if (activity?.expectsReply) {
      course.pendingActivity = {
        ...activity,
        createdAt: now.toISOString(),
      };
    }
    if (activity) course.progress.practicesCompleted += 1;

    course.progress.conversationsCompleted += event === "message" ? 1 : 0;
    course.estimatedLevel = levelFromScore(course.progress.proficiencyScore);
    course.conversationSummary = String(
      turn?.memorySummary || course.conversationSummary || "",
    ).slice(0, 1000);
    course.lastInteractionAt = now.toISOString();
    appendHistory(learner, {
      type: "tutor_turn",
      languageKey: course.key,
      event,
      intent: String(turn?.intent || "conversation").slice(0, 50),
      topic: lessonTopic || course.curriculum.currentTopic || "",
      message: String(message).slice(0, 800),
      reply: String(turn?.reply || "").slice(0, 1200),
      assessed: Boolean(assessment.evaluated),
      at: now.toISOString(),
    });
    await this.save(learner);
    return learner;
  }

  async buildContext(userId, requestedTopic) {
    const learner = await this.getLearner(userId);
    if (!learner) return null;
    const course = learner.courses[learner.activeLanguageKey];
    const dueWords = await this.listVocabulary(userId, { dueOnly: true });
    const plan = planCurriculum(courseView(course), requestedTopic);
    const weaknesses = [...course.progress.weaknesses]
      .sort((left, right) => Number(right.count) - Number(left.count))
      .slice(0, 8);
    const strengths = [...course.progress.strengths]
      .sort((left, right) => Number(right.count) - Number(left.count))
      .slice(0, 6);
    const recentEvents = learner.history
      .filter((event) => !event.languageKey || event.languageKey === course.key)
      .slice(-10)
      .map((event) => ({
        type: event.type,
        intent: event.intent,
        topic: event.topic ?? event.focus ?? event.word,
        message: event.message,
        score: event.score,
        at: event.at,
      }));
    const topicMastery = Object.values(course.curriculum.topicMastery)
      .sort((left, right) => new Date(right.lastPracticedAt || 0) - new Date(left.lastPracticedAt || 0))
      .slice(0, 12);
    const languages = Object.values(learner.courses).map((item) => ({
      language: item.language,
      level: item.estimatedLevel,
      score: item.progress.proficiencyScore,
      active: item.key === course.key,
      lastInteractionAt: item.lastInteractionAt,
    }));

    const memoryData = {
      currentTime: this.now().toISOString(),
      activeCourse: {
        language: course.language,
        nativeLanguage: course.nativeLanguage,
        estimatedLevel: course.estimatedLevel,
        proficiencyScore: course.progress.proficiencyScore,
        assessmentConfidence: course.assessment.confidence,
        turnsObserved: course.assessment.turnsObserved,
        goals: course.goals,
        interests: course.interests,
        preferences: course.preferences,
        skillScores: course.progress.skillScores,
        weaknesses,
        strengths,
        currentTopic: course.curriculum.currentTopic,
        grammarConcepts: course.curriculum.grammarConcepts.slice(-15),
        learningObjectives: course.curriculum.learningObjectives,
        topicMastery,
        pendingActivity: course.pendingActivity,
        conversationSummary: course.conversationSummary,
      },
      studiedLanguages: languages,
      vocabulary: {
        total: learner.vocabulary.filter((item) => item.languageKey === course.key).length,
        due: dueWords.slice(0, 16),
        recent: learner.vocabulary
          .filter((item) => item.languageKey === course.key)
          .slice(-20)
          .map((item) => ({
            word: item.word,
            translation: item.translation,
            pronunciation: item.pronunciation,
            status: item.status,
          })),
      },
      curriculumPlan: plan,
      recentEvents,
    };

    return {
      learner,
      course,
      plan,
      dueWords: dueWords.slice(0, 16),
      data: memoryData,
      text: JSON.stringify(memoryData, null, 2),
    };
  }

  async getProgress(userId) {
    const learner = await this.getLearner(userId);
    if (!learner) return null;
    const course = learner.courses[learner.activeLanguageKey];
    const dueWords = await this.listVocabulary(userId, { dueOnly: true });
    const courseVocabulary = learner.vocabulary.filter(
      (item) => item.languageKey === course.key,
    );
    const lists = Object.groupBy
      ? Object.groupBy(courseVocabulary, (item) => item.list)
      : courseVocabulary.reduce((groups, item) => {
          (groups[item.list] ??= []).push(item);
          return groups;
        }, {});

    return {
      profile: learner.profile,
      progress: course.progress,
      curriculum: course.curriculum,
      assessment: course.assessment,
      preferences: course.preferences,
      studiedLanguages: Object.values(learner.courses).map((item) => ({
        language: item.language,
        level: item.estimatedLevel,
        score: item.progress.proficiencyScore,
        active: item.key === course.key,
      })),
      vocabulary: {
        total: courseVocabulary.length,
        due: dueWords.length,
        mastered: courseVocabulary.filter((item) => item.status === "mastered").length,
        lists: Object.fromEntries(
          Object.entries(lists).map(([name, items]) => [name, items.length]),
        ),
      },
    };
  }
}
