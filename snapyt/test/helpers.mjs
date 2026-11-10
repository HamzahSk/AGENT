import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SnapYTClient } from '../index.mjs';
import { ORIGIN } from '../protocol.mjs';

export const testUrl = 'https://youtu.be/PqtggjVAi8M';
export const clip = await readFile(new URL('./fixtures/clip.mp4', import.meta.url));
export const mp3 = await readFile(new URL('./fixtures/tone.mp3', import.meta.url));
export const webm = await readFile(new URL('./fixtures/tone.webm', import.meta.url));
export const videoFormat = { id: '18', label: '360p MP4 with audio', body: clip, mime: 'video/mp4' };
export const mp3Format = { id: 'mp3', label: 'MP3 128kbps', body: mp3, mime: 'audio/mpeg' };
export const webmFormat = { id: '251', label: 'Audio only 128kbps', body: webm, mime: 'audio/webm' };

// All values in these HTML fixtures are synthetic. Never record a live session
// or live request nonce in a test fixture.
export function forceUrl(id) {
  return ORIGIN + '/wp-admin/admin-ajax.php?' + new URLSearchParams({
    action: 'snapyt_force_download', pid: 'fixture-video', fmt: id, nonce: 'fixture-nonce',
  });
}

export function resultHtml(formats, title = 'Original test clip') {
  return '<html><head><meta content="' + title + '" property="og:title"></head><body>' +
    formats.map(format => '<a data-force="' + forceUrl(format.id).replaceAll('&', '&amp;') + '">' + format.label + '</a>').join('') +
    '</body></html>';
}

export async function startSite(t, options = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'snapyt-test-'));
  const outputDir = join(directory, 'downloads');
  const formats = options.formats ?? [videoFormat, webmFormat];
  const state = { requests: [], forms: [], errors: [] };
  const server = createServer((request, response) => {
    void (async () => {
      const url = new URL(request.url, ORIGIN);
      state.requests.push({
        method: request.method, path: url.pathname, format: url.searchParams.get('fmt'),
        host: request.headers['x-fixture-host'], cookie: request.headers.cookie,
      });
      if (await options.route?.(request, response, url, state)) return;
      if (url.pathname === '/id/') {
        response.setHeader('content-type', 'text/html');
        response.setHeader('set-cookie', 'fixture_visitor=anonymous; Path=/; Secure; HttpOnly');
        response.end(options.landing ?? '<html><title>SnapYT fixture</title><script>const VD_NONCE = "fixture-nonce";</script></html>');
      } else if (url.pathname === '/wp-admin/admin-ajax.php' && request.method === 'POST') {
        let form = '';
        for await (const chunk of request) form += chunk;
        state.forms.push(Object.fromEntries(new URLSearchParams(form)));
        response.setHeader('content-type', 'application/json');
        response.end(options.ajax ?? JSON.stringify({ success: true, data: { redirect_url: '/fixture-result/' } }));
      } else if (url.pathname === '/fixture-result/') {
        response.setHeader('content-type', 'text/html');
        response.end(options.result ?? resultHtml(formats, options.title));
      } else if (url.searchParams.get('action') === 'snapyt_force_download') {
        const format = formats.find(candidate => candidate.id === url.searchParams.get('fmt'));
        if (!format) { response.writeHead(404).end(); return; }
        response.setHeader('content-type', format.mime);
        response.setHeader('content-length', format.body.length);
        response.end(format.body);
      } else {
        response.writeHead(404).end();
      }
    })().catch(error => {
      state.errors.push(error);
      response.writeHead(500).end('Fixture server failed');
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
    assert.equal(state.errors.length, 0, 'fixture server must not fail');
  });
  const origin = 'http://127.0.0.1:' + server.address().port;
  const fetchImpl = (input, init) => {
    const url = new URL(input);
    const headers = new Headers(init.headers);
    headers.set('x-fixture-host', url.hostname);
    return fetch(origin + url.pathname + url.search, { ...init, headers });
  };
  const client = new SnapYTClient({ ...options.client, fetchImpl });
  return {
    client, directory, outputDir, state,
    files: async () => {
      try { return await readdir(outputDir); } catch (error) { if (error.code === 'ENOENT') return []; throw error; }
    },
  };
}
