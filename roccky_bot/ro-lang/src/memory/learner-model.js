const LEVEL_SCORES = {
  beginner: 10,
  a1: 10,
  elementary: 25,
  a2: 25,
  intermediate: 50,
  b1: 50,
  "upper-intermediate": 65,
  b2: 65,
  advanced: 80,
  c1: 80,
  proficient: 95,
  c2: 95,
};

export const LANGUAGE_SKILLS = [
  "vocabulary",
  "grammar",
  "conversation",
  "listening",
  "pronunciation",
  "reading",
  "writing",
];

function initialScore(level) {
  return LEVEL_SCORES[String(level).toLowerCase()] ?? 10;
}

export function levelFromScore(score) {
  if (score >= 90) return "C2";
  if (score >= 75) return "C1";
  if (score >= 60) return "B2";
  if (score >= 45) return "B1";
  if (score >= 25) return "A2";
  return "A1";
}

export function languageKey(language) {
  return String(language || "undetermined")
    .trim()
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "") || "undetermined";
}

function createProgress(score) {
  return {
    proficiencyScore: score,
    lessonsCompleted: 0,
    practicesCompleted: 0,
    answersReviewed: 0,
    conversationsCompleted: 0,
    skillScores: Object.fromEntries(
      LANGUAGE_SKILLS.map((skill) => [skill, score]),
    ),
    weaknesses: [],
    strengths: [],
    completedTopics: [],
  };
}

function normalizeProgress(progress, fallbackScore = 10) {
  const proficiencyScore = Number.isFinite(Number(progress?.proficiencyScore))
    ? Math.max(0, Math.min(100, Math.round(Number(progress.proficiencyScore))))
    : fallbackScore;
  const skillScores = { ...progress?.skillScores };
  for (const skill of LANGUAGE_SKILLS) {
    if (!Number.isFinite(Number(skillScores[skill]))) {
      skillScores[skill] = proficiencyScore;
    }
  }

  return {
    ...createProgress(proficiencyScore),
    ...progress,
    proficiencyScore,
    skillScores,
    weaknesses: Array.isArray(progress?.weaknesses) ? progress.weaknesses : [],
    strengths: Array.isArray(progress?.strengths) ? progress.strengths : [],
    completedTopics: Array.isArray(progress?.completedTopics)
      ? progress.completedTopics
      : [],
  };
}

export function createLanguageCourse({
  language,
  nativeLanguage = "Indonesian",
  level = "beginner",
  goals = [],
  interests = [],
  progress,
  now = new Date(),
} = {}) {
  const timestamp = now.toISOString();
  const score = initialScore(level);
  const normalizedProgress = normalizeProgress(progress, score);

  return {
    key: languageKey(language),
    language: String(language || "Undetermined").trim() || "Undetermined",
    nativeLanguage,
    declaredLevel: level,
    estimatedLevel: levelFromScore(normalizedProgress.proficiencyScore),
    goals: Array.isArray(goals) ? goals : [],
    interests: Array.isArray(interests) ? interests : [],
    progress: normalizedProgress,
    curriculum: {
      currentTopic: "",
      currentModule: "",
      topicMastery: {},
      grammarConcepts: [],
      learningObjectives: [],
      reviewQueue: [],
    },
    preferences: {
      pace: "adaptive",
      correctionStyle: "natural",
      explanationLanguage: nativeLanguage,
      preferredActivities: [],
    },
    assessment: {
      confidence: 0,
      turnsObserved: 0,
      lastAssessmentAt: null,
      recent: [],
    },
    pendingActivity: null,
    conversationSummary: "",
    startedAt: timestamp,
    lastInteractionAt: timestamp,
    updatedAt: timestamp,
  };
}

