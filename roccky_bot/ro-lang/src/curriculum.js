export const CURRICULUM = {
  A1: [
    "greetings and introductions",
    "sounds, writing system, and basic sentence patterns",
    "numbers, dates, and time",
    "family and personal information",
    "daily routines and essential verbs",
    "food and polite requests",
    "places and asking for directions",
    "describing recent and past events",
  ],
  A2: [
    "describing people, objects, and places",
    "experiences and simple storytelling",
    "plans, invitations, and future meaning",
    "shopping, quantities, and comparisons",
    "health, needs, and advice",
    "travel problems and solutions",
    "opinions and simple reasons",
    "work and study situations",
  ],
  B1: [
    "connected storytelling and sequencing",
    "expressing opinions and agreement",
    "possibility and hypothetical meaning",
    "formal and informal registers",
    "news and current events",
    "workplace communication",
    "travel and cultural discussion",
    "common idioms and natural word combinations",
  ],
  B2: [
    "nuanced argument and debate",
    "complex structures in context",
    "academic and professional vocabulary",
    "implicit meaning, tone, and stance",
    "presentations and persuasion",
    "advanced word combinations and idiomatic usage",
    "summarizing complex material",
    "cross-cultural communication",
  ],
  C1: [
    "precision and stylistic control",
    "advanced professional communication",
    "rhetoric and persuasive language",
    "humor, irony, and subtext",
    "academic synthesis",
    "specialized vocabulary and discourse",
  ],
  C2: [
    "near-native nuance and reformulation",
    "regional and cultural variation",
    "high-level interpretation",
    "specialist communication",
    "creative and literary expression",
  ],
};

export const CURRICULUM_SKILLS = [
  "vocabulary",
  "grammar",
  "conversation",
  "listening",
  "pronunciation",
  "reading",
  "writing",
];

function normalizeTopic(topic) {
  return String(topic || "").trim().toLocaleLowerCase();
}

function curriculumLevel(level) {
  const normalized = String(level ?? "A1").toUpperCase();
  if (CURRICULUM[normalized]) return normalized;
  if (normalized.includes("BEGINNER")) return "A1";
  if (normalized.includes("ELEMENTARY")) return "A2";
  if (normalized.includes("INTERMEDIATE")) return "B1";
  if (normalized.includes("ADVANCED")) return "C1";
  return "A1";
}

function masteryFor(learner, topic) {
  const topicMastery = learner.curriculum?.topicMastery
    ?? learner.course?.curriculum?.topicMastery
    ?? {};
  return Number(topicMastery[normalizeTopic(topic)]?.score ?? 0);
}

function weakestSkill(learner) {
  const scores = learner.progress?.skillScores ?? {};
  return CURRICULUM_SKILLS
    .map((skill) => [skill, Number(scores[skill] ?? learner.progress?.proficiencyScore ?? 10)])
    .sort((left, right) => left[1] - right[1])[0]?.[0] ?? "conversation";
}

export function planCurriculum(learner, requestedTopic) {
  const level = curriculumLevel(
    learner.profile?.estimatedLevel ?? learner.estimatedLevel,
  );
  const topics = CURRICULUM[level];
  const completed = learner.progress?.completedTopics ?? [];
  const completedKeys = new Set(completed.map(normalizeTopic));
  const remaining = topics.filter(
    (topic) => !completedKeys.has(normalizeTopic(topic)) && masteryFor(learner, topic) < 80,
  );
  const weakTopics = Object.values(
    learner.curriculum?.topicMastery ?? learner.course?.curriculum?.topicMastery ?? {},
  )
    .filter((topic) => Number(topic.score) < 65 && Number(topic.attempts) > 0)
    .sort((left, right) => Number(left.score) - Number(right.score));
  const dueReview = weakTopics[0]?.topic;
  const selectedTopic = requestedTopic?.trim()
    || dueReview
    || remaining[0]
    || topics.at(-1);
  const selectedIndex = topics.findIndex(
    (topic) => normalizeTopic(topic) === normalizeTopic(selectedTopic),
  );
  const upcomingStart = selectedIndex >= 0 ? selectedIndex + 1 : 0;

  return {
    level,
    selectedTopic,
    mode: requestedTopic ? "requested" : dueReview ? "remediation" : "progression",
    focusSkill: weakestSkill(learner),
    prerequisites: topics
      .slice(0, Math.max(0, selectedIndex))
      .filter((topic) => masteryFor(learner, topic) >= 60 || completedKeys.has(normalizeTopic(topic)))
      .slice(-3),
    upcomingTopics: topics
      .slice(upcomingStart)
      .filter((topic) => normalizeTopic(topic) !== normalizeTopic(selectedTopic))
      .slice(0, 3),
  };
}
