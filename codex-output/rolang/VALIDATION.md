# Ro-Lang hybrid backend and Android integration

Executed the phases in `prompt.md` sequentially: inspected the existing app,
built the backend and API, added Android configuration, integrated online/offline
storage and synchronization, prepared deployment, and ran project checks.

## Changes

- `../../rolang-server/`: independent Express/PostgreSQL API with Vercel routing,
  versioned SQL migrations, self-contained multilingual story samples, salted
  password hashing, hashed/revocable sessions, database-backed login rate limits,
  administrator story publishing, and validated learning endpoints.
- Revision-based synchronization with durable operation IDs and deletion
  tombstones. Retries preserve later writes, users are isolated, concurrent writes
  are ordered, completed reading survives rereads, and large downloads paginate.
- `../../rolang-app/config.json`: the single server configuration source, copied
  into APK assets. Runtime private-file overrides are supported. Online features
  remain disabled until a deployment origin is configured.
- Android caches complete stories and per-story dictionaries in Room and queues
  vocabulary, reading, review, and preference changes. WorkManager persists
  connected-network jobs and retries outages. Accounts use Keystore-encrypted
  session storage, with Profile controls for registration, sign-in, manual sync,
  and sign-out. Existing learning screens and bundled content remain available.
- Explicit Room version-1 to version-2 migration preserves learning data. Stable
  review and vocabulary keys work across devices and download pages. Incoming
  data preserves newer queued edits, including preferences. The reader safely
  handles older positions when published stories become shorter.
- Server and Android READMEs describe local setup, configuration, deployment,
  API contracts, conflict behavior, and validation commands.

## Validation

| Check | Result |
| --- | --- |
| `rolang-server`: `npm test` against local PostgreSQL 16 | 8 passed |
| `rolang-server`: `npm run check` | Passed |
| Production dependency audit | 0 vulnerabilities |
| Android `:app:testDebugUnitTest` with the actual local server enabled | 21 passed, 0 skipped |
| Android `:app:lintDebug` | 0 errors; 16 non-blocking warnings |
| Android `:app:assembleDebug` | Passed |
| Android `:app:assembleDebugAndroidTest` | Passed |
| APK signature and packaged configuration checks | Passed |
| Official `@vercel/node` 30.0.0 function build | Passed: `nodejs24.x`, `api/index.js`, 461 traced files |
| Root Python regression suite | 18 passed; 1 skipped because optional PyNaCl is absent |
| Working-tree whitespace and package/configuration consistency | Passed |

The 21 Android scenarios include the existing complete Compose learning flow,
offline persistence/corpus/SRS checks, database migration, cached remote content,
failed uploads, tombstones, account isolation, expired authentication, preferences,
edits during uploads, review linking across pages, and shortened-story rendering.
The live contract scenario uses two independent Room databases and the actual
Android HTTP client, Node server, and PostgreSQL database to exchange words,
reading progress, review schedules/events, and deletions.

Reproduce the live contract test by starting the backend against a disposable
database, then running in `rolang-app`:

```sh
./gradlew :app:testDebugUnitTest :app:lintDebug :app:assembleDebug :app:assembleDebugAndroidTest \
  -ProlangIntegrationUrl=http://127.0.0.1:3000
```

The official Vercel packaging check can be reproduced from the repository root:

```sh
npm install --prefix /tmp/rolang-builder @vercel/node --cache /tmp/rolang-npm --logs-max=0
node codex-output/rolang/verify-vercel-build.cjs /tmp/rolang-builder
```

Run `npm ci` in the server first. The verification script copies an explicit
source/dependency allowlist into a temporary directory and builds without a
Vercel account. Runner build caches and Android tool state were placed under
`/tmp` for the managed filesystem; no runner authentication was needed.

## Limits and handoff

Production deployment was prepared and its function packaging verified, but no
Vercel project or production database was supplied. Follow the server README,
set private environment variables in Vercel, apply migrations, and configure the
Android deployment origin before enabling online features.

Android tests ran under Robolectric. Device instrumentation was compiled but
not executed. Physical-device checks remain for real Keystore behavior,
connectivity changes, and Android background scheduling. Lint warnings concern
dependency/platform updates and backup-rule configuration.

Each local Android library is bound to its first account to prevent accidental
cross-account uploads. Competing vocabulary schedules follow server arrival
order; independent review events retain their identities. Email verification,
password recovery, and a browser-based editorial interface are not implemented.
Retain sync tombstones and operation IDs until a device-expiration policy exists.

All changes remain in the working tree. No GitHub workflow or CI credential
handling files were changed. No credentials, authentication files, or session logs
are included in these deliverables.
