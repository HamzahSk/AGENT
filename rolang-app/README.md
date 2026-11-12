# Ro-Lang for Android

A standalone, hybrid offline/online language-learning app built with Kotlin, Jetpack Compose,
Material 3, Room, DataStore, and Navigation Compose. Android 8.0 (API 26) or newer.

## Build and run

Open this directory in Android Studio. Use JDK 17 and install Android SDK platform
35 and Build Tools 35.0.0. The included Gradle 8.9 wrapper verifies its distribution
checksum. No API keys or service accounts are needed.

```sh
./gradlew :app:assembleDebug
./gradlew :app:installDebug
```

The APK is generated at `app/build/outputs/apk/debug/app-debug.apk`.
The first build needs internet to download build dependencies; the installed app
keeps its bundled library and learning data available without a network connection.
Online features are optional and disabled in the default configuration.

## Learning flow

1. In **Profile**, independently choose English, Indonesian, or Filipino (Tagalog)
   as your learning and reference languages. Choose a reading level, text size,
   and light or dark appearance. Preferences survive restart.
2. Browse **Stories** by genre, level, or search. Each of the three story families
   has Beginner (A1–A2), Intermediate (B1–B2), and Advanced (C1–C2) versions.
3. Scroll through the entire story as continuous paragraphs in the Reading room.
   Tap any word to see its offline translation,
   contextual meaning, part of speech, explanation, and example in both languages.
   **Translate story** shows reference-language text beneath each paragraph. Your
   paragraph position is saved; **Finish story** records completion.
4. Save words and find them in **Vocabulary**, grouped by story or category.
   New words are blue, Learning words green, Almost Mastered words yellow, and
   Known words have no highlight. Every word remains tappable. Change any of the
   four statuses in word details, or filter the collection by status.
   Removing a word asks for confirmation and removes its schedule.
5. In **Review**, answer multiple-choice questions or type translations. Incorrect
   answers return in ten minutes. Correct answers can be rated Again, Hard, Good,
   or Easy; Good starts at one day, then six days, then increasing intervals.
   Three successful repetitions reach Almost Mastered. Five successful repetitions
   and an interval of at least 21 days confer Known status. Missed answers return
   words to Learning. Manual Known status pauses reviews; New/Learning resets the
   consecutive streak and makes the word due. Manual Almost Mastered is preserved
   through Good/Easy reviews. An open quiz cannot overwrite a later manual edit.
6. **Home** and **Profile** show collected words, completion, due reviews,
   mastery, review accuracy, and a calendar-day review streak.

Vocabulary and review statistics are separated by target/reference language pair.
Reading progress is separated by story variant and target language. Database writes
and review logs use transactions; duplicate saves and stale quiz submissions are
rejected. Quizzes left without a rating do not change the schedule. Everything is
stored on the device. An optional account synchronizes it with the independent
backend in `../rolang-server`; offline learning needs no account or download.

## Server configuration and synchronization

Edit the root `config.json` in this Android project. Gradle copies this one source
into generated app assets at build time. Set `serverBaseUrl` to the deployment
origin (for example `https://YOUR-DEPLOYMENT.vercel.app`, without `/api/v1`) and set
`onlineEnabled` to true. The app reads configuration at runtime, including on each
worker run. A complete private `files/config.json` override takes precedence over
the packaged configuration; managed deployments can provision it without changing
URLs in Kotlin. Invalid configuration disables networking and keeps local data.

| Setting | Default | Purpose |
| --- | --- | --- |
| `serverBaseUrl` | Empty | Server origin; HTTPS required outside local development |
| `apiVersion` | `v1` | API path version |
| `connectionTimeoutMs` | 10000 | Connection timeout (1000–120000 ms) |
| `requestTimeoutMs` | 30000 | Whole-request and read timeout (1000–120000 ms) |
| `onlineEnabled` | false | Enable public story downloads and account actions |
| `automaticSyncEnabled` | true | Synchronize learning changes automatically |
| `syncIntervalMinutes` | 15 | Background sync interval (15–1440 minutes) |
| `storyPageSize` | 30 | Number of catalog entries per request (1–100) |

When online features are enabled, launch refreshes published stories. In
**Profile → Online library**, register or sign in to synchronize saved vocabulary,
SRS schedules, reviews, reading positions, completion, and learning preferences.
**Sync now** manually retries; signed-out learners can use **Refresh stories**.
Disabling automatic sync still allows launch-time story refresh and manual sync.
Accounts require a valid email, a 12–128 character password, and a display name
when registering. Session tokens are encrypted with an Android Keystore key;
passwords are never persisted. Sign-out keeps local learning data.

