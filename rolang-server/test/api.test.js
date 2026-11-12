import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import request from 'supertest';
import { database } from '../src/db.js';
import { createApp } from '../src/app.js';
import { migrate } from '../scripts/migrate.js';
import { seed } from '../scripts/seed.js';

// Use a dedicated disposable database. The suite only removes its own fixture
// users and story; it never truncates application tables.
const pool = database();
const app = createApp(pool);
const run = randomUUID();
const accounts = [];
const testStoryId = `test_${run.replaceAll('-', '')}`;
let learner, other, admin;
before(async () => {
  await migrate(pool); await migrate(pool); await seed(pool); await seed(pool);
  for (const role of ['learner', 'other', 'admin']) {
    const email = `${role}.${run}@example.test`;
    const response = await request(app).post('/api/v1/auth/register').send({ email,
      password: 'test-fixture-password', displayName: role }).expect(201);
    accounts.push(response.body.user.id);
    if (role === 'learner') learner = response.body;
    if (role === 'other') other = response.body;
    if (role === 'admin') admin = response.body;
  }
  await pool.query("UPDATE users SET role='admin' WHERE id=$1", [admin.user.id]);
});
after(async () => {
  await pool.query('DELETE FROM stories WHERE id=$1', [testStoryId]);
  await pool.query('DELETE FROM users WHERE id=ANY($1::uuid[])', [accounts]);
  await pool.end();
});
const bearer = account => `Bearer ${account.token}`;
const progress = { storyId: 'market_beginner', language: 'en', sentence: 1, completed: false };
const operation = (data = progress) => ({ id: randomUUID(), kind: 'progress', key: 'market_beginner:en', data, deleted: false });

test('catalog, filters, complete detail, translation, and vocabulary use the Android corpus contract', async () => {
  await request(app).get('/api/v1/health').expect(200);
  const response = await request(app).get('/api/v1/stories?language=tl&difficulty=A1&category=Everyday%20life&limit=1').expect(200);
  assert.equal(response.body.stories.length, 1);
  assert.equal(response.body.stories[0].level, 'BEGINNER');
  const id = response.body.stories[0].id;
  const detail = await request(app).get(`/api/v1/stories/${id}`).expect(200);
  assert.ok(detail.body.vocabulary.length);
  assert.ok(detail.body.sentences[0].tl);
  const translations = await request(app).get(`/api/v1/stories/${id}/translations?language=id`).expect(200);
  assert.equal(translations.body.sentences[0], detail.body.sentences[0].id);
  const vocabulary = await request(app).get(`/api/v1/stories/${id}/vocabulary?language=en`).expect(200);
  assert.ok(vocabulary.body.vocabulary.every(word => word.language === 'en'));
  const page = await request(app).get('/api/v1/stories?limit=2').expect(200);
  const second = await request(app).get(`/api/v1/stories?limit=2&after=${page.body.next}`).expect(200);
  assert.ok(second.body.stories.every(s => s.id > page.body.next));
});

test('authentication validates requests, isolates roles, revokes sessions, and rejects privilege escalation', async () => {
  await request(app).get('/api/v1/me').expect(401);
  await request(app).post('/api/v1/auth/register').send({ email: 'bad', password: 'short', role: 'admin' }).expect(400);
  await request(app).post('/api/v1/auth/register').send({ email: learner.user.email,
    password: 'test-fixture-password', displayName: 'Duplicate' }).expect(409);
  await request(app).post('/api/v1/auth/login').send({ email: learner.user.email, password: 'wrong-password-value' }).expect(401);
  const login = await request(app).post('/api/v1/auth/login').send({ email: learner.user.email.toUpperCase(),
    password: 'test-fixture-password' }).expect(200);
  await request(app).get('/api/v1/me').set('Authorization', `Bearer ${login.body.token}`).expect(200);
  await request(app).post('/api/v1/auth/logout').set('Authorization', `Bearer ${login.body.token}`).expect(204);
  await request(app).get('/api/v1/me').set('Authorization', `Bearer ${login.body.token}`).expect(401);
  assert.ok(!('password_hash' in login.body.user));
  await request(app).get('/api/v1/admin/stories').set('Authorization', bearer(learner)).expect(403);
  await pool.query("UPDATE sessions SET expires_at=now()-interval '1 second' WHERE user_id=$1", [other.user.id]);
  await request(app).get('/api/v1/me').set('Authorization', bearer(other)).expect(401);
  other = (await request(app).post('/api/v1/auth/login').send({ email: other.user.email,
    password: 'test-fixture-password' }).expect(200)).body;
});

