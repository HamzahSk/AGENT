import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile } from 'node:fs/promises';
import { basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SnapYTClient, SnapYTError, normalizeYouTubeUrl } from '../index.mjs';
import { parseResultPage } from '../protocol.mjs';
import { clip, mp3, webm, testUrl, videoFormat, mp3Format, webmFormat, resultHtml, startSite } from './helpers.mjs';

const execute = promisify(execFile);
const ffmpeg = process.env.SNAPYT_TEST_FFMPEG;
const needsFfmpeg = { skip: ffmpeg ? false : 'Set SNAPYT_TEST_FFMPEG to run real conversion checks.' };
const codeIs = code => error => error instanceof SnapYTError && error.code === code;

test('YouTube URL validation accepts individual videos and rejects ambiguous or unsafe input', async () => {
  for (const url of [
    testUrl, testUrl + '?si=ignored',
    'https://www.youtube.com/watch?v=PqtggjVAi8M&list=ignored',
    'http://m.youtube.com/watch?v=PqtggjVAi8M',
    'https://music.youtube.com/watch?v=PqtggjVAi8M',
    'https://youtube.com/shorts/PqtggjVAi8M',
    'https://youtube.com/embed/PqtggjVAi8M',
  ]) assert.deepEqual(normalizeYouTubeUrl(url), { id: 'PqtggjVAi8M', url: 'https://www.youtube.com/watch?v=PqtggjVAi8M' });
  const client = new SnapYTClient({ fetchImpl: () => { assert.fail('invalid inputs must not make a request'); } });
  for (const url of [
    undefined, '', 'not a URL', 'file:///etc/passwd',
    'https://youtube.com.attacker.invalid/watch?v=PqtggjVAi8M',
    'https://youtube.com@attacker.invalid/watch?v=PqtggjVAi8M',
    'https://user:pass@youtube.com/watch?v=PqtggjVAi8M',
    'https://youtu.be/PqtggjVAi8M/extra',
    'https://youtu.be/too-short',
    'https://youtube.com/playlist?list=anything',
    'https://youtube.com/watch?v=PqtggjVAi8M&v=PqtggjVAi8M',
    'https://youtube.com:8443/watch?v=PqtggjVAi8M',
  ]) await assert.rejects(client.download(url), codeIs('INVALID_URL'));
  for (const options of [{ timeoutMs: 0 }, { timeoutMs: 2 ** 32 }, { maxBytes: Infinity }, { ffmpegPath: '' }, { fetchImpl: null }]) {
    assert.throws(() => new SnapYTClient(options), codeIs('INVALID_OPTION'));
  }
  await assert.rejects(client.download(testUrl, { type: 'zip' }), codeIs('INVALID_OPTION'));
  await assert.rejects(client.download(testUrl, { format: 18 }), codeIs('INVALID_OPTION'));
  await assert.rejects(client.download(testUrl, { outputDir: '' }), codeIs('INVALID_OPTION'));
  await assert.rejects(client.getInfo(testUrl, { signal: {} }), codeIs('INVALID_OPTION'));
});

test('metadata uses the nonce/AJAX/result flow without exposing transient request data', async t => {
  const site = await startSite(t);
  const info = await site.client.getInfo(testUrl);
  assert.equal(info.title, 'Original test clip');
  assert.deepEqual(info.formats.map(format => [format.id, format.type]), [['18', 'video'], ['251', 'audio']]);
  assert.deepEqual(site.state.requests.map(request => request.method), ['GET', 'POST', 'GET']);
  assert.deepEqual(site.state.forms, [{
    action: 'process_video_url', video_url: 'https://www.youtube.com/watch?v=PqtggjVAi8M', security: 'fixture-nonce',
  }]);
  assert.equal(site.state.requests[1].cookie, 'fixture_visitor=anonymous');
  assert.equal(site.state.requests[2].cookie, 'fixture_visitor=anonymous');
  assert.doesNotMatch(JSON.stringify(info), /fixture-nonce|fixture_visitor|data-force|snapyt_force_download/);
  assert.deepEqual(await site.files(), []);
});

