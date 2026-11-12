# Ro-Lang reading and vocabulary validation

Completed the tasks in prompt.md; changes are left in the working tree.

## Changes

- Continuous, scrollable story paragraphs with comfortable serif typography,
  bounded reading width, saved paragraph positions, persistent reading progress,
  per-paragraph translations, and explicit story completion.
- All words remain interactive. Shared blue/green/yellow/no-highlight styles
  represent New, Learning, Almost Mastered, and Known. Both reader and vocabulary
  details support manual changes; vocabulary filters include all four statuses.
- Quiz ratings update status and spaced repetition together. Correct reviews
  progress toward Known; struggling words return to Learning and earlier review.
  Manual Known pauses review, and stale quizzes cannot overwrite manual edits.
- Room version 3 preserves prior vocabulary, schedules, reading, review history,
  and pending operations. Status fields synchronize through the existing queue;
  the server validates consistency and handles older records and retries.
- Six backend guides live in rolang-server/docs/, with a complete uploadable
  multilingual story example and links from the server README. Android usage
  documentation describes the new reading and learning behavior.

## Validation

- Android: 26 tests passed, zero failures/errors/skips, including the actual
  Android HTTP client exchanging all four statuses between two Room databases
  through the Node API and disposable PostgreSQL 16 database.
- Regression coverage: continuous reading, translation, saving, completion,
  manual statuses, quiz progression and lapses, database reopen, versions 1/2
  upgrading to version 3, legacy records, in-flight manual changes, and word links
  after switching reference language.
- Android lint passed with no errors; 16 existing configuration warnings remain
  (target API, available dependency updates, and data extraction rules).
- Debug application APK and instrumentation test APK assembled successfully.
- Backend: all 9 PostgreSQL API tests passed. The documentation story was used
  for the create/edit/publish/unpublish/delete contract test.
- Backend syntax checks passed; production dependency audit found zero
  vulnerabilities.
- Bundled corpus: 9 variants, 691 dictionary entries, complete coverage in all
  three languages.
- Documentation: complete example passed story coverage validation; all 11 JSON
  blocks and 30 local links validated.
- git diff --check passed.

Android validation command (JDK 17, SDK 35; writable caches provisioned under /tmp):

```sh
bash gradlew :app:testDebugUnitTest :app:lintDebug :app:assembleDebug :app:assembleDebugAndroidTest -ProlangIntegrationUrl=http://127.0.0.1:3001
```

Backend checks used a dedicated disposable local database:

```sh
npm test
npm run check
npm audit --omit=dev
```

## Limits and deployment notes

- No physical Android device/emulator run or Vercel deployment was performed.
  Instrumentation tests were compiled; UI tests ran with Robolectric.
- Deploy the updated server before distributing the updated Android build.
  Older server versions reject the new status fields. Later uploads by old app
  versions can derive status from their older mastery fields.
- Existing architecture remains: vocabulary is scoped by story and language
  pair, and concurrent device schedules use server arrival order per record.
  Review events retain separate identities; schedules are not merged.
- Example sentences come from translated story paragraphs. The content contract
  does not have a separate dictionary examples field.
