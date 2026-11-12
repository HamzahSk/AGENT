import pg from 'pg';

let sharedPool;
export function database() {
  // A small pool is reused within a warm Vercel function. Use the provider's
  // pooled endpoint; never disable TLS certificate verification here.
  return sharedPool ??= new pg.Pool({
    ...(process.env.DATABASE_URL ? { connectionString: process.env.DATABASE_URL } : {}),
    max: Math.max(1, Math.min(10, Number(process.env.DATABASE_POOL_SIZE) || 3)),
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 5_000,
    query_timeout: 15_000,
    allowExitOnIdle: true,
  });
}

export async function transaction(pool, action) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await action(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}
