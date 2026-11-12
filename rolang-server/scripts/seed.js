import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { database, transaction } from '../src/db.js';
import { storySchema } from '../src/validation.js';

export async function seed(pool) {
  const samples = JSON.parse(await readFile(new URL('../data/sample-stories.json', import.meta.url), 'utf8'));
  await transaction(pool, async client => {
    for (const sample of samples) {
      const story = storySchema.parse(sample);
      const { vocabulary, ...content } = story;
      await client.query(`INSERT INTO stories(id,family,category,difficulty,status,content,vocabulary)
        VALUES($1,$2,$3,$4,'published',$5,$6) ON CONFLICT(id) DO NOTHING`,
      [story.id, story.family, story.category, story.difficulty, content, JSON.stringify(vocabulary)]);
    }
  });
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const pool = database();
  try { await seed(pool); console.log('Sample stories seeded without replacing existing content.'); }
  catch { console.error('Seed failed. Apply migrations first and check sample data.'); process.exitCode = 1; }
  finally { await pool.end(); }
}
