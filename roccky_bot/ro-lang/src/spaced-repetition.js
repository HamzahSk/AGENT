function clampQuality(quality) {
  const number = Number(quality);
  if (!Number.isFinite(number) || number < 0 || number > 5) {
    throw new Error("Review quality must be a number from 0 to 5.");
  }
  return Math.round(number);
}

function addDays(date, days) {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

export function createVocabularyItem(
  {
    word,
    translation,
    example = "",
    pronunciation = "",
    language = "Undetermined",
    languageKey = "undetermined",
    list = "general",
    tags = [],
  },
  now = new Date(),
) {
  if (!word?.trim()) throw new Error("Vocabulary word is required.");
  if (!translation?.trim()) throw new Error("Vocabulary translation is required.");

  const timestamp = now.toISOString();
  const wordKey = word.trim().toLocaleLowerCase();
  const tagValues = Array.isArray(tags) ? tags : String(tags || "").split(",");
  return {
    key: `${languageKey}:${wordKey}`,
    wordKey,
    word: word.trim(),
    translation: translation.trim(),
    example: example.trim(),
    pronunciation: String(pronunciation || "").trim(),
    language,
    languageKey,
    list: list.trim() || "general",
    tags: [...new Set(tagValues.map((tag) => String(tag).trim()).filter(Boolean))],
    status: "learning",
    repetitions: 0,
    intervalDays: 0,
    easeFactor: 2.5,
    nextReviewAt: timestamp,
    lastReviewedAt: null,
    correctCount: 0,
    incorrectCount: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function scheduleVocabularyReview(item, quality, now = new Date()) {
  quality = clampQuality(quality);

  let repetitions = item.repetitions ?? 0;
  let intervalDays = item.intervalDays ?? 0;
  let easeFactor = item.easeFactor ?? 2.5;

  if (quality < 3) {
    repetitions = 0;
    intervalDays = 1;
  } else {
    repetitions += 1;
    if (repetitions === 1) intervalDays = 1;
    else if (repetitions === 2) intervalDays = 6;
    else intervalDays = Math.max(1, Math.round(intervalDays * easeFactor));
  }

  easeFactor = Math.max(
    1.3,
    easeFactor + 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02),
  );

  const mastered = repetitions >= 5 && intervalDays >= 30;
  return {
    ...item,
    repetitions,
    intervalDays,
    easeFactor: Number(easeFactor.toFixed(2)),
    nextReviewAt: addDays(now, intervalDays).toISOString(),
    lastReviewedAt: now.toISOString(),
    correctCount: (item.correctCount ?? 0) + (quality >= 3 ? 1 : 0),
    incorrectCount: (item.incorrectCount ?? 0) + (quality < 3 ? 1 : 0),
    status: mastered ? "mastered" : "learning",
    updatedAt: now.toISOString(),
  };
}
