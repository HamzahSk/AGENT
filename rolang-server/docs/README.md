# Ro-Lang backend guide

Ro-Lang pairs an offline Android learning app with an optional REST API. The
backend uses Node.js 22 or 24, Express 5, Zod validation, and PostgreSQL 16+.
Published content supports English (`en`), Indonesian (`id`), and Filipino/Tagalog
(`tl`). No external translation service is required.

## How it works

1. Android reads bundled or downloaded stories and dictionaries from Room.
2. When online features are enabled, it downloads published stories over HTTPS.
3. Learners can register or sign in. Local learning edits enter a durable queue.
4. Android uploads queued changes and downloads server revisions through
   `POST /api/v1/me/sync`. Reading and practice remain available offline.

| Component | Responsibility |
| --- | --- |
| `src/app.js` | REST routes, authorization, responses, and safe errors |
| `src/validation.js` | Story coverage and learning record validation |
| `src/auth.js` | Password hashing, sessions, account roles, and rate limits |
| `src/learning.js` | Transactional records, revisions, and idempotent sync |
| `src/db.js` | Shared PostgreSQL pool and transaction helper |
| `src/local.js` / `api/index.js` | Local HTTP server / Vercel entry point |
| `migrations/`, `scripts/` | Schema upgrades, sample content, editor promotion |
| `data/sample-stories.json` | Nine complete, publishable story variants |

Accounts own learning records and sessions. Stories hold translated content and
their dictionaries as JSONB. Learning references use stable keys, so removing a
story leaves a learner's saved words and reading history intact. See
[Database](DATABASE.md) for the full relationships.

## Run locally

From `rolang-server`, install dependencies and configure a dedicated PostgreSQL
database. Copy the placeholder `.env.example` to a private `.env` and fill it in.
Node does **not** load `.env` automatically.

```sh
npm ci
node --env-file=.env scripts/migrate.js
node --env-file=.env scripts/seed.js
node --env-file=.env src/local.js
```

The default address is `http://localhost:3000`:

```sh
curl http://localhost:3000/api/v1/health
curl 'http://localhost:3000/api/v1/stories?limit=2'
```

Migrations run atomically and are safe to rerun. Seeding is optional: it publishes
nine sample stories and skips IDs already present. It never updates existing
content. If configuration is already supplied by your shell, use `npm run migrate`,
`npm run seed`, and `npm run dev` instead.

## Manage content and check changes

Register an account, then promote the intended editor from a trusted shell with
database configuration available:

```sh
node --env-file=.env scripts/admin.js editor@example.com
```

The role is named `admin`; it grants access to content authoring. Normal
registration always creates learners. Use [Stories](STORIES.md) for the complete
create/edit/publish flow, and [API](API.md) for authentication and requests.

Run checks against a **disposable test database**, with its settings supplied:

```sh
npm test
npm run check
npm audit --omit=dev
```

Tests use real PostgreSQL and cover migrations, content, authentication, access
control, sync, pagination, vocabulary statuses, and legacy records. Do not run
them against production. See [Deployment](DEPLOYMENT.md) to connect Android or
deploy to Vercel, and [Learning system](LEARNING_SYSTEM.md) for offline behavior.

- [Stories](STORIES.md)
- [API](API.md)
- [Database](DATABASE.md)
- [Learning system](LEARNING_SYSTEM.md)
- [Deployment](DEPLOYMENT.md)
