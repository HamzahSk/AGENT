import { randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { ApiError } from './errors.js';

const scrypt = promisify(scryptCallback);
const digest = value => createHash('sha256').update(value).digest('hex');
export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const key = await scrypt(password, salt, 64);
  return `scrypt:${salt}:${key.toString('hex')}`;
}
export async function verifyPassword(password, stored) {
  const [, salt, hex] = stored.split(':');
  const key = await scrypt(password, salt, 64);
  const expected = Buffer.from(hex, 'hex');
  return expected.length === key.length && timingSafeEqual(key, expected);
}
export async function session(client, user) {
  const token = randomBytes(32).toString('base64url');
  const days = Math.min(90, Math.max(1, Number(process.env.SESSION_DAYS) || 30));
  const expiresAt = new Date(Date.now() + days * 86_400_000).toISOString();
  await client.query('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,$3)', [digest(token), user.id, expiresAt]);
  return { token, expiresAt, user: { id: user.id, email: user.email, displayName: user.display_name, role: user.role } };
}
export function authentication(pool) {
  return async (req, _res, next) => {
    const match = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(req.get('authorization') ?? '');
    if (!match) throw new ApiError(401, 'UNAUTHENTICATED', 'Sign in to continue.');
    const hash = digest(match[1]);
    const { rows } = await pool.query(`SELECT u.id,u.email,u.display_name,u.role FROM sessions s
      JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now()`, [hash]);
    if (!rows.length) throw new ApiError(401, 'UNAUTHENTICATED', 'Your session has expired. Sign in again.');
    req.user = rows[0]; req.tokenHash = hash; next();
  };
}
export function administrator(req, _res, next) {
  if (req.user.role !== 'admin') throw new ApiError(403, 'FORBIDDEN', 'Administrator access is required.');
  next();
}
export async function rateLimit(client, email, ip) {
  for (const bucket of [`email:${digest(email)}`, `ip:${digest(ip)}`]) {
    const { rows } = await client.query(`INSERT INTO auth_attempts(bucket,expires_at) VALUES($1,now()+interval '15 minutes')
      ON CONFLICT(bucket) DO UPDATE SET attempts=CASE WHEN auth_attempts.expires_at<=now() THEN 1 ELSE auth_attempts.attempts+1 END,
      expires_at=CASE WHEN auth_attempts.expires_at<=now() THEN now()+interval '15 minutes' ELSE auth_attempts.expires_at END
      RETURNING attempts`, [bucket]);
    if (rows[0].attempts > (bucket.startsWith('ip:') ? 100 : 20)) {
      throw new ApiError(429, 'RATE_LIMITED', 'Too many sign-in attempts. Try again in 15 minutes.');
    }
  }
}
export { randomUUID };