function normalizeCourse(course, fallback = {}, now = new Date()) {
  const normalized = {
    ...createLanguageCourse({
      language: course?.language ?? fallback.language,
      nativeLanguage: course?.nativeLanguage ?? fallback.nativeLanguage,
      level: course?.declaredLevel ?? fallback.level,
      goals: course?.goals ?? fallback.goals,
      interests: course?.interests ?? fallback.interests,
      progress: course?.progress ?? fallback.progress,
      now,
    }),
    ...course,
  };

  normalized.key = languageKey(normalized.language);
  normalized.progress = normalizeProgress(
    course?.progress ?? fallback.progress,
    initialScore(normalized.declaredLevel),
  );
  normalized.estimatedLevel = levelFromScore(normalized.progress.proficiencyScore);
  normalized.goals = Array.isArray(normalized.goals) ? normalized.goals : [];
  normalized.interests = Array.isArray(normalized.interests) ? normalized.interests : [];
  normalized.curriculum = {
    currentTopic: "",
    currentModule: "",
    topicMastery: {},
    grammarConcepts: [],
    learningObjectives: [],
    reviewQueue: [],
    ...course?.curriculum,
  };
  normalized.curriculum.topicMastery =
    normalized.curriculum.topicMastery && typeof normalized.curriculum.topicMastery === "object"
      ? normalized.curriculum.topicMastery
      : {};
  for (const field of ["grammarConcepts", "learningObjectives", "reviewQueue"]) {
    normalized.curriculum[field] = Array.isArray(normalized.curriculum[field])
      ? normalized.curriculum[field]
      : [];
  }
  normalized.preferences = {
    pace: "adaptive",
    correctionStyle: "natural",
    explanationLanguage: normalized.nativeLanguage,
    preferredActivities: [],
    ...course?.preferences,
  };
  normalized.preferences.preferredActivities = Array.isArray(
    normalized.preferences.preferredActivities,
  )
    ? normalized.preferences.preferredActivities
    : [];
  normalized.assessment = {
    confidence: 0,
    turnsObserved: 0,
    lastAssessmentAt: null,
    recent: [],
    ...course?.assessment,
  };
  normalized.assessment.recent = Array.isArray(normalized.assessment.recent)
    ? normalized.assessment.recent
    : [];
  return normalized;
}

export function activateCourseView(learner, key) {
  const course = learner.courses[key];
  if (!course) return learner;

  learner.activeLanguageKey = key;
  learner.profile = {
    ...learner.profile,
    targetLanguage: course.language,
    nativeLanguage: course.nativeLanguage,
    declaredLevel: course.declaredLevel,
    estimatedLevel: course.estimatedLevel,
    goals: course.goals,
    interests: course.interests,
  };
  learner.progress = course.progress;
  return learner;
}

export function createLearner({
  userId,
  targetLanguage = "Undetermined",
  nativeLanguage = "Indonesian",
  level = "beginner",
  goals = [],
  interests = [],
  now = new Date(),
}) {
  const timestamp = now.toISOString();
  const course = createLanguageCourse({
    language: targetLanguage,
    nativeLanguage,
    level,
    goals,
    interests,
    now,
  });

  return {
    id: userId,
    activeLanguageKey: course.key,
    courses: { [course.key]: course },
    profile: {
      targetLanguage: course.language,
      nativeLanguage: course.nativeLanguage,
      declaredLevel: course.declaredLevel,
      estimatedLevel: course.estimatedLevel,
      goals: course.goals,
      interests: course.interests,
    },
    progress: course.progress,
    vocabulary: [],
    history: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function normalizeLearner(learner) {
  if (!learner) return null;

  const now = new Date();
  const legacyProfile = {
    targetLanguage: "Undetermined",
    nativeLanguage: "Indonesian",
    declaredLevel: "beginner",
    estimatedLevel: "A1",
    goals: [],
    interests: [],
    ...learner.profile,
  };
  const legacyProgress = normalizeProgress(learner.progress);
  const courses = {};

  for (const course of Object.values(learner.courses ?? {})) {
    if (!course) continue;
    const normalized = normalizeCourse(course, {}, now);
    courses[normalized.key] = normalized;
  }

  const legacyKey = languageKey(legacyProfile.targetLanguage);
  if (!courses[legacyKey]) {
    courses[legacyKey] = normalizeCourse(
      null,
      {
        language: legacyProfile.targetLanguage,
        nativeLanguage: legacyProfile.nativeLanguage,
        level: legacyProfile.declaredLevel,
        goals: Array.isArray(legacyProfile.goals) ? legacyProfile.goals : [],
        interests: Array.isArray(legacyProfile.interests) ? legacyProfile.interests : [],
        progress: legacyProgress,
      },
      now,
    );
  }

  const requestedActiveKey = languageKey(
    learner.activeLanguageKey || legacyProfile.targetLanguage,
  );
  const activeLanguageKey = courses[requestedActiveKey]
    ? requestedActiveKey
    : Object.keys(courses)[0];
  const normalized = {
    ...learner,
    activeLanguageKey,
    courses,
    vocabulary: Array.isArray(learner.vocabulary) ? learner.vocabulary : [],
    history: Array.isArray(learner.history) ? learner.history : [],
  };

  activateCourseView(normalized, activeLanguageKey);
  normalized.vocabulary = normalized.vocabulary.map((item) => {
    const itemLanguage = item.language || legacyProfile.targetLanguage;
    const itemLanguageKey = languageKey(item.languageKey || itemLanguage);
    const wordKey = item.wordKey || String(item.word || item.key || "").trim().toLocaleLowerCase();
    return {
      ...item,
      language: itemLanguage,
      languageKey: itemLanguageKey,
      wordKey,
      key: `${itemLanguageKey}:${wordKey}`,
    };
  });
  return normalized;
}
