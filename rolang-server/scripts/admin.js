import { database } from '../src/db.js';
// Administrative promotion is deliberately outside the public registration API.
const pool = database();
try {
  if (!process.argv[2]) throw new Error();
  const result = await pool.query("UPDATE users SET role='admin' WHERE email=$1", [process.argv[2].trim().toLowerCase()]);
  if (!result.rowCount) throw new Error();
  console.log('Registered account promoted to administrator.');
} catch { console.error('Promotion failed. Supply the email of an existing account.'); process.exitCode = 1; }
finally { await pool.end(); }
