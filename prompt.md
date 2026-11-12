Extend the existing Ro-Lang project by building a backend server that can be deployed to Vercel.

The Android application is located in the "rolang-app" folder. Create a new folder named "rolang-server" in the project root for the backend.

1. Backend Server ("rolang-server")

Build a backend API that is compatible with Vercel deployment.

It should handle:

- Stories Database: Store stories, translations, vocabulary, categories, difficulty levels (A1–C2), and other related content.
- User Management: Store user profiles, learning progress, saved vocabulary, reading history, and review data.
- Story Management: Support creating, editing, deleting, and publishing stories through API endpoints.
- Learning Data: Synchronize user progress and vocabulary between devices.
- Multilingual Content: Support English, Indonesian, and Filipino (Tagalog).

Choose a database solution compatible with Vercel deployment. Keep the architecture scalable and easy to maintain.

2. Server API

Create RESTful API endpoints for:

- Fetching stories and story details.
- Filtering stories by language, category, and difficulty.
- Fetching translations and vocabulary.
- User registration and authentication.
- Saving and retrieving user learning progress.
- Managing saved vocabulary.
- Adding, updating, deleting, and publishing stories.

Implement proper validation, error handling, and authentication for protected endpoints.

3. Android Configuration ("rolang-app")

Create a "config.json" file inside the "rolang-app" folder.

Use it to configure:

- Server base URL.
- API version.
- Connection timeout.
- Request timeout.
- Enable/disable online features.
- Enable/disable automatic synchronization.
- Other necessary server settings.

The Android application must read this configuration dynamically instead of hardcoding server URLs throughout the codebase.

4. Android Integration

Update the existing Android application to communicate with the new backend.

- Fetch stories from the server.
- Display remotely published stories.
- Synchronize user data when online.
- Cache stories and learning data locally.
- Keep offline functionality working.
- Automatically synchronize pending changes when the connection returns.
- Handle server errors gracefully.

Local data should remain available even when the server is unreachable.

5. Deployment

Prepare "rolang-server" for Vercel deployment.

Include:

- "vercel.json" if needed.
- Environment variable configuration.
- Database connection setup.
- ".env.example".
- Deployment documentation in "README.md".

Never hardcode API keys, database credentials, or secrets.

6. Development Instructions

- Inspect the existing project before making changes.
- Preserve the current Android UI and existing functionality.
- Avoid unnecessary modifications to unrelated files.
- Ensure both projects work independently.
- Use a clean and modular architecture.
- Provide database migrations or schema definitions.
- Include sample story data for testing.
- Test API endpoints and Android integration.
- Ensure the backend can be deployed to Vercel successfully.

Important: The goal is to make Ro-Lang a hybrid offline/online application. Stories and user data should be managed through the backend while the Android application maintains local storage for offline learning.