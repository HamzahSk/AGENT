Continue improving the existing Ro-Lang project. Focus on the following tasks:

1. Improve the Reading Room UI/UX

Inspect the current Reading Room screen and improve its reading experience.

Continuous Story Reading:

- Display the entire story as continuous text that flows vertically, similar to reading a real book.
- Do not separate every paragraph into individual cards or require users to press "Next passage" to continue reading.
- Allow users to scroll naturally from the beginning to the end of the story.
- Preserve paragraph spacing and proper typography for readability.
- Keep the story title, category, difficulty level, and reading progress indicator.
- Make the reading layout responsive and comfortable on different screen sizes.

2. Interactive Vocabulary Highlighting

Implement a color-coded vocabulary system. Every word in a story should have an interactive learning status.

Use these statuses and colors:

- Blue — New: Words the user has not learned or encountered before.
- Green — Learning: Words the user is currently studying.
- Yellow — Almost Mastered: Words the user understands but still needs more practice with.
- No Highlight — Known: Words the user has already mastered.

When users tap a word, display its translation, meaning, part of speech, example sentences, and learning status.

Allow users to manually change a word's status through the word detail interface.

3. Automatic Vocabulary Progression

The application should also be able to update vocabulary statuses automatically based on the user's learning performance.

- Track vocabulary performance during quizzes and practice sessions.
- Gradually promote words from New to Learning, Almost Mastered, and eventually Known.
- Use spaced repetition to determine when words should be reviewed.
- If users repeatedly answer correctly, the application can mark words as mastered.
- If users struggle with a word, lower its mastery level and schedule another review.
- Manual status changes made by users should be respected and properly synchronized.

Store vocabulary statuses and learning history locally, and synchronize them with the server when online.

Make sure the highlight colors remain consistent throughout the application.

4. Ro-Lang Server Documentation

Inside the "rolang-server" folder, create clear and easy-to-understand documentation explaining how the backend works and how to manage its content.

The documentation should cover:

Project Overview

- Explain the server architecture and its main components.
- Explain how the Android application communicates with the server.
- Explain the database structure and relationships.

Adding New Stories

- Explain how to add new stories to the database.
- Provide a complete example of a story data structure (JSON).
- Explain how to provide story titles, descriptions, paragraphs, translations, categories, and difficulty levels.
- Explain how to add vocabulary, word meanings, examples, and other learning information.
- Explain how to publish and update stories.

API Documentation

- List available API endpoints.
- Explain their purpose, parameters, request bodies, and responses.
- Include practical request examples.

User Data & Learning System

- Explain user accounts and authentication.
- Explain vocabulary statuses and mastery progression.
- Explain learning progress, reading history, quizzes, and spaced repetition.
- Explain how synchronization between local storage and the server works.

Configuration & Deployment

- Explain environment variables.
- Explain database configuration.
- Explain how to configure the Android application's "config.json".
- Provide simple Vercel deployment instructions.

5. Documentation Structure

Organize the documentation inside "rolang-server/docs/" where appropriate.

Include:

- "README.md" — Main project overview and setup instructions.
- "STORIES.md" — How to create, edit, and publish stories.
- "API.md" — API endpoint documentation.
- "DATABASE.md" — Database schema and relationships.
- "LEARNING_SYSTEM.md" — Vocabulary statuses, mastery, and review logic.
- "DEPLOYMENT.md" — Configuration and Vercel deployment guide.

Keep the documentation concise, practical, and beginner-friendly. Include JSON examples wherever necessary.

6. Important Development Rules

- Inspect the existing implementation before making changes.
- Preserve existing functionality and project architecture.
- Do not break the current offline learning system.
- Ensure vocabulary statuses work consistently between local storage and the server.
- Avoid unnecessary modifications to unrelated files.
- Make sure all new features are fully functional, not just visual changes.
- Test the implementation and fix any issues.

Final Goal: Make Ro-Lang feel like a real interactive reading application where users can naturally read entire stories, explore individual words, track vocabulary mastery, and manage learning content through a well-documented backend.