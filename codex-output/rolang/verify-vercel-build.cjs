// Reproduce the official Vercel Node function build without account credentials.
// First: npm install --prefix /tmp/rolang-builder @vercel/node
// Then: node codex-output/rolang/verify-vercel-build.cjs /tmp/rolang-builder
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');

(async () => {
  const builderRoot = path.resolve(process.argv[2] || '/tmp/rolang-builder');
  const { build } = require(path.join(builderRoot, 'node_modules/@vercel/node'));
  const { glob } = require(path.join(builderRoot, 'node_modules/@vercel/build-utils'));
  const source = path.resolve(__dirname, '../../rolang-server');
  const workPath = await fs.mkdtemp('/tmp/rolang-vercel-build-');
  // Copy an explicit allowlist; never copy .env, .vercel, or runner state.
  for (const name of ['api', 'src', 'package.json', 'package-lock.json', 'node_modules']) {
    await fs.cp(path.join(source, name), path.join(workPath, name), { recursive: true });
  }
  const config = JSON.parse(await fs.readFile(path.join(source, 'vercel.json'), 'utf8'));
  assert.deepEqual(config.rewrites, [{ source: '/(.*)', destination: '/api' }]);
  const files = await glob('**', { cwd: workPath, ignore: 'node_modules/**' });
  const { output } = await build({ files, entrypoint: 'api/index.js', workPath, repoRootPath: workPath,
    config: { maxDuration: config.functions['api/index.js'].maxDuration }, meta: { skipDownload: true } });
  assert.equal(output.runtime, 'nodejs24.x');
  assert.equal(output.handler, 'api/index.js');
  assert.ok(output.files['src/app.js']);
  assert.ok(output.files['src/db.js']);
  assert.ok(Object.keys(output.files).some(name => name.startsWith('node_modules/pg/')));
  console.log(JSON.stringify({ builder: '@vercel/node', runtime: output.runtime,
    handler: output.handler, tracedFiles: Object.keys(output.files).length, status: 'passed' }));
})().catch(() => { console.error('Vercel function build validation failed.'); process.exitCode = 1; });
