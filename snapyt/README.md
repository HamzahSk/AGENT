# SnapYT scraper

A standalone Node.js ESM client and CLI using native fetch, URL, streams, and
filesystem APIs. There are no npm dependencies and no bot startup is required.

**Live status (2026-11-10): blocked.** SnapYT rejected this runner's requests
with HTTP 403. The final video check stopped at the landing page; the audio
check reached the AJAX endpoint and was rejected there. No YouTube files were
downloaded. This implementation passes local
transport and conversion tests, but a working live SnapYT download is **not
verified**. See [the investigation report](../codex-output/SNAPYT_REPORT.md).

## Requirements and usage

Use Node.js 22.12 or newer. MP3 conversion additionally needs an FFmpeg executable
with the libmp3lame encoder. Install it using your system package manager, or
provide its path with --ffmpeg. A genuine MP3 offered by the page downloads
directly without FFmpeg.

Run from the repository root; no npm install is needed:

~~~sh
# Inspect available format IDs and their page labels.
node snapyt/cli.mjs info 'https://youtu.be/PqtggjVAi8M'

# Save video, preferring a combined video/audio format.
node snapyt/cli.mjs video 'https://youtu.be/PqtggjVAi8M' --output snapyt/downloads

# Save an actual MP3; convert downloaded audio or a combined video if needed.
node snapyt/cli.mjs audio 'https://youtu.be/PqtggjVAi8M' --output snapyt/downloads

# Select a format the info command actually reported. No silent substitution.
node snapyt/cli.mjs video 'https://youtu.be/PqtggjVAi8M' --format 18 --output snapyt/downloads

node snapyt/cli.mjs --help
~~~

Only download content you own or are authorized to download. The supplied URL
is the operator's requested test input; this repository makes no claim about
its license. The local tests use an original generated video and tone.

The default output directory is downloads relative to the working directory.
--filename supplies a filename stem; a video ID, quality/format ID, and the
detected extension are added. Names are sanitized and collisions receive a
numbered suffix. Complete files are published atomically without replacing
existing files. An interrupted transfer or failed conversion is cleaned up.

Default limits are 30 seconds for all metadata requests together, 180 seconds
for transfer/conversion together, and 512 MiB for each input/output file. Adjust
them with --timeout, --download-timeout, and --max-bytes. All durations are
milliseconds. The CLI prints file metadata on success and a fixed error code
and message on failure.

## Library

~~~js
import { SnapYTClient, SnapYTError } from './snapyt/index.mjs';

const client = new SnapYTClient({
  timeoutMs: 30_000,
  downloadTimeoutMs: 180_000,
  maxBytes: 512 * 1024 * 1024,
  ffmpegPath: 'ffmpeg',
});

try {
  const info = await client.getInfo('https://youtu.be/PqtggjVAi8M');
  console.log(info.formats); // IDs and labels; no nonce or signed download URL.

  const result = await client.download('https://youtu.be/PqtggjVAi8M', {
    type: 'audio', // 'video' or 'audio'; audio always produces an MP3.
    outputDir: './snapyt/downloads',
    filename: 'My authorized recording', // Optional filename stem.
    // format: '251', // Optional exact ID reported by getInfo().
    // signal: controller.signal, // Optional caller cancellation.
  });
  console.log(result.file);
} catch (error) {
  if (error instanceof SnapYTError) console.error(error.code, error.message);
  else throw error;
}
~~~

getInfo() reports page metadata, including type and hasAudio hints. download()
fetches fresh links, checks response MIME types and file signatures, streams to
disk, and verifies advertised transfer sizes. It does not infer the presence of
audio from an MP4 filename. If a default candidate returns the wrong media type,
it can try up to five offered candidates within the same deadline. An explicitly
selected format does not fall back.

Native media may be MP4 or WebM video. Audio in supported M4A, WebM, Ogg, or WAV
containers is converted locally to MP3; a combined video can supply audio when
no separate audio format is offered. The media must actually contain an audio
track for conversion to succeed. Separate video/audio tracks are not merged,
and live streams, playlists, HLS/DASH manifests, and incomplete byte ranges are
not supported. Unknown page markup or formats fail explicitly.

## Protocol and access boundary

The adapter implements the flow documented by the public
[TikDD SnapYT integration](https://github.com/wepuu/tikdd/blob/main/docs/providers/snapyt.md)
and [its implementation](https://github.com/wepuu/tikdd/blob/main/packages/providers/src/adapters/snapyt.ts).
These are third-party references, not an official API contract:

1. GET https://www.snapyt.app/id/ and extract VD_NONCE from the page.
2. POST a URL-encoded form to /wp-admin/admin-ajax.php containing
   action=process_video_url, video_url, and security (the fresh page nonce).
3. Read the successful JSON response's redirect_url and GET that same-origin
   result page.
4. Parse offered data-force links to the snapyt_force_download action, retaining
   their pid, fmt, and nonce values in memory.
5. Download a selected offered resource; follow bounded HTTPS redirects only
   within snapyt.app or googlevideo.com.

No JavaScript is evaluated. Each operation creates a fresh anonymous HTTP
session; any site-issued cookies stay in memory and are never forwarded to
the media CDN. No browser cookies, credentials, challenge solvers, proxies,
alternate download providers, or authentication files are used. HTTP 401/403,
challenge pages, private/restricted content, and rate limits stop the operation.
There is no automatic retry of a denied request. The runtime prints no raw
responses, cookies, page nonces, or signed media URLs.

Useful error codes include INVALID_URL, INVALID_OPTION, ACCESS_RESTRICTED,
RATE_LIMITED, VIDEO_UNAVAILABLE, PROTOCOL_CHANGED, NO_FORMATS,
UNAVAILABLE_FORMAT, UNSAFE_URL, HTTP_ERROR, NETWORK_ERROR, TIMEOUT, ABORTED,
INVALID_MEDIA, INCOMPLETE_DOWNLOAD, FILE_TOO_LARGE, FILE_ERROR,
FFMPEG_UNAVAILABLE, and CONVERSION_FAILED.

## Validation

~~~sh
# Local HTTP server, actual small media fixtures, no requests to SnapYT.
npm test --prefix snapyt

# Also exercise real MP3 conversion, extraction, and decoding.
SNAPYT_TEST_FFMPEG=/path/to/ffmpeg npm test --prefix snapyt

# Explicit live integration test: downloads both modes and fully decodes each.
# Requires FFmpeg and authorization to download the selected video.
node snapyt/scripts/check-live.mjs 'https://youtu.be/PqtggjVAi8M' --ffmpeg /path/to/ffmpeg
~~~

Without SNAPYT_TEST_FFMPEG, conversion-specific local tests are clearly skipped;
the ordinary transfer and error tests still run. The separate live check uses
the real service, writes files under snapyt/downloads/live by default, and emits
a sanitized JSON summary with byte counts and SHA-256 hashes for successful,
fully decoded downloads. Any blocked, failed, or undecodable download gives a
nonzero exit status. Local fixtures never count as live provider success.