Room writes learning changes and their pending operations in the same transaction.
WorkManager persists connected-network jobs and retries unavailable servers with
exponential backoff. A periodic job catches new changes while the app is closed;
Android battery policies can delay execution. Every upload has an operation UUID;
retries do not duplicate review events. Acknowledgements only remove the exact
uploaded operation, preserving edits made during a request. Downloaded records
and the revision cursor commit together. Deletions propagate as tombstones.

Published stories and per-story dictionaries cache in Room, so word lookup and
reading remain local after download. A failed or partial catalog refresh retains
cached content. A complete successful refresh hides removed/unpublished remote
stories without deleting learning history. Bundled stories remain available.
The existing version-1 database upgrades through versions 2 and 3 with explicit
migrations preserving vocabulary, reading, reviews, schedules, and pending edits;
new installs also work entirely offline. Legacy mastery fields map to the new
statuses. Deploy the updated backend before distributing this app build.

Each local library remains bound to the first account that signs in. Reconnecting
the same account preserves its pending edits; signing into another account is
rejected to prevent cross-account uploads. To use another account, use a separate
Android profile or clear app data after synchronizing. See the server README for
record conflict rules and deployment steps.

For an Android emulator talking to a local server, use `http://10.0.2.2:3000`.
Cleartext HTTP is disabled in the shipped app; local development requires a
debug-only manifest override enabling it, or a trusted local HTTPS endpoint.
Robolectric's contract tests can use a loopback HTTP server without modifying the
shipping manifest.

## Structure

- `app/src/main/java/com/rolang/app/domain`: Unicode tokenization, answer matching,
  language/level models, and the deterministic SRS scheduler.
- `app/src/main/java/com/rolang/app/data`: Room entities, DAO, repository, corpus
  loading/coverage validation, and DataStore preferences.
- `LearningViewModel.kt`: Lifecycle-managed state and learning operations.
- `network`: Runtime configuration, bounded HTTP requests, Keystore sessions,
  synchronization, shared services, and connected-network background jobs.
- `app/src/main/java/com/rolang/app/ui`: Navigation, theme, and functional screens.
- `app/src/main/assets/corpus.json`: All stories and multilingual dictionary data.
- `app/schemas`: Exported Room schema for future explicit migrations.
- `tools/build_corpus.py`: Authoring source and complete word-coverage validation.
- `app/src/sharedTest`: The same persistence and UI scenarios for Robolectric and
  device instrumentation; `app/src/test` contains scheduler and tokenizer tests.

The database is seeded atomically on first launch. It persists independently of
the ViewModel. There is no destructive migration fallback. Clearing app data or
uninstalling removes learning data; backups are disabled.

## Checks

```sh
python3 tools/build_corpus.py
./gradlew :app:testDebugUnitTest :app:lintDebug :app:assembleDebug :app:assembleDebugAndroidTest
# With an emulator or USB-connected device:
./gradlew :app:connectedDebugAndroidTest
```

Local tests run the scheduler and answer matching plus real Room persistence,
full corpus coverage in every language pair, transactional review guards, DataStore
restart persistence, and the Compose read/save/translate/finish/review flow using
Robolectric. Device tests exercise those same shared scenarios. Run device tests
on a clean installation so the UI scenario starts with its default language pair.

## Content scope

This initial library contains nine short story variants in three genres: everyday
life, mystery, and nature/adventure. Difficulty bands are editorial estimates,
not certified CEFR assessments. Built-in translations are curated contextual
glosses; grammatical markers and multiword expressions do not have exact
one-word equivalents, so sentence translations supply the complete meaning.
There is no arbitrary-text translator. Further bundled stories can be authored in
the corpus generator; remote stories can be published through the backend API.
Both must pass complete multilingual dictionary coverage.

The existing JavaScript Ro-Lang tutor under `../roccky_bot/ro-lang` is independent
of this app.

Hybrid tests additionally cover runtime configuration, cached remote content,
reopen persistence, failed uploads, tombstones, concurrent local edits, review
identity, preference restoration, account isolation, and version-1 migration.
An optional two-device contract test runs the actual Android HTTP client against
the Node API and PostgreSQL. Start the server against a disposable database, then:

```sh
./gradlew :app:testDebugUnitTest -ProlangIntegrationUrl=http://127.0.0.1:3000
```

This optional test registers an isolated fixture account in that disposable
database. It is skipped when the property is absent. Physical-device/emulator
checks remain useful for real Keystore, connectivity, and WorkManager behavior.