test('administrators create, edit, publish, unpublish, and delete fully translated stories', async () => {
  const sample = JSON.parse(await readFile(new URL('../data/sample-stories.json', import.meta.url), 'utf8'))[0];
  const story = { ...sample, id: testStoryId };
  await request(app).post('/api/v1/stories').set('Authorization', bearer(learner)).send(story).expect(403);
  await request(app).post('/api/v1/stories').set('Authorization', bearer(admin)).send({ ...story, vocabulary: [] }).expect(400);
  await request(app).post('/api/v1/stories').set('Authorization', bearer(admin)).send(story).expect(201);
  await request(app).get(`/api/v1/stories/${testStoryId}`).expect(404);
  await request(app).put(`/api/v1/stories/${testStoryId}`).set('Authorization', bearer(admin)).send({ ...story, difficulty: 'A2' }).expect(200);
  await request(app).post(`/api/v1/stories/${testStoryId}/publish`).set('Authorization', bearer(admin)).send({ published: true }).expect(200);
  const published = await request(app).get(`/api/v1/stories/${testStoryId}`).expect(200);
  assert.equal(published.body.difficulty, 'A2');
  await request(app).post(`/api/v1/stories/${testStoryId}/publish`).set('Authorization', bearer(admin)).send({ published: false }).expect(200);
  await request(app).get(`/api/v1/stories/${testStoryId}`).expect(404);
  await request(app).delete(`/api/v1/stories/${testStoryId}`).set('Authorization', bearer(admin)).expect(204);
});

test('sync retries are idempotent, concurrent device writes have ordered revisions, and users are isolated', async () => {
  const first = operation();
  const post = input => request(app).post('/api/v1/me/sync').set('Authorization', bearer(learner)).send(input);
  const initial = await post({ cursor: 0, operations: [first] }).expect(200);
  assert.deepEqual(initial.body.acknowledged, [first.id]);
  const retry = await post({ cursor: 0, operations: [first] }).expect(200);
  assert.equal(retry.body.cursor, initial.body.cursor);
  await post({ cursor: 0, operations: [operation({ ...progress, completed: true })] }).expect(200);
  const reread = await post({ cursor: 0, operations: [operation()] }).expect(200);
  assert.equal(reread.body.records[0].data.completed, true);
  await post({ cursor: 0, operations: [{ ...first, data: { ...progress, sentence: 2 } }] }).expect(409);
  const otherData = await request(app).post('/api/v1/me/sync').set('Authorization', bearer(other)).send({ cursor: 0, operations: [] }).expect(200);
  assert.equal(otherData.body.records.length, 0);
  await Promise.all([post({ cursor: initial.body.cursor, operations: [operation({ ...progress, sentence: 2 })] }).expect(200),
    post({ cursor: initial.body.cursor, operations: [operation({ ...progress, completed: true })] }).expect(200)]);
  const latest = await post({ cursor: initial.body.cursor, operations: [] }).expect(200);
  assert.ok(latest.body.cursor > initial.body.cursor);
  assert.equal(latest.body.records.length, 1);
  const staleRetry = await post({ cursor: 0, operations: [first] }).expect(200);
  assert.equal(staleRetry.body.cursor, latest.body.cursor);
  assert.deepEqual(staleRetry.body.records[0].data, latest.body.records[0].data);
  await post({ cursor: latest.body.cursor, operations: [{ id: randomUUID(), kind: 'progress',
    key: first.key, data: null, deleted: true }] }).expect(200);
  const tombstone = await post({ cursor: latest.body.cursor, operations: [] }).expect(200);
  assert.equal(tombstone.body.records[0].deleted, true);
  await post({ cursor: tombstone.body.cursor + 1, operations: [] }).expect(409);
  await post({ cursor: 0, operations: [{ ...operation(), key: 'wrong' }] }).expect(400);
  await post({ cursor: 0, operations: [{ id: randomUUID(), kind: 'vocabulary', key: 'invalid', deleted: true, data: null }] }).expect(400);
});

