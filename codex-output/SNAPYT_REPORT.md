# SnapYT task report

The implementation is available in [snapyt/](../snapyt/README.md). **The request
for a fully working, live-verified SnapYT scraper remains incomplete because the
service denied access.** No successful YouTube download is claimed.

## Phase 1: repository and site inspection

- Read the root prompt.md, repository documentation, project configuration, and
  applicable development conventions. No applicable AGENTS.md files were found.
- Kept this task in a standalone ESM package with no npm dependencies. The
  existing bot and CI runtime did not need modification.
- Requested https://www.snapyt.app/id/ using native fetch. Initial requests
  returned HTTP 403 HTML titled "Just a moment..." with no page nonce or
  application script links. The public robots.txt returned HTTP 200; the home
  page and sitemap requests were also challenged.
- Inspected the public
  [TikDD protocol documentation](https://github.com/wepuu/tikdd/blob/main/docs/providers/snapyt.md)
  and [SnapYT adapter source](https://github.com/wepuu/tikdd/blob/main/packages/providers/src/adapters/snapyt.ts)
  as third-party protocol evidence. They describe VD_NONCE, the
  process_video_url AJAX action, a same-origin result page, and
  snapyt_force_download links. This is not an official API contract.
- During validation, one ordinary landing-page request succeeded and exposed a
  parseable page nonce. The subsequent real AJAX POST returned HTTP 403.
  Current result-page markup, format availability, and media responses could
  not be inspected or verified live. No complete current frontend JavaScript
  bundle was obtained.

The implementation follows the evidenced request sequence. It does not claim
that the current live API accepted the request or returned usable media.

## Phase 2: implementation

- Added a reusable SnapYTClient and a CLI for metadata, video, and audio.
- Used native fetch, URLSearchParams, streams, filesystem operations, and
  child_process; no npm packages or browser automation were added.
- Validated individual YouTube URLs and constrained result/download redirects
  to the supported HTTPS hosts.
- Added bounded text reads, metadata and download deadlines, cancellation,
  size limits, format selection, and explicit error codes.
- Streamed actual media responses to temporary files, checked signatures/MIME
  types and transfer lengths, and published complete files without overwriting.
  Failed transfers and conversions remove their temporary files.
- Supported direct MP3 and local FFmpeg conversion of supported audio or a
  combined video. A WebM/M4A file is never merely renamed to .mp3.
- Added usage instructions and an opt-in live check that requires saved files,
  successful FFmpeg decoding, and SHA-256 hashes before reporting success.

Anonymous cookies/nonces are held only in memory for an operation. The client
stops on denied requests and does not solve challenges, load browser sessions,
use proxies, or switch providers. No credentials, authentication files, raw
session captures, or signed media links are included in the deliverables.

## Phase 3: validation

The local suite uses a real loopback HTTP server and small, original generated
video/audio fixtures. These tests exercise transport and file handling, rather
than relying only on fake fetch responses. They are not evidence of live
SnapYT success.

Run the full local suite with:

~~~sh
SNAPYT_TEST_FFMPEG=/path/to/ffmpeg npm test --prefix snapyt
~~~

The validation environment used Node.js v24.22.2. A temporary FFmpeg executable
was extracted under /tmp from the public imageio-ffmpeg 0.6.0 wheel after
verifying its PyPI SHA-256 digest. That executable and package are not part of
the repository or its runtime dependencies.

Checks cover actual MP4 and MP3 transfers, WebM-to-MP3 conversion, extraction
from MP4, decoding, filename collisions, wrong media types, unavailable
formats, malformed responses, challenges, redirect boundaries, truncated
transfers, size limits, filesystem failures, timeouts, and cancellation.

Final local results:

- With the temporary FFmpeg binary: **53 passed, 0 failed, 0 skipped**.
- Without a configured test FFmpeg binary: **48 passed, 0 failed, 3 explicitly
  skipped conversion groups**. The skipped group includes two nested checks,
  which explains the different total.
- Every new .mjs file passed node --check.
- git diff --check passed; the added text files have no trailing whitespace.

The final live run used the exact requested video ID PqtggjVAi8M:

| Mode | Outcome | HTTP status | Stage | Files downloaded |
| --- | --- | --- | --- | --- |
| Video | ACCESS_RESTRICTED | 403 | Landing page | 0 |
| Audio / MP3 | ACCESS_RESTRICTED | 403 | AJAX resolution | 0 |

The live command exited 1 as expected for an unsuccessful check. See
[snapyt-live-check.json](snapyt-live-check.json) for its sanitized result.
No raw challenge response or transient request data was saved.

## Remaining limitation

A successful live test needs SnapYT to permit its normal anonymous
landing/AJAX/result/media flow from the execution environment. Then the current
result markup and media formats must be confirmed, any schema differences
addressed, and both files fully decoded by the live check. The supplied
video's availability and license were not established; only authorized content
should be used for a future successful download.

The current client supports a bounded set of offered download links and media
containers. It does not merge separate tracks, handle playlists/live streams,
resume partial ranges, or bypass DRM, sign-in, or access challenges. MP3
conversion needs FFmpeg with libmp3lame.

All changes are left in the working tree. GitHub workflow files, CI credential
handling, and pre-existing reports were not changed; no commit was created.
