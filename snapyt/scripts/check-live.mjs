#!/usr/bin/env node
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { parseArgs } from 'node:util';
import { resolve } from 'node:path';
import { SnapYTClient, SnapYTError, normalizeYouTubeUrl } from '../index.mjs';

// Opt-in integration check: real provider requests, real saved files, and a full
// FFmpeg decode. Only fixed error messages and file metadata reach the report.
async function verify(file, type, executable, hasAudio) {
  await new Promise((resolveCheck, rejectCheck) => {
    const child = spawn(executable, [
      '-nostdin', '-hide_banner', '-loglevel', 'error',
      '-protocol_whitelist', 'file,pipe', '-i', file,
      '-map', type === 'video' ? '0:v:0' : '0:a:0',
      ...(type === 'video' && hasAudio === true ? ['-map', '0:a:0'] : []),
      '-f', 'null', '-',
    ], { stdio: 'ignore', signal: AbortSignal.timeout(60_000), killSignal: 'SIGKILL' });
    let error;
    child.once('error', () => { error = true; });
    child.once('close', code => {
      if (error || code !== 0) rejectCheck(new SnapYTError('VALIDATION_FAILED', 'A full FFmpeg decode could not validate the downloaded file.', { stage: 'validation' }));
      else resolveCheck();
    });
  });
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

async function main() {
  let args;
  try {
    args = parseArgs({
      allowPositionals: true,
      options: { output: { type: 'string' }, ffmpeg: { type: 'string' } },
    });
    if (args.positionals.length > 1) throw new Error();
  } catch {
    console.error('Usage: node snapyt/scripts/check-live.mjs [authorized YouTube URL] [--output directory] [--ffmpeg executable]');
    return 2;
  }
  const source = normalizeYouTubeUrl(args.positionals[0] ?? 'https://youtu.be/PqtggjVAi8M');
  const ffmpegPath = args.values.ffmpeg ?? 'ffmpeg';
  const client = new SnapYTClient({ ffmpegPath });
  const report = { checkedAt: new Date().toISOString(), sourceUrl: source.url, status: 'failed', checks: [] };
  for (const type of ['video', 'audio']) {
    try {
      const result = await client.download(source.url, {
        type, outputDir: args.values.output ?? resolve('snapyt/downloads/live'),
      });
      const sha256 = await verify(result.file, type, ffmpegPath, result.hasAudio);
      report.checks.push({ type, status: 'passed', ...result, sha256, fullDecode: true });
    } catch (error) {
      report.checks.push({
        type,
        status: error.code === 'ACCESS_RESTRICTED' ? 'blocked' : 'failed',
        code: error instanceof SnapYTError ? error.code : 'CHECK_FAILED',
        message: error instanceof SnapYTError ? error.message : 'The live check failed.',
        ...(error instanceof SnapYTError && error.status !== undefined && { httpStatus: error.status }),
        ...(error instanceof SnapYTError && error.stage && { stage: error.stage }),
      });
    }
  }
  report.status = report.checks.every(check => check.status === 'passed') ? 'passed'
    : report.checks.every(check => check.status === 'blocked') ? 'blocked' : 'failed';
  console.log(JSON.stringify(report, null, 2));
  return report.status === 'passed' ? 0 : 1;
}

try { process.exitCode = await main(); } catch (error) {
  console.error(error instanceof SnapYTError ? error.code + ': ' + error.message : 'CHECK_FAILED: The live check could not start.');
  process.exitCode = 2;
}
