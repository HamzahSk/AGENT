Project: RMovie — Android Movie Streaming Application

You are an expert Android engineer, reverse engineer, and full-stack developer.

Your task is to build a complete Android movie streaming application called RMovie, using Kotlin.

The project must be implemented as a native Android application with a modern UI, reliable playback, and a modular architecture.

1. Initial Research & APK Analysis

First, locate and inspect the provided "lk21.apk" file.

Perform a thorough technical analysis of the APK, including:

- Application structure and architecture.
- UI layouts and navigation patterns.
- Available libraries and dependencies.
- Networking implementation.
- Data models and API communication patterns.
- Media player implementation.
- Image loading and caching.
- Video playback configuration.

Use JADX, APKTool, or other appropriate tools if available.

Treat LK21 as a technical and UI reference. Only inspect and use components, interfaces, and endpoints that are legally accessible and authorized. Do not bypass DRM, authentication protections, or access restrictions.

2. Website & API Research

Investigate the publicly accessible LK21 website.

Perform HTTP requests using JavaScript fetch, browser automation when necessary, and other appropriate tools.

Research:

- Homepage structure.
- Movie listing pages.
- Search functionality.
- Movie detail pages.
- Genre and category navigation.
- Pagination.
- Publicly accessible metadata.
- Authorized streaming provider integrations.

Identify the available data structures and document the findings.

Do not assume endpoints exist. Verify every endpoint before implementing it.

For content that cannot legally be accessed, use TMDB metadata and authorized streaming providers instead.

3. Android Application Architecture

Create a project named:

"rmovie"

Use:

- Kotlin.
- Jetpack Compose.
- Material 3.
- MVVM architecture.
- Kotlin Coroutines and Flow.
- Retrofit or Ktor Client.
- Kotlin Serialization.
- Room Database.
- DataStore.
- Navigation Compose.
- Android Media3 ExoPlayer.

Minimum Android version: Android 8.0 (API 26).

Organize the project into modular packages:

- "core"
- "data"
- "domain"
- "network"
- "database"
- "player"
- "feature.home"
- "feature.search"
- "feature.detail"
- "feature.download"
- "feature.favorite"
- "feature.settings"

Keep networking, business logic, and UI completely separated.

4. Home Screen

Create a modern movie discovery homepage.

Include:

- Featured movie carousel.
- Trending movies.
- Popular movies.
- Recently released movies.
- Recommended movies.
- Popular genres.
- Continue Watching.
- Personalized recommendations.

Each movie card should display:

- Poster.
- Title.
- Release year.
- Rating.
- Movie type.

Implement horizontal scrolling sections and smooth navigation.

5. Search Screen

Implement a fully functional search system.

Features:

- Search movies by title.
- Debounced search requests.
- Search suggestions.
- Search history.
- Genre filters.
- Year filters.
- Sorting options.
- Pagination or infinite scrolling.

Handle empty results, loading states, and network errors.

6. Movie Details

Create a complete movie detail page.

Display:

- Backdrop image.
- Movie poster.
- Title.
- Original title.
- Synopsis.
- Release date.
- Rating.
- Genres.
- Runtime.
- Cast and crew.
- Similar movies.
- Recommended movies.

Include interactive actions:

- Watch Now.
- Add to Favorites.
- Download (only when the provider explicitly permits offline downloads).
- Share.
- Mark as Watched.

7. Advanced Video Player

This is one of the most important parts of the project.

Implement a reliable video player using Android Media3 ExoPlayer.

The player must support:

Playback Controls

- Play and pause.
- Seek forward and backward.
- Progress bar.
- Current playback time.
- Total duration.
- Auto-hide controls.
- Double-tap seeking.

Video Quality

- Automatic quality selection.
- Manual quality selection.
- Available resolution display.
- Adaptive bitrate streaming.
- Quality switching without unnecessary playback interruption.

Multiple Streaming Sources

Support switching between multiple authorized streaming sources.

Requirements:

- Display available sources.
- Detect source availability.
- Switch sources without crashing.
- Preserve playback position when possible.
- Handle unavailable sources.
- Display appropriate error messages.

Playback Speed

Provide:

- 0.5x
- 0.75x
- 1.0x
- 1.25x
- 1.5x
- 1.75x
- 2.0x

Additional Features

