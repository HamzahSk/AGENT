# Ro-Lang Android handoff

Implemented a standalone Android application in `ro-lang-android/`, using Kotlin,
Jetpack Compose, Material 3, Room, DataStore, Navigation Compose, and Gradle Kotlin DSL.

The five screens provide a searchable story library, comfortable paged reading,
tappable word definitions and translations, passage translation, vocabulary grouped
by story or category, mastery controls, spaced repetition, multiple-choice and written
recall exercises, and persisted learning statistics and preferences. Target and
reference languages are independent. The library includes three genres with all three
difficulty bands, translated into English, Indonesian, and Filipino (Tagalog).

Stories and dictionary data seed Room atomically. Vocabulary, examples, language
pairs, reading positions, completion, and review schedules remain local. Review
transactions reject stale or duplicate submissions. New words are immediately due;
completion survives rereading. The APK has no internet permission.

## Validation

- Gradle `:app:testDebugUnitTest :app:assembleDebug :app:assembleDebugAndroidTest :app:lintDebug`: passed.
- Nine Android tests passed: five domain tests, three Room/DataStore/corpus tests,
  and one complete Compose reading/save/translate/finish/review flow. Shared tests
  execute in Robolectric (API 35, native graphics) and also compile for devices.
- Coverage validation: nine variants, three languages, 691 dictionary entries,
  with a translation for every story word in every language pair.
- Root repository tests: 18 passed, one skipped because optional PyNaCl is absent.
- Android lint: zero errors, 13 non-blocking warnings about dependency updates
  and Android backup-rule configuration.
- APK signature verification: passed. Merged APK permissions contain only the
  generated AndroidX receiver permission; no network permission.
- Working-tree whitespace checks: passed.

## Deliverables and use

- `Ro-Lang-debug.apk`: installable debug build, Android 8.0 / API 26 or newer.
- `SHA256SUMS.txt`: APK checksum.
- `../../ro-lang-android/README.md`: build instructions, architecture, learning flow,
  and commands for local and device checks.

APK SHA-256: `681f412a5a6cba0da77770218366e55d201a8bda4133455cb1fb5aa6146e950c`

## Limits

Device/emulator instrumentation was compiled but not executed because this runner
could not provide a usable Android emulator. The shared scenarios passed under
Robolectric; physical-device validation remains outstanding.

The initial library contains nine short story variants. Difficulty bands are
editorial estimates rather than certified CEFR assessments. Translations are curated
for this built-in content; there is no arbitrary-text translation service or remote
story catalog. Clearing app data or uninstalling removes learning data.

All changes remain in the working tree. No CI credential handling or GitHub
workflow files were modified. No credentials, authentication files, or session logs
are included in these deliverables.
