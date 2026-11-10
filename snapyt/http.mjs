import { SnapYTError } from './errors.mjs';
import { ORIGIN, assertNoChallenge, checkedUrl } from './protocol.mjs';

const redirects = new Set([301, 302, 303, 307, 308]);

export function positiveInteger(value, name) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new SnapYTError('INVALID_OPTION', name + ' must be a positive safe integer.');
  }
  return value;
}

export async function withDeadline(timeoutMs, signal, stage, operation) {
  if (signal !== undefined && !(signal instanceof AbortSignal)) {
    throw new SnapYTError('INVALID_OPTION', 'signal must be an AbortSignal.');
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new DOMException('Deadline exceeded', 'TimeoutError')), timeoutMs);
  const combined = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
  try {
    combined.throwIfAborted();
    return await operation(combined);
  } catch (error) {
    if (combined.aborted) {
      const timeout = combined.reason?.name === 'TimeoutError';
      throw new SnapYTError(timeout ? 'TIMEOUT' : 'ABORTED', timeout ? 'SnapYT ' + stage + ' timed out.' : 'The operation was cancelled.', { stage });
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function readText(response, maximumBytes) {
  if (!response.body) throw new SnapYTError('PROTOCOL_CHANGED', 'SnapYT returned an empty response.');
  const chunks = [];
  let bytes = 0;
  try {
    for await (const chunk of response.body) {
      bytes += chunk.byteLength;
      if (bytes > maximumBytes) throw new SnapYTError('RESPONSE_TOO_LARGE', 'SnapYT returned an oversized text response.');
      chunks.push(Buffer.from(chunk));
    }
  } catch (error) {
    if (error instanceof SnapYTError) throw error;
    throw new SnapYTError('NETWORK_ERROR', 'Reading the SnapYT response failed.');
  }
  return Buffer.concat(chunks).toString('utf8');
}

// Only cookies issued by a successful anonymous request to the exact page origin
// are kept, in memory, for this one operation. They are never exported or logged.
export class HttpSession {
  #fetch;
  #cookies = new Map();

  constructor(fetchImpl) {
    this.#fetch = fetchImpl;
  }

  #rememberCookies(response, url) {
    if (url.origin !== ORIGIN) return;
    for (const line of response.headers.getSetCookie?.() ?? []) {
      if (line.length > 4096) continue;
      const [pair, ...attributes] = line.split(';');
      const separator = pair.indexOf('=');
      if (separator <= 0) continue;
      const name = pair.slice(0, separator).trim();
      if (!/^[A-Za-z0-9_-]+$/.test(name)) continue;
      const flags = new Map(attributes.map(part => {
        const split = part.indexOf('=');
        return split < 0 ? [part.trim().toLowerCase(), ''] : [part.slice(0, split).trim().toLowerCase(), part.slice(split + 1).trim()];
      }));
      const domain = flags.get('domain')?.replace(/^\./, '').toLowerCase();
      if (domain && domain !== url.hostname && domain !== 'snapyt.app') continue;
      const maxAge = flags.get('max-age');
      const expiry = maxAge !== undefined && /^-?\d+$/.test(maxAge)
        ? Date.now() + Number(maxAge) * 1000 : flags.has('expires') ? Date.parse(flags.get('expires')) : Infinity;
      const path = flags.get('path') || url.pathname.slice(0, url.pathname.lastIndexOf('/') + 1);
      const key = name + ':' + path;
      if (expiry <= Date.now() || pair.slice(separator + 1) === '') this.#cookies.delete(key);
      else if (this.#cookies.size < 24) this.#cookies.set(key, { name, pair: pair.trim(), path, expiry });
    }
  }

  async request(value, { method = 'GET', body, headers = {}, signal, stage, media = false } = {}) {
    let url = checkedUrl(value, { media });
    for (let hop = 0; hop <= 5; hop++) {
      signal?.throwIfAborted();
      const requestHeaders = new Headers(headers);
      requestHeaders.set('user-agent', 'SnapYT-ESM/0.1');
      if (url.origin === ORIGIN) {
        const cookies = [...this.#cookies.values()].filter(cookie => cookie.expiry > Date.now() &&
          (url.pathname === cookie.path || url.pathname.startsWith(cookie.path.endsWith('/') ? cookie.path : cookie.path + '/')))
          .sort((left, right) => right.path.length - left.path.length).map(cookie => cookie.pair).join('; ');
        if (cookies) requestHeaders.set('cookie', cookies);
      }
      let response;
      try {
        response = await this.#fetch(url, { method, headers: requestHeaders, body, signal, redirect: 'manual' });
      } catch {
        throw new SnapYTError('NETWORK_ERROR', 'The SnapYT request could not be reached.', { stage });
      }
      const fail = async (code, message) => {
        await response.body?.cancel().catch(() => {});
        throw new SnapYTError(code, message, { status: response.status, stage });
      };
      if ([401, 403].includes(response.status) || response.headers.get('cf-mitigated') === 'challenge') {
        await fail('ACCESS_RESTRICTED', 'SnapYT denied access or requires a browser challenge; the request was stopped.');
      }
      if (response.status === 429) await fail('RATE_LIMITED', 'SnapYT is rate limiting requests; try again later.');
      if (response.ok || redirects.has(response.status)) this.#rememberCookies(response, url);
      if (redirects.has(response.status)) {
        const location = response.headers.get('location');
        await response.body?.cancel().catch(() => {});
        if (!location || hop === 5) throw new SnapYTError('REDIRECT_ERROR', 'SnapYT returned a missing or excessive redirect.', { stage });
        let target;
        try { target = new URL(location, url); } catch {
          throw new SnapYTError('UNSAFE_URL', 'SnapYT returned an invalid redirect.', { stage });
        }
        url = checkedUrl(target.href, { media });
        if (response.status === 303 || ([301, 302].includes(response.status) && method === 'POST')) {
          method = 'GET';
          body = undefined;
          headers = { accept: headers.accept ?? '*/*' };
        }
        continue;
      }
      if (!response.ok) await fail('HTTP_ERROR', 'SnapYT returned HTTP ' + response.status + '.');
      return response;
    }
  }

  async text(url, options, maximumBytes = 512 * 1024) {
    const response = await this.request(url, options);
    const text = await readText(response, maximumBytes);
    assertNoChallenge(text, options.stage, response.status);
    return text;
  }
}
