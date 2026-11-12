import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { database, transaction } from '../src/db.js';

export async function migrate(pool) {
  await transaction(pool, async client => {
    await client.query("SELECT pg_advisory_xact_lock(78201342)");
    await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())');
    const dir = new URL('../migrations/', import.meta.url);
    for (const name of (await readdir(dir)).filter(n => n.endsWith('.sql')).sort()) {
      if ((await client.query('SELECT name FROM schema_migrations WHERE name=$1', [name])).rowCount) continue;
      await client.query(await readFile(new URL(name, dir), 'utf8'));
      await client.query('INSERT INTO schema_migrations(name) VALUES($1)', [name]);
    }
  });
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const pool = database();
  try { await migrate(pool); console.log('Database migrations applied.'); }
  catch { console.error('Migration failed. Check database connectivity and migration compatibility.'); process.exitCode = 1; }
  finally { await pool.end(); }
}
