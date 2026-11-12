# Ro-Lang for Android

A standalone, offline language-learning app built with Kotlin, Jetpack Compose,
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
needs no network connection and declares no internet permission.

## Learning flow

1. In **Profile**, independently choose English, Indonesian, or Filipino (Tagalog)
   as your learning and reference languages. Choose a reading level, text size,
   and light or dark appearance. Preferences survive restart.
2. Browse **Stories** by genre, level, or search. Each of the three story families
   has Beginner (A1–A2), Intermediate (B1–B2), and Advanced (C1–C2) versions.
3. Read a passage at a time. Tap any word to see its offline translation,
   contextual meaning, part of speech, explanation, and example in both languages.
   **Translate passage** reveals the complete sentence translation. Your reading
   position is saved; **Finish story** records completion.
4. Save words and find them in **Vocabulary**, grouped by story or category.
   Search, filter, inspect examples, mark as mastered, or return words to learning.
   Removing a word asks for confirmation and removes its schedule.
5. In **Review**, answer multiple-choice questions or type translations. Incorrect
   answers return in ten minutes. Correct answers can be rated Again, Hard, Good,
   or Easy; Good starts at one day, then six days, then increasing intervals.
   Five successful repetitions and an interval of at least 21 days confer mastery.
   Manual mastery pauses reviews until the word is returned to learning.
6. **Home** and **Profile** show collected words, completion, due reviews,
   mastery, review accuracy, and a calendar-day review streak.

Vocabulary and review statistics are separated by target/reference language pair.
Reading progress is separated by story variant and target language. Database writes
and review logs use transactions; duplicate saves and stale quiz submissions are
rejected. Quizzes left without a rating do not change the schedule. Everything is
stored on the device, with no account, cloud sync, paid API, or download requirement.

## Structure

- `app/src/main/java/com/rolang/app/domain`: Unicode tokenization, answer matching,
  language/level models, and the deterministic SRS scheduler.
- `app/src/main/java/com/rolang/app/data`: Room entities, DAO, repository, corpus
  loading/coverage validation, and DataStore preferences.
- `LearningViewModel.kt`: Lifecycle-managed state and learning operations.
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
There is no arbitrary-text translator or remote story catalog. Further stories
can be authored in the corpus generator and must pass complete dictionary coverage.

The existing JavaScript Ro-Lang tutor under `../roccky_bot/ro-lang` is independent
of this app.
