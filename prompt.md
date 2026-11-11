Build an Android application called Ro-Lang, a story-based language learning app that helps users learn new languages by reading interactive stories.

Use Kotlin, Jetpack Compose, and Gradle Kotlin DSL. Create a modern, clean, intuitive, and user-friendly interface.

Core Features

1. Story-Based Learning

- Learn languages through interesting short stories.
- Provide multiple story categories and genres.
- Each story must have difficulty levels: Beginner (A1–A2), Intermediate (B1–B2), and Advanced (C1–C2).
- Allow users to choose stories based on their proficiency level.

2. Word Translation

- Make every word in a story clickable.
- When tapped, display its translation, meaning, part of speech, example usage, and a brief explanation.
- Support both word-by-word and sentence translation.

3. Multilingual Support

Support three languages:

- English
- Indonesian
- Filipino (Tagalog)

Allow users to choose their target language and native/reference language independently.

4. Vocabulary Collection

- Save unfamiliar words to a personal vocabulary list.
- Store meanings, translations, and example sentences.
- Organize vocabulary by story or category.
- Allow users to mark words as mastered.

5. Learning Review

- Implement a spaced repetition system (SRS) for vocabulary revision.
- Provide interactive quizzes and exercises.
- Review previously learned words.
- Track learning progress and statistics.

6. Offline Mode

- Allow users to access downloaded or built-in stories without an internet connection.
- Store stories, translations, and vocabulary locally.
- Ensure core learning features work completely offline.

Technology Stack

- Kotlin
- Jetpack Compose
- Material 3
- Room Database for local storage.
- DataStore for user preferences.
- Navigation Compose.

UI/UX Requirements

- Create a modern and visually appealing interface.
- Use bottom navigation.
- Include Home, Stories, Vocabulary, Review, and Profile screens.
- Provide a comfortable reading experience with proper typography and spacing.
- Add subtle animations and learning progress indicators.
- Maintain consistent design across all screens.

Development Instructions

- Inspect the existing project structure before making changes.
- Use a clean, modular, and maintainable architecture.
- Do not create UI mockups only. Implement fully functional features.
- Include built-in sample stories with translations and vocabulary.
- Ensure the local database and offline functionality work correctly.
- Avoid paid APIs for core features.
- Test the application and fix build errors before completing the project.

Important: Focus on building a fully functional language-learning application, not just a visual prototype.