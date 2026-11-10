import { createWriteStream } from 'node:fs';
import { link, mkdir, mkdtemp, open, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { SnapYTError } from './errors.mjs';
import { HttpSession, positiveInteger, readText, withDeadline } from './http.mjs';
import {
  AJAX_URL, LANDING_URL, ORIGIN, assertNoChallenge, extractNonce,
  normalizeYouTubeUrl, parseAjaxResponse, parseResultPage, selectFormats, validateSelection,
} from './protocol.mjs';

export { SnapYTError, normalizeYouTubeUrl };

const defaultMaximumBytes = 512 * 1024 * 1024;
const supportedMimeTypes = new Map([
  ['video/mp4', 'mp4'], ['video/webm', 'webm'],
  ['audio/mp4', 'mp4'], ['audio/x-m4a', 'mp4'],
  ['audio/mpeg', 'mp3'], ['audio/mp3', 'mp3'],
  ['audio/webm', 'webm'], ['audio/ogg', 'ogg'],
  ['audio/wav', 'wav'], ['audio/x-wav', 'wav'],
]);
const genericMimeTypes = new Set(['', 'application/octet-stream', 'binary/octet-stream']);

function mediaSignature(bytes) {
  if (bytes.length < 12) return null;
  if (bytes.toString('ascii', 4, 8) === 'ftyp') return 'mp4';
  if (bytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) return 'webm';
  if (bytes.toString('ascii', 0, 4) === 'OggS') return 'ogg';
  if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WAVE') return 'wav';
  if (bytes.toString('ascii', 0, 3) === 'ID3' ||
      (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0 && (bytes[1] & 0x06) === 0x02 &&
       (bytes[1] & 0x18) !== 0x08 && (bytes[2] & 0xf0) !== 0xf0)) return 'mp3';
  return null;
}

function identifyMedia(bytes, mime, candidate, requestedType) {
  const container = mediaSignature(bytes);
  if (!container || (!genericMimeTypes.has(mime) && supportedMimeTypes.get(mime) !== container)) {
    throw new SnapYTError('INVALID_MEDIA', 'SnapYT did not return a supported media file matching its content type.', { stage: 'download' });
  }
  const type = ['mp3', 'ogg', 'wav'].includes(container) ? 'audio'
    : mime.startsWith('audio/') ? 'audio' : mime.startsWith('video/') ? 'video' : candidate.type;
  if (type === 'unknown' || (requestedType === 'video' && type !== 'video')) {
    throw new SnapYTError('UNAVAILABLE_FORMAT', 'The selected resource is not a usable ' + requestedType + ' format.', { stage: 'download' });
  }
  return { container, type, extension: container === 'mp4' && type === 'audio' ? 'm4a' : container };
}

function safeStem(value) {
  const cleaned = value.normalize('NFKC')
    .replace(/[\p{Cc}\p{Cf}<>:"/\\|?*]/gu, '-')
    .replace(/\s+/g, ' ').replace(/^[.\s-]+|[.\s-]+$/g, '');
  let result = '';
  for (const character of cleaned) {
    if (Buffer.byteLength(result + character, 'utf8') > 140) break;
    result += character;
  }
  result = result.replace(/[.\s]+$/g, '') || 'YouTube video';
  return /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(result) ? '_' + result : result;
}

async function publishFile(source, directory, stem, extension, signal) {
  for (let number = 0; number < 1000; number++) {
    signal.throwIfAborted();
    const destination = join(directory, stem + (number ? ' (' + number + ')' : '') + '.' + extension);
    try {
      // Both paths are on the same filesystem. Link creation is atomic and
      // fails if the destination exists, including if it is a symlink.
      await link(source, destination);
      return destination;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }
  }
  throw new SnapYTError('FILE_ERROR', 'Too many files already use this output filename.');
}

function contentLength(response) {
  if (response.headers.has('content-encoding')) return null;
  const raw = response.headers.get('content-length');
  if (raw === null) return null;
  const length = Number(raw);
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(length)) {
    throw new SnapYTError('INVALID_MEDIA', 'The media response has an invalid content length.', { stage: 'download' });
  }
  return length;
}

async function saveMedia(response, file, { candidate, type, maximumBytes, signal }) {
  try {
    const mime = (response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
    if (mime === 'text/html' || mime === 'application/xhtml+xml') {
      const html = await readText(response, 512 * 1024);
      assertNoChallenge(html, 'download', response.status);
      throw new SnapYTError('INVALID_MEDIA', 'SnapYT returned an HTML page instead of a media file.', { stage: 'download' });
    }
    if (!genericMimeTypes.has(mime) && !supportedMimeTypes.has(mime)) {
      throw new SnapYTError('INVALID_MEDIA', 'SnapYT returned an unsupported media content type.', { stage: 'download' });
    }
    let expectedBytes = contentLength(response);
    const range = response.headers.get('content-range');
    if (response.status === 206 || range) {
      const match = range?.match(/^bytes 0-(\d+)\/(\d+)$/);
      const total = match ? Number(match[2]) : 0;
      if (!match || !Number.isSafeInteger(total) || Number(match[1]) + 1 !== total ||
          (expectedBytes !== null && expectedBytes !== total)) {
        throw new SnapYTError('INCOMPLETE_DOWNLOAD', 'SnapYT returned only part of the requested media file.', { stage: 'download' });
      }
      expectedBytes = total;
    } else if (response.status !== 200) {
      throw new SnapYTError('INVALID_MEDIA', 'SnapYT returned an unexpected media status.', { stage: 'download' });
    }
    if (expectedBytes !== null && expectedBytes > maximumBytes) {
      throw new SnapYTError('FILE_TOO_LARGE', 'The download exceeds maxBytes.', { stage: 'download' });
    }
    if (!response.body) throw new SnapYTError('INVALID_MEDIA', 'SnapYT returned an empty media body.', { stage: 'download' });
    let bytes = 0;
    let prefix = Buffer.alloc(0);
    let media;
    const check = new Transform({
      transform(chunk, encoding, callback) {
        try {
          bytes += chunk.length;
          if (bytes > maximumBytes) throw new SnapYTError('FILE_TOO_LARGE', 'The download exceeds maxBytes.', { stage: 'download' });
          if (!media) {
            prefix = Buffer.concat([prefix, chunk]);
            if (prefix.length < 16) return callback();
            media = identifyMedia(prefix, mime, candidate, type);
            const buffered = prefix;
            prefix = null;
            return callback(null, buffered);
          }
          callback(null, chunk);
        } catch (error) { callback(error); }
      },
      flush(callback) {
        if (!media || !bytes) return callback(new SnapYTError('INVALID_MEDIA', 'The downloaded media is empty or too short.', { stage: 'download' }));
        if (expectedBytes !== null && expectedBytes !== bytes) {
          return callback(new SnapYTError('INCOMPLETE_DOWNLOAD', 'The media transfer ended before the complete file arrived.', { stage: 'download' }));
        }
        callback();
      },
    });
    await pipeline(Readable.fromWeb(response.body), check, createWriteStream(file, { flags: 'wx' }), { signal });
    return { ...media, bytes };
  } finally {
    if (!response.body?.locked) await response.body?.cancel().catch(() => {});
  }
}

async function convertToMp3(source, destination, executable, maximumBytes, signal) {
  signal.throwIfAborted();
  const child = spawn(executable, [
    '-nostdin', '-hide_banner', '-loglevel', 'error', '-n',
    '-protocol_whitelist', 'file,pipe', '-i', source,
    '-map', '0:a:0', '-vn', '-codec:a', 'libmp3lame', '-b:a', '192k', '-f', 'mp3', 'pipe:1',
  ], { stdio: ['ignore', 'pipe', 'ignore'], signal, killSignal: 'SIGKILL', windowsHide: true });
  let spawnError;
  const completion = new Promise((resolveCompletion, rejectCompletion) => {
    child.once('error', error => { spawnError = error; });
    child.once('close', code => {
      if (spawnError?.code === 'ENOENT') {
        rejectCompletion(new SnapYTError('FFMPEG_UNAVAILABLE', 'MP3 conversion requires FFmpeg with libmp3lame. Install it or set ffmpegPath.', { stage: 'conversion' }));
      } else if (spawnError || code !== 0) {
        rejectCompletion(new SnapYTError('CONVERSION_FAILED', 'FFmpeg could not convert an audio track to MP3.', { stage: 'conversion' }));
      } else resolveCompletion();
    });
  });
  let bytes = 0;
  const limit = new Transform({
    transform(chunk, encoding, callback) {
      bytes += chunk.length;
      callback(bytes > maximumBytes ? new SnapYTError('FILE_TOO_LARGE', 'The converted MP3 exceeds maxBytes.', { stage: 'conversion' }) : null, chunk);
    },
  });
  const transfer = pipeline(child.stdout, limit, createWriteStream(destination, { flags: 'wx' }), { signal })
    .catch(error => { child.kill('SIGKILL'); throw error; });
  const [processResult, transferResult] = await Promise.allSettled([completion, transfer]);
  // A pipe limit/abort can also make FFmpeg exit nonzero; preserve that cause.
  if (transferResult.status === 'rejected') throw transferResult.reason;
  if (processResult.status === 'rejected') throw processResult.reason;
  const handle = await open(destination, 'r');
  try {
    const prefix = Buffer.alloc(16);
    const read = await handle.read(prefix, 0, prefix.length, 0);
    if (mediaSignature(prefix.subarray(0, read.bytesRead)) !== 'mp3') {
      throw new SnapYTError('CONVERSION_FAILED', 'FFmpeg did not produce a valid MP3 header.', { stage: 'conversion' });
    }
  } finally { await handle.close(); }
  return bytes;
}

function publicInfo(result) {
  return {
    id: result.id,
    sourceUrl: result.sourceUrl,
    title: result.title,
    formats: result.formats.map(({ id, label, type, hasAudio, quality }) => ({ id, label, type, hasAudio, quality })),
  };
}

export class SnapYTClient {
  #fetch;
  #timeoutMs;
  #downloadTimeoutMs;
  #maximumBytes;
  #ffmpegPath;

  constructor({ fetchImpl = globalThis.fetch, timeoutMs = 30_000, downloadTimeoutMs = 180_000,
    maxBytes = defaultMaximumBytes, ffmpegPath = 'ffmpeg' } = {}) {
    if (typeof fetchImpl !== 'function') throw new SnapYTError('INVALID_OPTION', 'fetchImpl must be a function.');
    this.#fetch = fetchImpl;
    this.#timeoutMs = positiveInteger(timeoutMs, 'timeoutMs');
    this.#downloadTimeoutMs = positiveInteger(downloadTimeoutMs, 'downloadTimeoutMs');
    if (Math.max(timeoutMs, downloadTimeoutMs) > 2_147_483_647) throw new SnapYTError('INVALID_OPTION', 'Timeouts must not exceed 2147483647 milliseconds.');
    this.#maximumBytes = positiveInteger(maxBytes, 'maxBytes');
    if (typeof ffmpegPath !== 'string' || !ffmpegPath.trim()) throw new SnapYTError('INVALID_OPTION', 'ffmpegPath must be a non-empty string.');
    this.#ffmpegPath = ffmpegPath;
  }

  async #resolve(input, signal) {
    const source = normalizeYouTubeUrl(input);
    return withDeadline(this.#timeoutMs, signal, 'inspection', async deadline => {
      const session = new HttpSession(this.#fetch);
      const html = await session.text(LANDING_URL, {
        signal: deadline, stage: 'landing', headers: { accept: 'text/html' },
      });
      const nonce = extractNonce(html);
      const result = await session.text(AJAX_URL, {
        method: 'POST', signal: deadline, stage: 'resolve',
        headers: { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8', origin: ORIGIN, referer: LANDING_URL },
        body: new URLSearchParams({ action: 'process_video_url', video_url: source.url, security: nonce }),
      }, 64 * 1024);
      const resultUrl = parseAjaxResponse(result);
      const page = await session.text(resultUrl, {
        signal: deadline, stage: 'result', headers: { accept: 'text/html', referer: LANDING_URL },
      });
      return { ...parseResultPage(page), id: source.id, sourceUrl: source.url, session };
    });
  }

  /** Format labels are page metadata; download() also verifies the media response. */
  async getInfo(input, { signal } = {}) {
    return publicInfo(await this.#resolve(input, signal));
  }

  /** Resolve fresh links and publish a complete local file without overwriting. */
  async download(input, { type = 'video', format, outputDir = 'downloads', filename, signal } = {}) {
    // Validate local options before making any network requests.
    validateSelection(type, format);
    if (typeof outputDir !== 'string' || !outputDir.trim() || outputDir.includes('\0') ||
        (filename !== undefined && (typeof filename !== 'string' || !filename.trim()))) {
      throw new SnapYTError('INVALID_OPTION', 'outputDir and filename must be non-empty strings.');
    }
    const result = await this.#resolve(input, signal);
    const candidates = selectFormats(result.formats, type, format);
    const directory = resolve(outputDir);
    return withDeadline(this.#downloadTimeoutMs, signal, 'download', async deadline => {
      let temporary;
      try {
        await mkdir(directory, { recursive: true });
        temporary = await mkdtemp(join(directory, '.snapyt-'));
        for (const candidate of candidates) {
          const sourceFile = join(temporary, 'source.part');
          const convertedFile = join(temporary, 'audio.part');
          try {
            const response = await result.session.request(candidate.url, {
              signal: deadline, stage: 'download', media: true,
              headers: { accept: 'video/*,audio/*,application/octet-stream' },
            });
            let media = await saveMedia(response, sourceFile, {
              candidate, type, maximumBytes: this.#maximumBytes, signal: deadline,
            });
            const converted = type === 'audio' && media.container !== 'mp3';
            if (converted) {
              const bytes = await convertToMp3(sourceFile, convertedFile, this.#ffmpegPath, this.#maximumBytes, deadline);
              media = { container: 'mp3', extension: 'mp3', type: 'audio', bytes };
            }
            const stem = safeStem(filename ?? result.title) + ' [' + result.id + '] ' + safeStem(candidate.quality ?? candidate.id);
            const file = await publishFile(converted ? convertedFile : sourceFile, directory, stem, media.extension, deadline);
            return {
              file, bytes: media.bytes, type: media.type, extension: media.extension, converted,
              videoId: result.id, formatId: candidate.id,
              hasAudio: type === 'audio' ? true : candidate.hasAudio,
            };
          } catch (error) {
            // A mislabeled individual format may have a usable sibling.
            // Never retry a challenge, rate limit, timeout, or explicit format choice.
            if (format !== undefined || !['INVALID_MEDIA', 'UNAVAILABLE_FORMAT'].includes(error.code)) throw error;
          } finally {
            await rm(sourceFile, { force: true });
            await rm(convertedFile, { force: true });
          }
        }
        throw new SnapYTError('UNAVAILABLE_FORMAT', 'None of the offered resources provided a usable ' + type + ' file.', { stage: 'download' });
      } catch (error) {
        if (error instanceof SnapYTError) throw error;
        const local = ['EACCES', 'EPERM', 'ENOSPC', 'ENOENT', 'ENOTDIR', 'EEXIST', 'EIO', 'EROFS', 'ENAMETOOLONG', 'EMFILE', 'EXDEV'].includes(error.code);
        throw new SnapYTError(local ? 'FILE_ERROR' : 'DOWNLOAD_FAILED',
          local ? 'The local file could not be written.' : 'The media transfer failed before a complete file was saved.', { stage: 'download' });
      } finally {
        if (temporary) {
          try { await rm(temporary, { recursive: true, force: true }); } catch {
            throw new SnapYTError('FILE_ERROR', 'Temporary download files could not be removed.', { stage: 'download' });
          }
        }
      }
    });
  }
}
