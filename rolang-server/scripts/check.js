import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
for (const dir of ['src', 'api', 'scripts', 'test']) {
  for (const name of await readdir(new URL(`../${dir}/`, import.meta.url))) {
    if (!name.endsWith('.js')) continue;
    const result = spawnSync(process.execPath, ['--check', `${dir}/${name}`], { stdio: 'inherit' });
    if (result.status) process.exit(result.status);
  }
}
