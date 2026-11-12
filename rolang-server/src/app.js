import express from 'express';
import { z, ZodError } from 'zod';
import { database, transaction } from './db.js';
import { ApiError, missing } from './errors.js';
import { authentication, administrator, hashPassword, verifyPassword, session, rateLimit, randomUUID } from './auth.js';
import { storySchema, levelFor, registration, login, catalogQuery, identifier,
  language, schemas, syncSchema, operationSchema } from './validation.js';
import { synchronize, lockUser, putRecord, record } from './learning.js';

const publicStory = (row, includeVocabulary = false) => ({ ...row.content,
  level: levelFor(row.difficulty), status: row.status, updatedAt: row.updated_at.toISOString(),
  ...(includeVocabulary ? { vocabulary: row.vocabulary } : {}) });
const storySummary = row => {
  const { sentences, ...summary } = publicStory(row);
  return summary;
};
// Vercel overwrites this header at its edge. Do not trust client-supplied
// forwarding headers on a standalone Node server.
const clientIp = req => process.env.VERCEL === '1'
  ? (req.get('x-vercel-forwarded-for')?.split(',')[0].trim() || req.ip || 'unknown')
  : (req.ip || 'unknown');

export function createApp(pool = database()) {
  const app = express();
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.set({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    const origins = (process.env.CORS_ORIGINS ?? '').split(',').map(s => s.trim()).filter(Boolean);
    const origin = req.get('origin');
    if (origin && origins.includes(origin)) {
      res.set({ 'Access-Control-Allow-Origin': origin, Vary: 'Origin',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS' });
    }
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });
  app.use(express.json({ limit: '2mb', strict: true }));
  const api = express.Router();
  const auth = authentication(pool);
  api.get('/health', async (_req, res) => {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', apiVersion: 'v1' });
  });
  api.post('/auth/register', async (req, res) => {
    const input = registration.parse(req.body);
    await rateLimit(pool, input.email, clientIp(req));
    const passwordHash = await hashPassword(input.password);
    const result = await transaction(pool, async client => {
      const { rows } = await client.query(`INSERT INTO users(id,email,password_hash,display_name)
        VALUES($1,$2,$3,$4) RETURNING id,email,display_name,role`,
      [randomUUID(), input.email, passwordHash, input.displayName]);
      return session(client, rows[0]);
    });
    res.status(201).json(result);
  });
  api.post('/auth/login', async (req, res) => {
    const input = login.parse(req.body);
    await rateLimit(pool, input.email, clientIp(req));
    const { rows } = await pool.query('SELECT * FROM users WHERE email=$1', [input.email]);
    // Run the same expensive KDF for unknown emails to reduce timing disclosure.
    const valid = await verifyPassword(input.password, rows[0]?.password_hash ?? `scrypt:${'0'.repeat(32)}:${'0'.repeat(128)}`);
    if (!rows.length || !valid) throw new ApiError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
    res.json(await session(pool, rows[0]));
  });
  api.post('/auth/logout', auth, async (req, res) => {
    await pool.query('DELETE FROM sessions WHERE token_hash=$1', [req.tokenHash]); res.sendStatus(204);
  });
  api.get('/me', auth, async (req, res) => {
    res.json({ id: req.user.id, email: req.user.email, displayName: req.user.display_name, role: req.user.role });
  });
  api.put('/me', auth, async (req, res) => {
    const input = z.object({ displayName: z.string().trim().min(1).max(100) }).strict().parse(req.body);
    await pool.query('UPDATE users SET display_name=$2 WHERE id=$1', [req.user.id, input.displayName]);
    res.json({ id: req.user.id, displayName: input.displayName });
  });
  api.get('/stories', async (req, res) => {
    const query = catalogQuery.parse(req.query);
    const { rows } = await pool.query(`SELECT * FROM stories WHERE status='published'
      AND ($1::text IS NULL OR content->'title' ? $1)
      AND ($2::text IS NULL OR category=$2) AND ($3::text IS NULL OR difficulty=$3)
      AND ($4::text IS NULL OR id>$4) ORDER BY id LIMIT $5`,
    [query.language ?? null, query.category ?? null, query.difficulty ?? null, query.after ?? null, query.limit + 1]);
    const hasMore = rows.length > query.limit;
    const items = rows.slice(0, query.limit);
    res.json({ stories: items.map(storySummary), next: hasMore ? items.at(-1).id : null });
  });
  async function publishedStory(req) {
    const id = identifier.parse(req.params.id);
    const { rows } = await pool.query("SELECT * FROM stories WHERE id=$1 AND status='published'", [id]);
    if (!rows.length) throw missing();
    return rows[0];
  }
  api.get('/stories/:id', async (req, res) => res.json(publicStory(await publishedStory(req), true)));
  api.get('/stories/:id/translations', async (req, res) => {
    const code = language.parse(req.query.language);
    const row = await publishedStory(req);
    res.json({ language: code, title: row.content.title[code], summary: row.content.summary[code],
      sentences: row.content.sentences.map(sentence => sentence[code]) });
  });
  api.get('/stories/:id/vocabulary', async (req, res) => {
    const code = language.optional().parse(req.query.language);
    const row = await publishedStory(req);
    res.json({ vocabulary: row.vocabulary.filter(item => !code || item.language === code) });
  });
  api.get('/admin/stories', auth, administrator, async (req, res) => {
    const { limit, after } = catalogQuery.pick({ limit: true, after: true }).parse(req.query);
    const { rows } = await pool.query('SELECT * FROM stories WHERE ($1::text IS NULL OR id>$1) ORDER BY id LIMIT $2', [after ?? null, limit + 1]);
    const items = rows.slice(0, limit);
    res.json({ stories: items.map(row => publicStory(row, true)), next: rows.length > limit ? items.at(-1).id : null });
  });
  api.post('/stories', auth, administrator, async (req, res) => {
    const story = storySchema.parse(req.body);
    const { vocabulary, ...content } = story;
    const { rows } = await pool.query(`INSERT INTO stories(id,family,category,difficulty,content,vocabulary)
      VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,
    [story.id, story.family, story.category, story.difficulty, content, JSON.stringify(vocabulary)]);
    res.status(201).json(publicStory(rows[0], true));
  });
  api.put('/stories/:id', auth, administrator, async (req, res) => {
    const story = storySchema.parse(req.body);
    if (identifier.parse(req.params.id) !== story.id) throw new ApiError(400, 'INVALID_ID', 'Story ID cannot change.');
    const { vocabulary, ...content } = story;
    const { rows } = await pool.query(`UPDATE stories SET family=$2,category=$3,difficulty=$4,
      content=$5,vocabulary=$6,updated_at=now() WHERE id=$1 RETURNING *`,
    [story.id, story.family, story.category, story.difficulty, content, JSON.stringify(vocabulary)]);
    if (!rows.length) throw missing();
    res.json(publicStory(rows[0], true));
  });
  api.post('/stories/:id/publish', auth, administrator, async (req, res) => {
    const { published } = z.object({ published: z.boolean() }).strict().parse(req.body);
    const { rows } = await pool.query('UPDATE stories SET status=$2,updated_at=now() WHERE id=$1 RETURNING *',
      [identifier.parse(req.params.id), published ? 'published' : 'draft']);
    if (!rows.length) throw missing(); res.json(publicStory(rows[0], true));
  });
  api.delete('/stories/:id', auth, administrator, async (req, res) => {
    if (!(await pool.query('DELETE FROM stories WHERE id=$1', [identifier.parse(req.params.id)])).rowCount) throw missing();
    res.sendStatus(204);
  });

  api.post('/me/sync', auth, async (req, res) => res.json(await synchronize(pool, req.user.id, syncSchema.parse(req.body))));
  for (const [path, kind] of [['progress', 'progress'], ['vocabulary', 'vocabulary'], ['reviews', 'review'], ['preferences', 'profile']]) {
    api.get(`/me/${path}`, auth, async (req, res) => {
      const query = z.object({ after: z.string().max(512).optional(),
        limit: z.coerce.number().int().min(1).max(500).default(100) }).strict().parse(req.query);
      const { rows } = await pool.query(`SELECT * FROM learning_records WHERE user_id=$1 AND kind=$2 AND NOT deleted
        AND ($3::text IS NULL OR key>$3) ORDER BY key LIMIT $4`, [req.user.id, kind, query.after ?? null, query.limit + 1]);
      const items = rows.slice(0, query.limit).map(record);
      res.json({ records: items, next: rows.length > query.limit ? items.at(-1).key : null });
    });
    api.put(`/me/${path}/:key`, auth, async (req, res) => {
      const data = schemas[kind].parse(req.body);
      const key = z.string().min(1).max(512).parse(req.params.key);
      operationSchema.parse({ id: randomUUID(), kind, key, data, deleted: false });
      const result = await transaction(pool, async client => {
        await lockUser(client, req.user.id); return putRecord(client, req.user.id, kind, key, data);
      });
      res.json(result);
    });
    api.delete(`/me/${path}/:key`, auth, async (req, res) => {
      const key = z.string().min(1).max(512).parse(req.params.key);
      operationSchema.parse({ id: randomUUID(), kind, key, data: null, deleted: true });
      await transaction(pool, async client => {
        await lockUser(client, req.user.id); await putRecord(client, req.user.id, kind, key, null, true);
      }); res.sendStatus(204);
    });
  }
  api.get('/me/history', auth, async (req, res) => {
    const query = z.object({ after: z.string().max(512).optional(),
      limit: z.coerce.number().int().min(1).max(500).default(100) }).strict().parse(req.query);
    const { rows } = await pool.query(`SELECT * FROM learning_records WHERE user_id=$1 AND kind='progress'
      AND NOT deleted AND ($2::text IS NULL OR key>$2) ORDER BY key LIMIT $3`, [req.user.id, query.after ?? null, query.limit + 1]);
    const items = rows.slice(0, query.limit).map(record);
    res.json({ records: items, next: rows.length > query.limit ? items.at(-1).key : null });
  });
  app.use('/api/v1', api);
  app.use((_req, _res, next) => next(missing()));
  app.use((error, _req, res, _next) => {
    if (error instanceof ZodError) return res.status(400).json({ error: { code: 'VALIDATION_ERROR',
      message: 'Request validation failed.', fields: error.issues.map(issue => ({ path: issue.path.join('.'), message: issue.message })) } });
    if (error instanceof ApiError) return res.status(error.status).json({ error: { code: error.code, message: error.message } });
    if (error.type === 'entity.parse.failed') return res.status(400).json({ error: { code: 'INVALID_JSON', message: 'Send a valid JSON object.' } });
    if (error.type === 'entity.too.large') return res.status(413).json({ error: { code: 'BODY_TOO_LARGE', message: 'Request body exceeds 2 MB.' } });
    if (error.code === '23505') return res.status(409).json({ error: { code: 'ALREADY_EXISTS', message: 'This resource already exists.' } });
    // Do not serialize database errors: they can contain connection details or SQL values.
    res.status(503).json({ error: { code: 'SERVICE_UNAVAILABLE', message: 'The server is temporarily unavailable. Try again later.' } });
  });
  return app;
}