test('passive Cloudflare JavaScript on a normal public page is not an access challenge', async t => {
  const site = await startSite(t, {
    landing: '<title>SnapYT</title><script>const VD_NONCE = "fixture-nonce";</script>' +
      '<script src="/cdn-cgi/challenge-platform/scripts/jsd/main.js"></script>',
  });
  const info = await site.client.getInfo(testUrl);
  assert.equal(info.formats.length, 2);
  assert.equal(site.state.requests.length, 3);
});

test('real MP4 bytes stream to complete files, including simultaneous filename collisions', async t => {
  const site = await startSite(t, { title: '../../CON &amp; blue &#x1f3b5;' });
  const results = await Promise.all([
    site.client.download(testUrl, { outputDir: site.outputDir }),
    site.client.download(testUrl, { outputDir: site.outputDir }),
  ]);
  assert.notEqual(results[0].file, results[1].file);
  for (const result of results) {
    assert.equal(dirname(result.file), site.outputDir);
    assert.equal(result.extension, 'mp4');
    assert.equal(result.bytes, clip.length);
    assert.equal(result.hasAudio, true);
    assert.equal(result.converted, false);
    assert.doesNotMatch(basename(result.file), /[/\\<>:"|?*\u0000-\u001f]/);
    assert.deepEqual(await readFile(result.file), clip);
  }
  assert.equal((await site.files()).length, 2);
  assert.ok((await site.files()).every(file => file.endsWith('.mp4')));
});

test('direct MP3 download retains actual MP3 bytes without requiring FFmpeg', async t => {
  const site = await startSite(t, { formats: [webmFormat, mp3Format], client: { ffmpegPath: '/nonexistent/ffmpeg' } });
  const result = await site.client.download(testUrl, { type: 'audio', outputDir: site.outputDir });
  assert.equal(result.formatId, 'mp3');
  assert.equal(result.extension, 'mp3');
  assert.equal(result.converted, false);
  assert.deepEqual(await readFile(result.file), mp3);
  assert.equal(site.state.requests.at(-1).format, 'mp3');
});

test('WebM audio becomes a decodable MP3 through the real FFmpeg binary', needsFfmpeg, async t => {
  const site = await startSite(t, { formats: [webmFormat], client: { ffmpegPath: ffmpeg } });
  const result = await site.client.download(testUrl, { type: 'audio', outputDir: site.outputDir });
  assert.equal(result.extension, 'mp3');
  assert.equal(result.converted, true);
  assert.ok(result.bytes > 100);
  assert.equal((await readFile(result.file)).subarray(0, 3).toString(), 'ID3');
  await execute(ffmpeg, ['-nostdin', '-v', 'error', '-i', result.file, '-map', '0:a:0', '-f', 'null', '-'], { timeout: 10_000 });
  assert.deepEqual(await site.files(), [basename(result.file)]);
});

test('audio can be extracted from a combined MP4 when no audio-only link exists', needsFfmpeg, async t => {
  const site = await startSite(t, { formats: [videoFormat], client: { ffmpegPath: ffmpeg } });
  const result = await site.client.download(testUrl, { type: 'audio', outputDir: site.outputDir });
  assert.equal(result.extension, 'mp3');
  assert.equal(result.converted, true);
  await execute(ffmpeg, ['-nostdin', '-v', 'error', '-i', result.file, '-map', '0:a:0', '-f', 'null', '-'], { timeout: 10_000 });
});

test('conversion failures and missing FFmpeg leave no partial output', async t => {
  const site = await startSite(t, { formats: [webmFormat], client: { ffmpegPath: '/nonexistent/ffmpeg' } });
  await assert.rejects(site.client.download(testUrl, { type: 'audio', outputDir: site.outputDir }), codeIs('FFMPEG_UNAVAILABLE'));
  assert.deepEqual(await site.files(), []);
});

test('converted output is bounded and a corrupt media stream fails conversion', needsFfmpeg, async t => {
  await t.test('output cap', async subtest => {
    const site = await startSite(subtest, { formats: [webmFormat], client: { ffmpegPath: ffmpeg, maxBytes: webm.length + 100 } });
    await assert.rejects(site.client.download(testUrl, { type: 'audio', outputDir: site.outputDir }), codeIs('FILE_TOO_LARGE'));
    assert.deepEqual(await site.files(), []);
  });
  await t.test('invalid encoding', async subtest => {
    const site = await startSite(subtest, { formats: [{ ...webmFormat, body: webm.subarray(0, 64) }], client: { ffmpegPath: ffmpeg } });
    await assert.rejects(site.client.download(testUrl, { type: 'audio', outputDir: site.outputDir }), codeIs('CONVERSION_FAILED'));
    assert.deepEqual(await site.files(), []);
  });
});

test('HTTP access restrictions, rate limits, and server errors stop without retrying', async t => {
  for (const [status, code] of [[401, 'ACCESS_RESTRICTED'], [403, 'ACCESS_RESTRICTED'], [429, 'RATE_LIMITED'], [503, 'HTTP_ERROR']]) {
    await t.test(String(status), async subtest => {
      const site = await startSite(subtest, { route(request, response) {
        response.writeHead(status, { 'content-type': 'text/html' }).end('synthetic-body-not-for-errors');
        return true;
      } });
      await assert.rejects(site.client.download(testUrl, { outputDir: site.outputDir }), error => {
        assert.equal(error.status, status);
        assert.doesNotMatch(error.message, /synthetic-body/);
        return codeIs(code)(error);
      });
      assert.equal(site.state.requests.length, 1);
      assert.deepEqual(await site.files(), []);
    });
  }
});

test('challenges and changed response schemas are detected without executing page JavaScript', async t => {
  for (const [options, code] of [
    [{ landing: '<html><title>Just a moment...</title></html>' }, 'ACCESS_RESTRICTED'],
    [{ landing: '<html><script>globalThis.mustNotRun = true;</script></html>' }, 'PROTOCOL_CHANGED'],
    [{ ajax: '<html>not JSON</html>' }, 'PROTOCOL_CHANGED'],
    [{ ajax: '{"success":true,"data":{}}' }, 'PROTOCOL_CHANGED'],
    [{ ajax: '{"success":false,"data":{"message":"private video"}}' }, 'ACCESS_RESTRICTED'],
    [{ ajax: '{"success":false,"data":"video unavailable"}' }, 'VIDEO_UNAVAILABLE'],
    [{ ajax: '{"success":false,"data":"unsupported playlist"}' }, 'INVALID_URL'],
    [{ ajax: '{"success":true,"data":{"redirect_url":"https://attacker.invalid/result"}}' }, 'UNSAFE_URL'],
    [{ result: '<html>No available formats</html>' }, 'NO_FORMATS'],
    [{ landing: 'x'.repeat(512 * 1024 + 1) }, 'RESPONSE_TOO_LARGE'],
  ]) {
    await t.test(code + ' ' + Object.keys(options)[0], async subtest => {
      const site = await startSite(subtest, options);
      await assert.rejects(site.client.getInfo(testUrl), codeIs(code));
      assert.equal(globalThis.mustNotRun, undefined);
    });
  }
});

test('unavailable explicit formats fail without a media request', async t => {
  const site = await startSite(t);
  await assert.rejects(site.client.download(testUrl, { format: '999', outputDir: site.outputDir }), codeIs('UNAVAILABLE_FORMAT'));
  assert.equal(site.state.requests.length, 3);
  assert.deepEqual(await site.files(), []);
});

test('format parsing ignores untrusted links and script decoys, and retains format zero', () => {
  const html = resultHtml([{ id: '0', label: '360p MP4' }, videoFormat]) +
    '<script>' + resultHtml([mp3Format]) + '</script>' +
    '<a data-force="https://attacker.invalid/download.mp4">MP4</a>' +
    resultHtml([videoFormat]) +
    resultHtml([{ id: '22', label: '720p' }]).replace('fmt=22', 'fmt=22&amp;fmt=18') +
    resultHtml([{ id: '23', label: '720p' }]).replace('pid=fixture-video', 'unexpected=value');
  const result = parseResultPage(html);
  assert.deepEqual(result.formats.map(format => format.id), ['0', '18']);
  assert.equal(result.formats[0].hasAudio, true);
  assert.equal(parseResultPage(resultHtml([videoFormat], '&#99999999;')).title, '\ufffd');
});

test('an audio response labeled as video is not saved as an MP4', async t => {
  const mislabeled = { ...videoFormat, id: '22', label: '720p MP4', body: webm, mime: 'audio/webm' };
  const site = await startSite(t, { formats: [mislabeled, videoFormat] });
  const result = await site.client.download(testUrl, { outputDir: site.outputDir });
  assert.equal(result.formatId, '18');
  assert.deepEqual(await readFile(result.file), clip);
  await assert.rejects(site.client.download(testUrl, { format: '22', outputDir: site.outputDir }), codeIs('UNAVAILABLE_FORMAT'));
  assert.deepEqual(await site.files(), [basename(result.file)]);
});

test('normal HTTPS CDN redirects work without forwarding anonymous site cookies', async t => {
  const site = await startSite(t, {
    formats: [videoFormat],
    route(request, response, url) {
      if (url.searchParams.get('action') === 'snapyt_force_download') {
        response.writeHead(302, { location: 'https://fixture.googlevideo.com/videoplayback' }).end();
        return true;
      }
      if (url.pathname === '/videoplayback') {
        assert.equal(request.headers.cookie, undefined);
        response.writeHead(200, { 'content-type': 'video/mp4' }).end(clip);
        return true;
      }
    },
  });
  const result = await site.client.download(testUrl, { outputDir: site.outputDir });
  assert.deepEqual(await readFile(result.file), clip);
  assert.equal(site.state.requests.at(-1).host, 'fixture.googlevideo.com');
});

test('redirects cannot escape the supported hosts or downgrade HTTPS', async t => {
  const locations = ['http://www.snapyt.app/file', 'https://www.snapyt.app.attacker.invalid/file', 'https://127.0.0.1/file', 'https://user:pass@www.snapyt.app/file', 'https://[invalid'];
  for (const [index, location] of locations.entries()) {
    await t.test('rejected redirect ' + (index + 1), async subtest => {
      const site = await startSite(subtest, { route(request, response) {
        response.writeHead(302, { location }).end();
        return true;
      } });
      await assert.rejects(site.client.getInfo(testUrl), codeIs('UNSAFE_URL'));
      assert.equal(site.state.requests.length, 1);
    });
  }
  const site = await startSite(t, { route(request, response) {
    response.writeHead(302, { location: '/id/' }).end(); return true;
  } });
  await assert.rejects(site.client.getInfo(testUrl), codeIs('REDIRECT_ERROR'));
  assert.equal(site.state.requests.length, 6);
});

test('bad, partial, and oversized media never leave a published file', async t => {
  const cases = [
    { code: 'INVALID_MEDIA', headers: { 'content-type': 'video/mp4' }, body: Buffer.from('<html>this is an error page, not MP4</html>') },
    { code: 'INVALID_MEDIA', headers: { 'content-type': 'text/html' }, body: Buffer.from('<html>ordinary error</html>') },
    { code: 'ACCESS_RESTRICTED', headers: { 'content-type': 'text/html' }, body: Buffer.from('<title>Just a moment...</title>') },
    { code: 'INVALID_MEDIA', headers: { 'content-type': 'video/mp4' }, body: Buffer.alloc(0) },
    { code: 'INCOMPLETE_DOWNLOAD', status: 206, headers: { 'content-type': 'video/mp4', 'content-range': 'bytes 0-63/' + clip.length }, body: clip.subarray(0, 64) },
    { code: 'FILE_TOO_LARGE', headers: { 'content-type': 'video/mp4', 'content-length': clip.length }, body: clip, maxBytes: 100 },
    { code: 'FILE_TOO_LARGE', headers: { 'content-type': 'video/mp4', 'transfer-encoding': 'chunked' }, body: clip, maxBytes: 100 },
  ];
  for (const scenario of cases) {
    await t.test(scenario.code, async subtest => {
      const site = await startSite(subtest, { client: { maxBytes: scenario.maxBytes ?? 1_000_000 }, route(request, response, url) {
        if (url.searchParams.has('fmt')) {
          response.writeHead(scenario.status ?? 200, scenario.headers).end(scenario.body);
          return true;
        }
      } });
      await assert.rejects(site.client.download(testUrl, { format: '18', outputDir: site.outputDir }), codeIs(scenario.code));
      assert.deepEqual(await site.files(), []);
    });
  }
});

test('a complete 206 transfer and split file header are accepted', async t => {
  const site = await startSite(t, { route(request, response, url) {
    if (url.searchParams.has('fmt')) {
      response.writeHead(206, { 'content-type': 'application/octet-stream', 'content-range': 'bytes 0-' + (clip.length - 1) + '/' + clip.length });
      response.write(clip.subarray(0, 5));
      setImmediate(() => response.end(clip.subarray(5)));
      return true;
    }
  } });
  const result = await site.client.download(testUrl, { outputDir: site.outputDir });
  assert.deepEqual(await readFile(result.file), clip);
});

test('metadata and media deadlines include stalled response bodies', async t => {
  for (const stage of ['metadata', 'media']) {
    await t.test(stage, async subtest => {
      const site = await startSite(subtest, {
        client: { timeoutMs: 150, downloadTimeoutMs: 150 },
        route(request, response, url) {
          if ((stage === 'metadata' && url.pathname === '/id/') || (stage === 'media' && url.searchParams.has('fmt'))) {
            response.writeHead(200, { 'content-type': stage === 'metadata' ? 'text/html' : 'video/mp4' });
            response.write(stage === 'metadata' ? '<html>' : clip.subarray(0, 64));
            return true; // The client must abort the unfinished body.
          }
        },
      });
      await assert.rejects(site.client.download(testUrl, { outputDir: site.outputDir }), codeIs('TIMEOUT'));
      assert.deepEqual(await site.files(), []);
    });
  }
});

test('caller cancellation stops an in-progress download and removes temporary files', async t => {
  const controller = new AbortController();
  const site = await startSite(t, { route(request, response, url) {
    if (url.searchParams.has('fmt')) {
      response.writeHead(200, { 'content-type': 'video/mp4' });
      response.write(clip.subarray(0, 64));
      setImmediate(() => controller.abort());
      return true;
    }
  } });
  await assert.rejects(site.client.download(testUrl, { outputDir: site.outputDir, signal: controller.signal }), codeIs('ABORTED'));
  assert.deepEqual(await site.files(), []);
});

test('an interrupted socket fails the transfer and cleans up the partial file', async t => {
  const site = await startSite(t, { route(request, response, url) {
    if (url.searchParams.has('fmt')) {
      response.writeHead(200, { 'content-type': 'video/mp4', 'content-length': clip.length });
      response.write(clip.subarray(0, 64));
      setImmediate(() => response.destroy());
      return true;
    }
  } });
  await assert.rejects(site.client.download(testUrl, { outputDir: site.outputDir }), error =>
    error instanceof SnapYTError && ['NETWORK_ERROR', 'DOWNLOAD_FAILED'].includes(error.code));
  assert.deepEqual(await site.files(), []);
});

test('an unusable output directory reports a file error and preserves the existing file', async t => {
  const site = await startSite(t);
  await writeFile(site.outputDir, 'existing content');
  await assert.rejects(site.client.download(testUrl, { outputDir: site.outputDir }), codeIs('FILE_ERROR'));
  assert.equal(await readFile(site.outputDir, 'utf8'), 'existing content');
  assert.equal(site.state.requests.length, 3);
});

test('CLI help and invalid inputs exit with useful, sanitized messages', async () => {
  const cli = fileURLToPath(new URL('../cli.mjs', import.meta.url));
  const help = await execute(process.execPath, [cli, '--help']);
  assert.match(help.stdout, /<info\|video\|audio>/);
  await assert.rejects(execute(process.execPath, [cli, 'video', 'invalid']), error => {
    assert.equal(error.code, 2);
    assert.match(error.stderr, /INVALID_URL/);
    assert.doesNotMatch(error.stderr, /at .+\.mjs/);
    return true;
  });
  await assert.rejects(execute(process.execPath, [cli, '--unknown']), error => error.code === 2 && /INVALID_OPTION/.test(error.stderr));
});
