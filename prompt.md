Build SnapYT Scraper

Scrape and analyze the website https://www.snapyt.app/id/ to understand how its video and audio download functionality works.

Requirements

1. Inspect the website, its HTML, JavaScript, network requests, and API endpoints.
2. Implement a working scraper using Node.js (ESM).
3. Use lightweight libraries, preferably native "fetch". Avoid unnecessary dependencies.
4. Support:
   - Video downloads.
   - Audio downloads (MP3).
5. Use this YouTube URL for testing:
   "https://youtu.be/PqtggjVAi8M"
6. Test both video and audio functionality using content you're authorized to download.
7. Ensure the scraper actually works, not just returns mocked responses.
8. Handle errors, timeouts, invalid URLs, and unavailable formats.
9. Save downloaded files locally with appropriate filenames and extensions.

Important

- Prioritize native "fetch", "URL", and other built-in Node.js APIs.
- Use ESM ("import" / "export").
- Do not use browser automation or heavy libraries unless absolutely necessary.
- Do not bypass DRM, authentication, or access restrictions.
- Keep the implementation simple, clean, and reusable.

Deliverable: A fully working Node.js ESM scraper with clear usage instructions. Test everything before considering it complete.