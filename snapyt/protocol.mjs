import { SnapYTError } from './errors.mjs';

export const ORIGIN = 'https://www.snapyt.app';
export const LANDING_URL = ORIGIN + '/id/';
export const AJAX_URL = ORIGIN + '/wp-admin/admin-ajax.php';

const youtubeHosts = new Set([
  'youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com',
]);
const combinedFormats = new Map([['0', 360], ['18', 360], ['22', 720]]);
const audioFormats = new Set(['139', '140', '141', '171', '172', '249', '250', '251', '256', '258', '325', '328']);

export function normalizeYouTubeUrl(input) {
  const invalid = () => new SnapYTError('INVALID_URL', 'Provide a YouTube video URL with a valid 11-character video ID.');
  if (typeof input !== 'string' || input.length > 2048) throw invalid();
  let url;
  try { url = new URL(input.trim()); } catch { throw invalid(); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port) throw invalid();
  let id;
  if (url.hostname === 'youtu.be') {
    id = url.pathname.match(/^\/([A-Za-z0-9_-]{11})\/?$/)?.[1];
  } else if (youtubeHosts.has(url.hostname)) {
    if (/^\/watch\/?$/.test(url.pathname) && url.searchParams.getAll('v').length === 1) {
      id = url.searchParams.get('v');
    } else {
      id = url.pathname.match(/^\/(?:shorts|embed)\/([A-Za-z0-9_-]{11})\/?$/)?.[1];
    }
  }
  if (!id || !/^[A-Za-z0-9_-]{11}$/.test(id)) throw invalid();
  return { id, url: 'https://www.youtube.com/watch?v=' + id };
}

