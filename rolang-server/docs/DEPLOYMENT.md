# Configuration and Vercel deployment

## Server environment

The server reads process environment variables. It does not automatically load
`.env`; use Node's `--env-file=.env` locally. The tracked `.env.example` contains
placeholders only. Production secrets belong in the deployment environment.

| Variable | Default / range | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Provider connection URL | PostgreSQL connection; use a managed pooled endpoint in Vercel |
| `DATABASE_POOL_SIZE` | 3; clamped to 1–10 | Maximum connections per warm function instance |
| `SESSION_DAYS` | 30; clamped to 1–90 | Bearer session lifetime |
| `CORS_ORIGINS` | Empty | Comma-separated allowed browser origins; Android does not need CORS |
| `PORT` | 3000 | Standalone local server port; Vercel supplies its own routing |

When `DATABASE_URL` is absent, node-postgres accepts standard `PGHOST`, `PGPORT`,
`PGDATABASE`, `PGUSER`, and `PGPASSWORD` settings for local development. Use a
dedicated database. Migrations need permission to create tables/indexes; runtime
needs access to application tables and sequences. Follow the provider's verified
TLS configuration. Do not disable certificate checks to fix connectivity.

`VERCEL` is supplied by Vercel itself; the API uses its edge IP header for rate
limiting there and the socket IP locally. Pool timeouts are 5 seconds to connect,
10 seconds idle, and 15 seconds per query. Put the database near the function's
region and use provider pooling to limit connections across function instances.

## Deploy

1. Create a PostgreSQL 16+ database with Neon, Supabase, or another provider. Get
   its pooled URL for runtime and, if needed, a direct URL for migrations.
2. Import the repository in Vercel. Set **Root Directory** to `rolang-server`,
   **Framework Preset** to Other, **Install Command** to `npm ci`, and choose
   Node.js 22 or 24. Leave build command and output directory unset.
3. Set `DATABASE_URL` and any optional settings in the required Vercel environments
   (Preview/Production). The Android config only needs the public server origin.
4. From a trusted database-connected shell, apply migrations before enabling the
   deployment. Optionally seed the sample library:

   ```sh
   node --env-file=.env scripts/migrate.js
   node --env-file=.env scripts/seed.js
   ```

   These run separately from build steps and requests. No migration runs on cold
   start. Repeated seeding skips existing IDs.
5. Deploy using the dashboard or CLI. Existing `vercel.json` routes all paths to
   `api/index.js` with a 30-second function budget. Check public readiness and the
   catalog:

   ```sh
   curl https://YOUR-DEPLOYMENT.vercel.app/api/v1/health
   curl https://YOUR-DEPLOYMENT.vercel.app/api/v1/stories
   ```

6. Register the editor account, then promote it using
   `node --env-file=.env scripts/admin.js editor@example.com` against the target
   database. Use its normal login session to publish content. Verify that Vercel
   deployment protection permits the Android app's API requests.

The app and production function never need writable server files. Content and
learning data persist in PostgreSQL; deploys do not reset them. Run the updated
backend before distributing the status-aware Android build. See
[Database](DATABASE.md) for backups and expired-session maintenance.

## Android config.json

Edit `rolang-app/config.json`, the source Gradle copies into generated app assets:

```json
{
  "serverBaseUrl": "https://YOUR-DEPLOYMENT.vercel.app",
  "apiVersion": "v1",
  "connectionTimeoutMs": 10000,
  "requestTimeoutMs": 30000,
  "onlineEnabled": true,
  "automaticSyncEnabled": true,
  "syncIntervalMinutes": 15,
  "storyPageSize": 30
}
```

| Setting | Rule |
| --- | --- |
| `serverBaseUrl` | HTTPS origin only; no `/api/v1`, credentials, query, or fragment |
| `apiVersion` | `v1` for this server; appended as `/api/v1/` |
| `connectionTimeoutMs`, `requestTimeoutMs` | 1000–120000 ms each; defaults 10000 and 30000 |
| `onlineEnabled` | Defaults false; true enables downloads/account actions |
| `automaticSyncEnabled` | Defaults true; false still permits manual sync and launch-time public refresh |
| `syncIntervalMinutes` | 15–1440; defaults 15; Android battery policies can delay jobs |
| `storyPageSize` | 1–100; defaults 30 |

A complete private app `files/config.json` override takes precedence and is read
at runtime, including worker runs. Invalid settings disable networking while
keeping offline data. Configuration never includes passwords or bearer tokens.
In Android Profile, sign in and use **Sync now**, or use **Refresh stories** while
signed out. Offline mode still supports the bundled stories, word details,
reviews, and local progress.

For an emulator, the development origin is `http://10.0.2.2:3000`.
Configuration accepts HTTP only for `localhost`, `127.0.0.1`, and `10.0.2.2`;
the shipped manifest disables cleartext traffic. Use trusted HTTPS or a
debug-only manifest override for local device testing. Robolectric contract tests
can call a loopback HTTP server without changing the shipping manifest.

Build with JDK 17, SDK platform 35, and Build Tools 35.0.0:

```sh
cd ../rolang-app
bash gradlew :app:testDebugUnitTest :app:lintDebug :app:assembleDebug :app:assembleDebugAndroidTest
# With the local API pointing to a disposable test database:
bash gradlew :app:testDebugUnitTest -ProlangIntegrationUrl=http://127.0.0.1:3000
```

The optional contract test creates a fixture learner and exchanges data between
two Android Room databases using the actual API. Device tests use
`bash gradlew :app:connectedDebugAndroidTest` with an emulator or USB-connected
device. Local tests do not deploy to Vercel.
