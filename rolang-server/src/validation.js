import { z } from 'zod';

export const language = z.enum(['en', 'id', 'tl']);
export const difficulty = z.enum(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']);
export const identifier = z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/);
const text = z.string().trim().min(1).max(10_000);
const translated = z.object({ en: text, id: text, tl: text }).strict();
const word = z.string().min(1).max(120).regex(/^[\p{L}\p{M}]+(?:['-][\p{L}\p{M}]+)*$/u);
const lexeme = z.object({ language, word, translations: translated, meanings: translated,
  pos: text, notes: translated }).strict();
export const levelFor = d => ({ A1: 'BEGINNER', A2: 'BEGINNER', B1: 'INTERMEDIATE',
  B2: 'INTERMEDIATE', C1: 'ADVANCED', C2: 'ADVANCED' })[d];
export const normalizeWord = value => value.toLowerCase().replaceAll('’', "'");
export const storySchema = z.object({
  id: identifier, family: identifier, category: z.string().trim().min(1).max(100), difficulty,
  title: translated, summary: translated,
  sentences: z.array(translated).min(1).max(300), vocabulary: z.array(lexeme).min(1).max(5000),
}).strict().superRefine((story, ctx) => {
  const keys = new Set();
  for (const item of story.vocabulary) {
    const key = `${item.language}:${normalizeWord(item.word)}`;
    if (keys.has(key) || item.word !== normalizeWord(item.word)) {
      ctx.addIssue({ code: 'custom', path: ['vocabulary'], message: 'Vocabulary must contain unique normalized words.' });
    }
    keys.add(key);
  }
  for (const sentence of story.sentences) for (const code of ['en', 'id', 'tl']) {
    const tokens = sentence[code].match(/[\p{L}\p{M}]+(?:['’-][\p{L}\p{M}]+)*/gu) ?? [];
    if (tokens.some(token => !keys.has(`${code}:${normalizeWord(token)}`))) {
      ctx.addIssue({ code: 'custom', path: ['vocabulary'], message: `Missing ${code} dictionary coverage.` });
    }
  }
});
export const registration = z.object({ email: z.email().max(254).transform(s => s.toLowerCase()),
  password: z.string().min(12).max(128), displayName: z.string().trim().min(1).max(100) }).strict();
export const login = registration.pick({ email: true, password: true });
const timestamp = z.number().int().min(0).max(8_640_000_000_000_000);
const nonnegative = z.number().int().min(0).max(1_000_000);
export const progressSchema = z.object({ storyId: identifier, language,
  sentence: z.number().int().min(0).max(299), completed: z.boolean() }).strict();
export const vocabularyStatus = z.enum(['NEW', 'LEARNING', 'ALMOST_MASTERED', 'KNOWN']);
export const legacyVocabularyStatus = v => v.mastered ? 'KNOWN' : v.repetitions >= 3 ? 'ALMOST_MASTERED' : 'LEARNING';
export const vocabularySchema = z.object({
  language, reference: language, word, translation: text, meaning: text, partOfSpeech: text,
  explanation: text, example: text, exampleTranslation: text, storyId: identifier,
  storyTitle: text, category: z.string().min(1).max(100), createdAt: timestamp, dueAt: timestamp,
  repetitions: nonnegative, intervalDays: z.number().int().min(0).max(365),
  ease: z.number().min(1.3).max(100), lapses: nonnegative, mastered: z.boolean(), lastReviewedAt: timestamp,
  status: vocabularyStatus.optional(), statusChangedAt: timestamp.optional(),
}).strict().refine(v => v.word === normalizeWord(v.word), { message: 'Use normalized vocabulary words.' })
  .refine(v => v.status === undefined || (v.status === 'KNOWN') === v.mastered,
    { message: 'Known status and mastered must agree.' })
  .transform(v => ({ ...v, status: v.status ?? legacyVocabularyStatus(v), statusChangedAt: v.statusChangedAt ?? 0 }));
export const reviewSchema = z.object({ vocabularyKey: z.string().min(1).max(512), language,
  reference: language, reviewedAt: timestamp, correct: z.boolean(),
  rating: z.enum(['AGAIN', 'HARD', 'GOOD', 'EASY']) }).strict();
export const profileSchema = z.object({ target: language, native: language,
  level: z.enum(['BEGINNER', 'INTERMEDIATE', 'ADVANCED']), fontSize: z.number().min(16).max(28),
  dark: z.boolean() }).strict();
export const kinds = z.enum(['progress', 'vocabulary', 'review', 'profile']);
export const keyFor = (kind, data) => kind === 'progress' ? `${data.storyId}:${data.language}`
  : kind === 'vocabulary' ? `${data.language}:${data.reference}:${data.storyId}:${data.word}` : 'preferences';
export const schemas = { progress: progressSchema, vocabulary: vocabularySchema, review: reviewSchema, profile: profileSchema };
export const operationSchema = z.object({ id: z.uuid(), kind: kinds,
  key: z.string().min(1).max(512), deleted: z.boolean(), data: z.unknown() }).strict().superRefine((op, ctx) => {
  const validKey = op.kind === 'progress' ? /^[a-zA-Z0-9_-]{1,80}:(en|id|tl)$/.test(op.key)
    : op.kind === 'vocabulary' ? /^(en|id|tl):(en|id|tl):[a-zA-Z0-9_-]{1,80}:[\p{L}\p{M}]+(?:['-][\p{L}\p{M}]+)*$/u.test(op.key)
    : op.kind === 'profile' ? op.key === 'preferences' : z.uuid().safeParse(op.key).success;
  if (!validKey) ctx.addIssue({ code: 'custom', path: ['key'], message: 'Invalid learning record key.' });
  if (op.kind === 'review' && !z.uuid().safeParse(op.key).success) {
    ctx.addIssue({ code: 'custom', path: ['key'], message: 'Review key must be a UUID.' });
  }
  if (op.deleted) {
    if (op.data !== null) ctx.addIssue({ code: 'custom', path: ['data'], message: 'Tombstone data must be null.' });
    return;
  }
  const parsed = schemas[op.kind].safeParse(op.data);
  if (!parsed.success) {
    ctx.addIssue({ code: 'custom', path: ['data'], message: 'Invalid learning record.' });
  } else if (op.kind !== 'review' && keyFor(op.kind, parsed.data) !== op.key) {
    ctx.addIssue({ code: 'custom', path: ['key'], message: 'Key does not match learning record.' });
  }
});
export const syncSchema = z.object({ cursor: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  operations: z.array(operationSchema).max(100) }).strict();
export const catalogQuery = z.object({ language: language.optional(), category: z.string().max(100).optional(),
  difficulty: difficulty.optional(), limit: z.coerce.number().int().min(1).max(100).default(30),
  after: identifier.optional() }).strict();
