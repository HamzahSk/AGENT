# Ro-Lang server

An independent Node.js REST API for Ro-Lang Android. Express runs locally and as a
Vercel Node function. PostgreSQL stores published stories, complete multilingual
dictionary data, accounts, reading positions, saved words, SRS schedules, review
events, and preferences. No writable filesystem or in-memory state is needed in
production. English (`en`), Indonesian (`id`), and Filipino/Tagalog (`tl`) are
required for every published story. Each story has an exact CEFR difficulty
`A1`–`C2`; Android maps these to its existing three difficulty bands.

## Local development

Requirements: Node.js 22 or newer and PostgreSQL 16 or newer. Use a dedicated
development database and provide `DATABASE_URL` through your shell or a private
`.env` file. The application does not automatically load `.env`; Node can load it
with `--env-file=.env`. `.env.example` contains placeholders only.

```sh
npm ci
node --env-file=.env scripts/migrate.js
node --env-file=.env scripts/seed.js
node --env-file=.env src/local.js
```

Alternatively export the database settings and use `npm run migrate`, `npm run
seed`, and `npm run dev`. PostgreSQL's `PGHOST`, `PGPORT`, `PGDATABASE`, and `PGUSER`
settings also work for local development when `DATABASE_URL` is absent. The
default port is 3000. `GET /api/v1/health` checks database connectivity.

Migrations run atomically under an advisory lock and are tracked in
`schema_migrations`. Run migrations before serving a new deployment. Seeding is
optional and idempotent; it inserts nine bundled multilingual story variants with
complete dictionary coverage and never replaces existing stories. Samples in
`data/sample-stories.json` are self-contained; this project does not need the
Android directory at runtime or during deployment.

## Deploy to Vercel

1. Create a PostgreSQL database with Neon, Supabase, or another managed provider.
   Use its **pooled connection URL** and the provider's TLS configuration. A direct
   connection URL can be used separately when running migrations.
2. Import the repository into Vercel and set **Root Directory** to
   `rolang-server`. Use the **Other** framework preset, `npm ci` for the install
   command, and leave build command/output directory unset. Node.js 22 or 24 is
   supported. `vercel.json` routes requests to the default export in
   `api/index.js` and gives it a 30-second execution budget.
3. Set `DATABASE_URL` in the appropriate Vercel environment. Optional variables
   are `DATABASE_POOL_SIZE` (default 3, range 1–10), `SESSION_DAYS` (default 30,
   range 1–90), and `CORS_ORIGINS` (comma-separated browser origins). Android does
   not require CORS. Do not put secrets into Vercel JSON or app configuration.
4. From a trusted shell with the target database configuration, run the migration
   command above, then optionally seed. Deploy using Vercel's dashboard or CLI.
   Migrations are intentionally separate from requests and build steps.
5. Check `https://YOUR-DEPLOYMENT.vercel.app/api/v1/health` and `/api/v1/stories`.
   Set that deployment origin in `../rolang-app/config.json` and enable online
   features. Vercel deployment protection must allow Android API access.
6. Register a learner account, then promote the intended editor from a trusted
   database-connected shell: `npm run admin -- editor@example.com`. Public
   registration always creates learners. Use the normal login endpoint to obtain
   an editor session and authorize requests with `Authorization: Bearer TOKEN`.

The server reuses a small connection pool in warm functions. Provider pooling
limits connection pressure across function instances. The database must be
reachable from Vercel and should be geographically near the deployment. Never
disable certificate verification to work around a connection failure.

## API contract

All routes use `/api/v1`. Bodies are JSON, limited to 2 MB. Success responses are
JSON except logout/deletes (204). Errors use
`{"error":{"code":"VALIDATION_ERROR","message":"...","fields":[]}}`.
Validation errors are 400, authentication 401, permissions 403, missing stories
404, conflicts 409, oversized bodies 413, auth rate limits 429, and temporary
database failures 503. Internal SQL and connection details are never returned.

