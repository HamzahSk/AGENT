#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { SnapYTClient, SnapYTError } from './index.mjs';

const usage = [
  'Usage: node snapyt/cli.mjs <info|video|audio> <YouTube URL> [options]',
  '',
  '  info                  List format metadata without downloading media',
  '  video                 Download a video (prefer a combined MP4)',
  '  audio                 Download MP3 (use FFmpeg if conversion is needed)',
  '',
  '  -o, --output <dir>     Output directory (default: downloads)',
  '  --filename <stem>     Filename stem; ID, quality, and extension are added',
  '  --format <id>         Require a specific format from the info command',
  '  --timeout <ms>        Total metadata deadline (default: 30000)',
  '  --download-timeout <ms> Transfer/conversion deadline (default: 180000)',
  '  --max-bytes <bytes>    Limit input and output files (default: 536870912)',
  '  --ffmpeg <path>        FFmpeg executable (default: ffmpeg)',
  '  -h, --help            Show this help',
  '',
  'Use only for content you own or are authorized to download.',
  'Access challenges and restricted videos stop the request.',
].join('\n');

export async function main(argv = process.argv.slice(2)) {
  let values, positionals;
  try {
    ({ values, positionals } = parseArgs({
      args: argv, allowPositionals: true, strict: true,
      options: {
        help: { type: 'boolean', short: 'h' },
        output: { type: 'string', short: 'o' },
        filename: { type: 'string' }, format: { type: 'string' },
        timeout: { type: 'string' }, 'download-timeout': { type: 'string' },
        'max-bytes': { type: 'string' }, ffmpeg: { type: 'string' },
      },
    }));
  } catch {
    console.error('INVALID_OPTION: Invalid command-line options. Use --help for usage.');
    return 2;
  }
  if (values.help) { console.log(usage); return 0; }
  const [command, url] = positionals;
  if (positionals.length !== 2 || !['info', 'video', 'audio'].includes(command)) {
    console.error(usage);
    return 2;
  }
  try {
    const client = new SnapYTClient({
      ...(values.timeout !== undefined && { timeoutMs: Number(values.timeout) }),
      ...(values['download-timeout'] !== undefined && { downloadTimeoutMs: Number(values['download-timeout']) }),
      ...(values['max-bytes'] !== undefined && { maxBytes: Number(values['max-bytes']) }),
      ...(values.ffmpeg !== undefined && { ffmpegPath: values.ffmpeg }),
    });
    const result = command === 'info' ? await client.getInfo(url) : await client.download(url, {
      type: command, outputDir: values.output, filename: values.filename, format: values.format,
    });
    console.log(JSON.stringify(result, null, 2));
    return 0;
  } catch (error) {
    if (error instanceof SnapYTError) {
      console.error(error.code + ': ' + error.message + (error.status ? ' (HTTP ' + error.status + ')' : ''));
      return ['INVALID_URL', 'INVALID_OPTION'].includes(error.code) ? 2 : 1;
    }
    console.error('UNEXPECTED_ERROR: The operation failed.');
    return 1;
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  process.exitCode = await main();
}