export function extractNonce(html) {
  const nonce = html.match(/\bVD_NONCE\s*=\s*(["'])([A-Za-z0-9_-]{6,128})\1/)?.[2];
  if (!nonce) {
    throw new SnapYTError('PROTOCOL_CHANGED', 'SnapYT did not supply the expected page nonce.', { stage: 'landing' });
  }
  return nonce;
}

export function assertNoChallenge(html, stage, status) {
  const title = html.match(/<title\b[^>]*>([\s\S]{0,250}?)<\/title>/i)?.[1] ?? '';
  // Cloudflare also inserts passive JS detection on ordinary public pages.
  // A script URL alone does not establish that access is restricted.
  const deniedTitle = /just a moment|attention required|access denied|verify you are human|^\s*(?:sign in|log in)\s*$/i.test(title);
  const challengeForm = /<form\b[^>]*\bid\s*=\s*["'](?:challenge-form|challenge-stage)["']/i.test(html);
  if (challengeForm || (deniedTitle && !/\bVD_NONCE\s*=/.test(html))) {
    throw new SnapYTError('ACCESS_RESTRICTED', 'SnapYT requires an access challenge or sign-in; the request was stopped.', { stage, status });
  }
}

export function checkedUrl(value, { media = false } = {}) {
  let url;
  try { url = new URL(value, ORIGIN); } catch {
    throw new SnapYTError('UNSAFE_URL', 'SnapYT returned an invalid URL.');
  }
  const allowed = url.origin === ORIGIN || (media && (
    url.hostname === 'snapyt.app' || url.hostname.endsWith('.snapyt.app') ||
    url.hostname === 'googlevideo.com' || url.hostname.endsWith('.googlevideo.com')
  ));
  if (!allowed || url.protocol !== 'https:' || url.username || url.password || url.port) {
    throw new SnapYTError('UNSAFE_URL', 'SnapYT returned a URL outside the supported HTTPS hosts.');
  }
  url.hash = '';
  return url;
}

export function parseAjaxResponse(text) {
  let payload;
  try { payload = JSON.parse(text); } catch {
    throw new SnapYTError('PROTOCOL_CHANGED', 'SnapYT returned invalid JSON.', { stage: 'resolve' });
  }
  if (!payload || typeof payload.success !== 'boolean') {
    throw new SnapYTError('PROTOCOL_CHANGED', 'SnapYT returned an unexpected response.', { stage: 'resolve' });
  }
  if (!payload.success) {
    const data = payload.data;
    const detail = typeof data === 'string' ? data : [data?.message, data?.error, data?.reason, data?.code]
      .filter(value => typeof value === 'string').join(' ');
    if (/private|members.only|sign.?in|login|age.restrict|drm|pribadi/i.test(detail)) {
      throw new SnapYTError('ACCESS_RESTRICTED', 'The video is private or restricted.', { stage: 'resolve' });
    }
    if (/not.?found|removed|deleted|unavailable|tidak tersedia|dihapus/i.test(detail)) {
      throw new SnapYTError('VIDEO_UNAVAILABLE', 'The video is unavailable.', { stage: 'resolve' });
    }
    if (/invalid|unsupported|playlist/i.test(detail)) {
      throw new SnapYTError('INVALID_URL', 'SnapYT does not support this video URL.', { stage: 'resolve' });
    }
    if (/rate.limit|too many|capacity/i.test(detail)) {
      throw new SnapYTError('RATE_LIMITED', 'SnapYT is rate limiting requests.', { stage: 'resolve' });
    }
    throw new SnapYTError('UPSTREAM_ERROR', 'SnapYT could not process the video.', { stage: 'resolve' });
  }
  const location = payload.data?.redirect_url ?? payload.data?.redirectUrl ?? payload.data?.redirect;
  if (typeof location !== 'string' || !location.trim() || location.length > 4096) {
    throw new SnapYTError('PROTOCOL_CHANGED', 'SnapYT omitted the result page URL.', { stage: 'resolve' });
  }
  return checkedUrl(location).href;
}

function decodeHtml(value) {
  const named = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ' };
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|quot|apos|lt|gt|nbsp);/gi, (entity, key) => {
    if (key[0] !== '#') return named[key.toLowerCase()];
    const number = key[1].toLowerCase() === 'x' ? parseInt(key.slice(2), 16) : Number(key.slice(1));
    return number > 0 && number <= 0x10ffff && !(number >= 0xd800 && number <= 0xdfff)
      ? String.fromCodePoint(number) : '\ufffd';
  });
}

function plainText(value) {
  return decodeHtml(value.replace(/<[^>]*>/g, ' ')).replace(/[\p{Cc}\p{Cf}]/gu, ' ').replace(/\s+/g, ' ').trim();
}

function attributes(tag) {
  const values = new Map();
  const pattern = /\s([A-Za-z_:][-A-Za-z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>]+))/g;
  for (const match of tag.matchAll(pattern)) {
    const key = match[1].toLowerCase();
    if (!values.has(key)) values.set(key, decodeHtml(match[2] ?? match[3] ?? match[4]));
  }
  return values;
}

function forceDownload(value) {
  if (!value || value.length > 8192) return null;
  let url;
  try { url = checkedUrl(value); } catch { return null; }
  if (url.pathname !== '/wp-admin/admin-ajax.php') return null;
  const allowedKeys = new Set(['action', 'pid', 'fmt', 'nonce']);
  if ([...url.searchParams.keys()].some(key => !allowedKeys.has(key))) return null;
  for (const key of allowedKeys) {
    const values = url.searchParams.getAll(key);
    if (values.length !== 1 || !values[0] || values[0].length > 256) return null;
  }
  if (url.searchParams.get('action') !== 'snapyt_force_download') return null;
  const id = url.searchParams.get('fmt');
  // Accept an MP3 link only if the page actually offers it; never synthesize one.
  if (!/^(?:\d{1,4}|mp3)$/.test(id)) return null;
  return { id, url: url.href };
}

function describeFormat(candidate, label) {
  const videoOnly = /video[\s-]*only|only[\s-]*video|tanpa suara|no audio/i.test(label);
  const audioOnly = /audio[\s-]*only|only[\s-]*audio/i.test(label);
  const height = label.match(/\b(\d{2,4})\s*p\b/i)?.[1];
  const bitrate = label.match(/\b(\d{2,4})\s*(?:kbps|kbit\/s|kb\/s)\b/i)?.[1];
  const mp3 = /\bmp3\b/i.test(label) || candidate.id === 'mp3';
  let type = 'unknown';
  let hasAudio = null;
  if (audioOnly || mp3) {
    type = 'audio';
    hasAudio = true;
  } else if (videoOnly || height || combinedFormats.has(candidate.id)) {
    type = 'video';
    hasAudio = videoOnly ? false : combinedFormats.has(candidate.id) || /with audio|combined|video\s*\+\s*audio/i.test(label) ? true : null;
  } else if (audioFormats.has(candidate.id) || /\baudio\b|\bm4a\b|\bopus\b|\baac\b|kbps/i.test(label)) {
    type = 'audio';
    hasAudio = true;
  } else if (/\bvideo\b|\bmp4\b|\bwebm\b/i.test(label)) {
    type = 'video';
  }
  const resolution = height ? Number(height) : type === 'video' ? combinedFormats.get(candidate.id) ?? 0 : 0;
  return {
    ...candidate,
    label: label.slice(0, 160) || 'Format ' + candidate.id,
    type,
    hasAudio,
    quality: resolution ? resolution + 'p' : bitrate ? bitrate + 'kbps' : null,
    rank: resolution || Number(bitrate ?? 0),
    mp3,
  };
}

export function parseResultPage(html) {
  const source = html.replace(/<!--[\s\S]*?-->|<script\b[^>]*>[\s\S]*?<\/script>|<style\b[^>]*>[\s\S]*?<\/style>/gi, '');
  const lowerSource = source.toLowerCase();
  let title;
  const formats = [];
  const seen = new Set();
  for (const match of source.matchAll(/<([A-Za-z][A-Za-z0-9:-]*)\b(?:[^"'<>]|"[^"]*"|'[^']*')*>/g)) {
    const tag = match[1].toLowerCase();
    const attrs = attributes(match[0]);
    if (tag === 'meta' && (attrs.get('property') ?? attrs.get('name'))?.toLowerCase() === 'og:title') {
      title = plainText(attrs.get('content') ?? '').slice(0, 300) || title;
    }
    if (!['a', 'button'].includes(tag)) continue;
    const candidate = forceDownload(attrs.get('data-force') ?? attrs.get('href'));
    if (!candidate || seen.has(candidate.id)) continue;
    seen.add(candidate.id);
    const start = match.index + match[0].length;
    const end = lowerSource.indexOf('</' + tag, start);
    const content = source.slice(start, end < 0 ? start : Math.min(end, start + 512));
    const label = plainText(content) || plainText(attrs.get('aria-label') ?? attrs.get('title') ?? '');
    formats.push(describeFormat(candidate, label));
    if (formats.length >= 100) break;
  }
  title ||= plainText(source.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ??
    source.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '').slice(0, 300);
  if (formats.length === 0) {
    throw new SnapYTError('NO_FORMATS', 'SnapYT returned no supported download links; the video may be unavailable or the page may have changed.', { stage: 'result' });
  }
  return { title: title || 'YouTube video', formats };
}

export function validateSelection(type, formatId) {
  if (!['video', 'audio'].includes(type)) throw new SnapYTError('INVALID_OPTION', 'The download type must be video or audio.');
  if (formatId !== undefined && (typeof formatId !== 'string' || !formatId)) {
    throw new SnapYTError('INVALID_OPTION', 'The format ID must be a non-empty string.');
  }
}

export function selectFormats(formats, type, formatId) {
  validateSelection(type, formatId);
  const candidates = formats.filter(format =>
    (formatId === undefined || format.id === formatId) &&
    (type === 'video' ? format.type !== 'audio' : format.hasAudio !== false),
  );
  const preference = format => type === 'video'
    ? format.hasAudio === true ? 2 : format.type === 'video' ? 1 : 0
    : format.mp3 ? 3 : format.type === 'audio' ? 2 : format.hasAudio === true ? 1 : 0;
  candidates.sort((left, right) => preference(right) - preference(left) || right.rank - left.rank);
  if (candidates.length === 0) {
    throw new SnapYTError('UNAVAILABLE_FORMAT', 'The requested ' + type + ' format is not available.');
  }
  return candidates.slice(0, 5);
}