| Method and path | Behavior | Access |
| --- | --- | --- |
| `GET /health` | Database readiness | Public |
| `GET /stories` | Published summaries; filters `language`, `category`, `difficulty`; pagination `limit` (1–100), `after` | Public |
| `GET /stories/:id` | Full translated story and vocabulary | Public, published only |
| `GET /stories/:id/translations?language=id` | Title, summary, and passage translations | Public |
| `GET /stories/:id/vocabulary?language=en` | Dictionary entries, optionally filtered | Public |
| `POST /auth/register` | `{email,password,displayName}`; returns `{token,expiresAt,user}` | Public |
| `POST /auth/login` | `{email,password}`; same response | Public |
| `POST /auth/logout` | Revoke current session | Signed in |
| `GET /me`, `PUT /me` | Account profile; update `{displayName}` | Signed in |
| `GET /me/progress`, `GET /me/history` | Reading positions and completion | Signed in |
| `GET /me/vocabulary`, `GET /me/reviews`, `GET /me/preferences` | Learning records | Signed in |
| `PUT /me/{progress,vocabulary,reviews,preferences}/:key` | Replace one validated record | Signed in |
| `DELETE /me/{progress,vocabulary,reviews,preferences}/:key` | Write a synchronization tombstone | Signed in |
| `POST /me/sync` | Upload operations and retrieve revision changes | Signed in |
| `GET /admin/stories` | Drafts and published content, paginated | Administrator |
| `POST /stories` | Create a draft using the sample-story format | Administrator |
| `PUT /stories/:id` | Replace full story, preserving publication status | Administrator |
| `POST /stories/:id/publish` | `{published:true}` or `{published:false}` | Administrator |
| `DELETE /stories/:id` | Delete story without deleting learner history | Administrator |

Learning list endpoints return `{records,next}` and accept `after` (record key) and
`limit` (1–500, default 100). Story lists return `{stories,next}`. Follow `next`
until it is null. Sample story data demonstrates the authoring contract. The API
requires nonempty translations and dictionary coverage for every word in every
passage before accepting story creation or replacement.

Passwords are 12–128 characters and hashed with salted scrypt. Bearer tokens are
random 256-bit values; only their SHA-256 hashes are stored. Tokens expire and can
be revoked. Database-backed 15-minute limits apply across Vercel instances (20
attempts per email, 100 per IP). Account roles are checked on every request.

### Synchronization

```json
{
  "cursor": 0,
  "operations": [{
    "id": "00000000-0000-4000-8000-000000000001",
    "kind": "progress",
    "key": "market_beginner:en",
    "deleted": false,
    "data": {"storyId":"market_beginner","language":"en","sentence":1,"completed":false}
  }]
}
```

The response contains `acknowledged` operation IDs, `records` with revisions,
`cursor`, and `hasMore`. Send at most 100 operations per request. Follow `hasMore`
with the returned cursor; downloads contain up to 500 records per page. An invalid
cursor returns `CURSOR_INVALID`; reset to zero and retry. Commit downloaded records
and the cursor together locally. Remove acknowledged operations only if their IDs
still match the uploaded snapshot.

Keys are `storyId:language` for progress,
`language:reference:storyId:normalizedWord` for vocabulary, a UUID for each review,
and `preferences` for learning preferences. `src/validation.js` defines the complete
record shapes, including SRS fields and review `vocabularyKey`. Deletions use
`deleted:true,data:null` and are retained for offline devices.

Conflicting writes use **server arrival order**, per record. A retried operation
ID cannot overwrite a newer change; reusing its ID with different data returns
409. Transactions serialize writes per user so committed revision cursors never
skip a concurrent write. Android keeps pending local edits when applying downloads,
then uploads them on the next pass. Completion is also preserved locally when
rereading. This is record replacement rather than a merge of competing SRS
answers: simultaneous reviews of the same word retain separate review events,
while the last schedule accepted by the server wins. Completed reading remains
completed across rereads and devices until an explicit progress deletion.

## Validation and operations

```sh
# Against a dedicated disposable database with configuration already supplied:
npm test
npm run check
npm audit --omit=dev
```

Tests exercise real PostgreSQL migrations/seeding, routes, permissions, publishing,
translations, learning persistence, concurrent sync, idempotency, tombstones,
pagination, and error responses. Fixtures delete only their own users/story. Do
not point tests at a production database. No Vercel account is needed for local
tests; deployment still requires the operator's Vercel project and database.

Back up the database. Periodically remove expired `sessions` and `auth_attempts`
rows using a database maintenance job. Retain learning tombstones and
`sync_operations` until a device-expiration policy is implemented; pruning them
early permits stale offline replays. Profile switching on Android is deliberately
restricted to the original account for each local library, preventing cross-account
uploads. Email verification, password recovery, and an editorial web UI are future
features; administrators manage content through the documented API.