- Fullscreen mode.
- Landscape orientation.
- Subtitle selection.
- External subtitle support where permitted.
- Audio track selection.
- Picture-in-Picture.
- Playback resume.
- Network buffering indicators.
- Retry mechanism.
- Hardware-accelerated decoding when supported.

Stream Compatibility

Implement proper stream handling for supported formats:

- HLS (M3U8).
- MPEG-DASH (MPD).
- MP4.
- Supported audio and subtitle tracks.

Correctly configure Media3 extractors, renderers, track selectors, and adaptive playback.

Do not manually modify encrypted or DRM-protected media to bypass content protection. Use official DRM integrations when authorized.

Focus on smooth playback, low buffering, and stable decoding.

8. Favorites & Watch History

Use Room Database for local persistence.

Implement:

- Add/remove favorites.
- Watch history.
- Continue Watching.
- Playback position tracking.
- Recently watched movies.
- Automatic synchronization of local playback progress.

The application must retain this data after restarting.

9. Download Manager

Implement an offline download manager for content explicitly authorized for downloading.

Features:

- Download progress.
- Pause/resume.
- Cancel downloads.
- Download queue.
- Storage management.
- Download history.
- Offline playback.
- Download notifications.

Use WorkManager or an appropriate background download implementation.

Respect provider restrictions and DRM policies.

10. UI/UX Design

Create a polished, modern streaming application.

Design direction:

- Dark theme by default.
- Black and dark gray backgrounds.
- Modern accent colors.
- Rounded movie cards.
- Smooth transitions.
- Subtle animations.
- Responsive layouts.
- Clean typography.
- Material 3 components.

The UI should feel like a professional movie streaming platform.

Avoid generic template-looking screens.

Make sure all screens have proper:

- Loading states.
- Empty states.
- Error states.
- Offline states.

11. Settings

Implement:

- Theme selection.
- Default playback quality.
- Default playback speed.
- Auto-play next episode.
- Subtitle preferences.
- Clear cache.
- Download settings.
- About application.

12. Performance & Reliability

Pay special attention to:

- Memory management.
- Image caching.
- Network caching.
- Lazy loading.
- Efficient database queries.
- Lifecycle-aware playback.
- Proper ExoPlayer release.
- Configuration changes.
- Network timeout handling.
- Error recovery.

Avoid unnecessary recompositions and memory leaks.

13. Implementation Workflow

Work in the following order:

Phase 1 — Research

- Inspect the project directory.
- Locate and analyze "lk21.apk".
- Research publicly accessible website structures.
- Identify legally usable data sources.
- Document findings.

Phase 2 — Architecture

- Create the Android project.
- Configure Gradle and dependencies.
- Establish the application architecture.
- Implement database and networking layers.

Phase 3 — Core Features

- Implement Home.
- Implement Search.
- Implement Movie Details.
- Implement Favorites.
- Implement Watch History.

Phase 4 — Video Player

- Implement Media3 ExoPlayer.
- Implement playback controls.
- Implement quality selection.
- Implement source switching.
- Implement subtitles and playback speed.
- Test playback with authorized sample streams.

Phase 5 — Additional Features

- Implement authorized downloads.
- Implement offline playback.
- Implement Settings.
- Implement Continue Watching.

Phase 6 — Testing & Optimization

- Build the application.
- Fix compilation errors.
- Test navigation.
- Test database persistence.
- Test playback.
- Test network failure scenarios.
- Optimize performance.

14. Important Development Rules

1. Do not create placeholder functionality for core features.
2. Every button must perform its intended action.
3. Do not hardcode fake movie data as the final implementation.
4. Verify API responses before creating data models.
5. Handle API errors gracefully.
6. Keep the code modular and maintainable.
7. Do not modify unrelated files.
8. Do not leave unfinished TODO implementations.
9. Use real, authorized movie metadata and playback sources.
10. Test every major feature before considering it complete.

15. Final Deliverables

The final project must contain:

- Complete Kotlin Android source code.
- Working Gradle configuration.
- Properly organized project structure.
- Functional movie discovery.
- Functional search.
- Functional movie details.
- Functional favorites.
- Functional watch history.
- Advanced Media3 video player.
- Authorized download functionality.
- README.md with setup instructions.
- API research documentation.
- Successful Android APK build.

Start by inspecting the existing workspace and locating "lk21.apk".

Do not immediately generate all the code. Research the existing materials first, establish the architecture, and then implement each phase sequentially.

Your goal is to deliver a functional Android application, not merely a UI prototype.