test('sync download pagination delivers every record and advances cursors without duplicating events', async () => {
  const operations = Array.from({ length: 512 }, (_, i) => ({ id: randomUUID(), kind: 'review', key: randomUUID(),
    deleted: false, data: { vocabularyKey: 'en:id:market_beginner:maya', language: 'en', reference: 'id',
      reviewedAt: 1000 + i, correct: true, rating: 'GOOD' } }));
  for (let i = 0; i < operations.length; i += 100) {
    await request(app).post('/api/v1/me/sync').set('Authorization', bearer(other))
      .send({ cursor: 0, operations: operations.slice(i, i + 100) }).expect(200);
  }
  const first = await request(app).post('/api/v1/me/sync').set('Authorization', bearer(other))
    .send({ cursor: 0, operations: [] }).expect(200);
  assert.equal(first.body.records.length, 500);
  assert.equal(first.body.hasMore, true);
  const second = await request(app).post('/api/v1/me/sync').set('Authorization', bearer(other))
    .send({ cursor: first.body.cursor, operations: [] }).expect(200);
  assert.equal(second.body.records.length, 12);
  assert.equal(second.body.hasMore, false);
  assert.equal(new Set([...first.body.records, ...second.body.records].map(r => r.key)).size, 512);
});

test('authentication rate limits persist across separate application instances', async () => {
  const freshApp = createApp(pool);
  const email = `limited.${run}@example.test`;
  for (let i = 0; i < 20; i++) {
    await request(i % 2 ? freshApp : app).post('/api/v1/auth/login').send({ email, password: 'test-fixture-password' }).expect(401);
  }
  await request(freshApp).post('/api/v1/auth/login').send({ email, password: 'test-fixture-password' }).expect(429);
});

test('learning REST endpoints persist preferences, progress/history, vocabulary and review schedules', async () => {
  const sample = { language: 'en', reference: 'id', word: 'maya', translation: 'Maya', meaning: 'Name',
    partOfSpeech: 'proper noun', explanation: 'Name', example: 'Maya walks.', exampleTranslation: 'Maya berjalan.',
    storyId: 'market_beginner', storyTitle: 'Market', category: 'Everyday life', createdAt: 1000, dueAt: 2000,
    repetitions: 1, intervalDays: 1, ease: 2.5, lapses: 0, mastered: false, lastReviewedAt: 1000 };
  const key = 'en:id:market_beginner:maya';
  const base = '/api/v1/me';
  await request(app).put(`${base}/vocabulary/${encodeURIComponent(key)}`).set('Authorization', bearer(learner)).send(sample).expect(200);
  const words = await request(app).get(`${base}/vocabulary`).set('Authorization', bearer(learner)).expect(200);
  assert.equal(words.body.records[0].data.dueAt, 2000);
  await request(app).put(`${base}/progress/market_beginner:en`).set('Authorization', bearer(learner)).send(progress).expect(200);
  const history = await request(app).get(`${base}/history`).set('Authorization', bearer(learner)).expect(200);
  assert.ok(history.body.records.some(r => r.key === 'market_beginner:en'));
  await request(app).put(`${base}/preferences/preferences`).set('Authorization', bearer(learner)).send({
    target: 'tl', native: 'en', level: 'ADVANCED', fontSize: 24, dark: true }).expect(200);
  await request(app).put(`${base}/reviews/${randomUUID()}`).set('Authorization', bearer(learner)).send({
    vocabularyKey: key, language: 'en', reference: 'id', reviewedAt: 1000, correct: true, rating: 'GOOD' }).expect(200);
  await request(app).get(`${base}/reviews`).set('Authorization', bearer(learner)).expect(200);
  await request(app).delete(`${base}/vocabulary/${encodeURIComponent(key)}`).set('Authorization', bearer(learner)).expect(204);
  assert.equal((await request(app).get(`${base}/vocabulary`).set('Authorization', bearer(learner)).expect(200)).body.records.length, 0);
});

test('invalid filters, malformed JSON, large bodies, and unavailable databases return safe errors', async () => {
  await request(app).get('/api/v1/stories?difficulty=A9').expect(400);
  await request(app).get('/api/v1/stories?limit=-1').expect(400);
  await request(app).post('/api/v1/auth/login').set('Content-Type', 'application/json').send('{').expect(400);
  await request(app).post('/api/v1/auth/login').send({ oversized: 'x'.repeat(2_100_000) }).expect(413);
  const unavailable = createApp({ query: async () => { throw new Error('private connection information'); } });
  const result = await request(unavailable).get('/api/v1/health').expect(503);
  assert.ok(!JSON.stringify(result.body).includes('private'));
  await request(app).get('/api/v1/unknown').expect(404);
});
