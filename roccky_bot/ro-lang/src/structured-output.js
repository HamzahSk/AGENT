export function parseJsonObject(text) {
  if (typeof text !== "string") return null;

  const unfenced = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  const start = unfenced.indexOf("{");
  const end = unfenced.lastIndexOf("}");
  if (start < 0 || end <= start) return null;

  try {
    return JSON.parse(unfenced.slice(start, end + 1));
  } catch {
    return null;
  }
}

function stringList(value, limit = 20) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item ?? "").trim())
    .filter(Boolean)
    .slice(0, limit);
}

function cleanActivity(activity) {
  if (!activity || typeof activity !== "object") return { type: "none", items: [] };
  const allowedTypes = new Set([
    "none",
    "flashcards",
    "quiz",
    "fill_blank",
    "matching",
    "table",
    "progress",
    "pronunciation",
  ]);
  const type = allowedTypes.has(activity.type) ? activity.type : "none";
  return {
    type,
    title: String(activity.title || "").slice(0, 160),
    instructions: String(activity.instructions || "").slice(0, 800),
    focus: String(activity.focus || "").slice(0, 120),
    expectsReply: Boolean(activity.expectsReply),
    replyPrompt: String(activity.replyPrompt || "").slice(0, 400),
    items: Array.isArray(activity.items)
      ? activity.items.slice(0, 20).map((item) => {
          const clean = {};
          for (const [key, value] of Object.entries(item ?? {})) {
            if (Array.isArray(value)) {
              clean[key] = value.slice(0, 10).map((entry) => String(entry).slice(0, 400));
            } else if (["string", "number", "boolean"].includes(typeof value)) {
              clean[key] = typeof value === "string" ? value.slice(0, 800) : value;
            }
          }
          return clean;
        })
      : [],
  };
}

function cleanVocabulary(values) {
  if (!Array.isArray(values)) return [];
  return values.slice(0, 20).map((item) => ({
    word: String(item?.word || "").trim().slice(0, 160),
    translation: String(item?.translation || "").trim().slice(0, 300),
    pronunciation: String(item?.pronunciation || "").trim().slice(0, 200),
    example: String(item?.example || "").trim().slice(0, 500),
    list: String(item?.list || "conversation").trim().slice(0, 120),
    tags: stringList(item?.tags, 12),
  })).filter((item) => item.word && item.translation);
}

export function parseTutorTurn(text) {
  const parsed = parseJsonObject(text);
  if (!parsed || typeof parsed.reply !== "string" || !parsed.reply.trim()) return null;
  const assessment = parsed.assessment && typeof parsed.assessment === "object"
    ? parsed.assessment
    : {};
  const lesson = parsed.lesson && typeof parsed.lesson === "object"
    ? parsed.lesson
    : {};
  const profileUpdates = parsed.profileUpdates && typeof parsed.profileUpdates === "object"
    ? parsed.profileUpdates
    : {};

  return {
    reply: parsed.reply.trim(),
    intent: String(parsed.intent || "conversation").slice(0, 50),
    profileUpdates: {
      targetLanguage: String(profileUpdates.targetLanguage || "").slice(0, 80),
      nativeLanguage: String(profileUpdates.nativeLanguage || "").slice(0, 80),
      goals: stringList(profileUpdates.goals, 12),
      interests: stringList(profileUpdates.interests, 12),
      preferences: profileUpdates.preferences && typeof profileUpdates.preferences === "object"
        ? profileUpdates.preferences
        : {},
    },
    assessment: {
      evaluated: Boolean(assessment.evaluated),
      score: assessment.score,
      overallScore: assessment.overallScore,
      skillScores: assessment.skillScores && typeof assessment.skillScores === "object"
        ? assessment.skillScores
        : {},
      confidenceDelta: assessment.confidenceDelta,
      strengths: stringList(assessment.strengths, 12),
      weaknesses: stringList(assessment.weaknesses, 12),
      evidence: String(assessment.evidence || "").slice(0, 500),
      masteryUpdates: Array.isArray(assessment.masteryUpdates)
        ? assessment.masteryUpdates.slice(0, 12)
        : [],
    },
    lesson: {
      topic: String(lesson.topic || "").slice(0, 160),
      module: String(lesson.module || "").slice(0, 160),
      objectives: stringList(lesson.objectives, 12),
      grammarConcepts: stringList(lesson.grammarConcepts, 12),
      reviewTopics: stringList(lesson.reviewTopics, 12),
      newVocabulary: cleanVocabulary(lesson.newVocabulary),
    },
    activity: cleanActivity(parsed.activity),
    quickReplies: stringList(parsed.quickReplies, 6),
    memorySummary: String(parsed.memorySummary || "").slice(0, 1000),
  };
}

function lines(values) {
  if (!Array.isArray(values)) return "";
  return values.map((value) => `- ${value}`).join("\n");
}

export function formatLesson(lesson) {
  const output = [`# ${lesson.title || "Personalized Lesson"}`];
  if (lesson.topic) output.push(`**Topic:** ${lesson.topic}`);
  if (lesson.level) output.push(`**Level:** ${lesson.level}`);
  if (lesson.objectives?.length) {
    output.push("## Objectives", lines(lesson.objectives));
  }
  if (lesson.review?.length) {
    output.push("## Review Warm-up", lines(lesson.review));
  }
  for (const section of lesson.sections ?? []) {
    if (!section?.title || !section?.content) continue;
    output.push(`## ${section.title}`, String(section.content));
  }
  if (lesson.vocabulary?.length) {
    output.push(
      "## Vocabulary",
      lesson.vocabulary
        .map((item) => {
          const example = item.example ? ` — ${item.example}` : "";
          return `- **${item.word}**: ${item.translation}${example}`;
        })
        .join("\n"),
    );
  }
  if (lesson.exercises?.length) {
    output.push("## Practice", lines(lesson.exercises));
  }
  if (lesson.answerKey?.length) {
    output.push("## Answer Key", lines(lesson.answerKey));
  }
  if (lesson.homework) output.push("## Next Step", String(lesson.homework));
  return output.join("\n\n");
}

export function formatReview(review) {
  const output = [review.feedback || "Answer reviewed."];
  if (Number.isFinite(Number(review.score))) {
    output.push(`**Score:** ${Number(review.score)}/5`);
  }
  if (review.correctedAnswer) {
    output.push(`**Corrected answer:** ${review.correctedAnswer}`);
  }
  if (review.strengths?.length) {
    output.push(`**Strengths:** ${review.strengths.join(", ")}`);
  }
  if (review.weaknesses?.length) {
    output.push(`**Focus next:** ${review.weaknesses.join(", ")}`);
  }
  if (review.followUpExercise) {
    output.push(`**Follow-up:** ${review.followUpExercise}`);
  }
  return output.join("\n\n");
}
