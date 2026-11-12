import { createHash } from 'node:crypto';
import { transaction } from './db.js';
import { ApiError } from './errors.js';
import { legacyVocabularyStatus, vocabularySchema } from './validation.js';

export const record = row => ({ kind: row.kind, key: row.key,
  data: row.kind === 'vocabulary' && !row.deleted ? { ...row.data,
    status: row.data.status ?? legacyVocabularyStatus(row.data), statusChangedAt: row.data.statusChangedAt ?? 0 } : row.data,
  deleted: row.deleted, revision: Number(row.revision) });
export async function lockUser(client, userId) {
  // Serialize writes per user: a revision cursor may never skip an uncommitted
  // lower revision. Users still synchronize independently.
  await client.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [userId]);
}
export async function putRecord(client, userId, kind, key, data, deleted = false) {
  if (kind === 'vocabulary' && !deleted) data = vocabularySchema.parse(data);
  const { rows } = await client.query(`INSERT INTO learning_records(user_id,kind,key,data,deleted)
    VALUES($1,$2,$3,$4,$5) ON CONFLICT(user_id,kind,key) DO UPDATE SET data=CASE
      WHEN EXCLUDED.kind='progress' AND NOT EXCLUDED.deleted AND NOT learning_records.deleted THEN
        EXCLUDED.data || jsonb_build_object('completed',
          COALESCE((learning_records.data->>'completed')::boolean,false) OR (EXCLUDED.data->>'completed')::boolean)
      ELSE EXCLUDED.data END,
    deleted=EXCLUDED.deleted,revision=nextval('learning_records_revision_seq'),updated_at=now() RETURNING *`,
  [userId, kind, key, data, deleted]);
  return record(rows[0]);
}
export async function synchronize(pool, userId, input) {
  return transaction(pool, async client => {
    await lockUser(client, userId);
    const acknowledged = [];
    for (const op of input.operations) {
      const fingerprint = createHash('sha256').update(JSON.stringify(op)).digest('hex');
      const inserted = await client.query(`INSERT INTO sync_operations(user_id,operation_id,fingerprint)
        VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING operation_id`, [userId, op.id, fingerprint]);
      if (inserted.rowCount) await putRecord(client, userId, op.kind, op.key, op.data, op.deleted);
      else {
        const { rows } = await client.query('SELECT fingerprint FROM sync_operations WHERE user_id=$1 AND operation_id=$2', [userId, op.id]);
        if (rows[0].fingerprint !== fingerprint) throw new ApiError(409, 'OPERATION_CONFLICT', 'Operation ID was already used for different data.');
      }
      acknowledged.push(op.id);
    }
    const { rows: watermark } = await client.query('SELECT COALESCE(MAX(revision),0) AS revision FROM learning_records WHERE user_id=$1', [userId]);
    const latest = Number(watermark[0].revision);
    if (input.cursor > latest) throw new ApiError(409, 'CURSOR_INVALID', 'Reset the synchronization cursor to zero.');
    const { rows } = await client.query(`SELECT * FROM learning_records WHERE user_id=$1 AND revision>$2
      ORDER BY revision LIMIT 501`, [userId, input.cursor]);
    const hasMore = rows.length > 500;
    const records = rows.slice(0, 500).map(record);
    return { acknowledged, records, hasMore, cursor: hasMore ? records.at(-1).revision : latest };
  });
}
