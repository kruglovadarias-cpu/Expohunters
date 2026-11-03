import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { cp, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const remote = 'https://github.com/kruglovadarias-cpu/balance-website.git';
const git = (cwd, ...args) => run('git', args, { cwd, maxBuffer: 10 * 1024 * 1024 });
const temporary = await mkdtemp(join(tmpdir(), 'expo-pages-'));
const publication = join(temporary, 'repository');

try {
  await git(temporary, 'clone', '--quiet', '--single-branch', '--branch', 'gh-pages', '--depth', '1', remote, publication);
  for (const name of await readdir(publication)) {
    if (name !== '.git' && name !== 'CNAME') await rm(join(publication, name), { recursive: true, force: true });
  }
  await cp(join(root, 'dist'), publication, { recursive: true });
  await writeFile(join(publication, '.nojekyll'), '');
  await git(publication, 'add', '--all');
  const { stdout: changes } = await git(publication, 'status', '--porcelain');
  if (!changes.trim()) {
    console.log('The published build already matches dist; no commit or push needed.');
  } else {
    for (const key of ['user.name', 'user.email']) {
      const { stdout } = await git(root, 'config', '--get', key);
      if (!stdout.trim()) throw new Error(`Missing Git identity: ${key}`);
      await git(publication, 'config', key, stdout.trim());
    }
    const { stdout: source } = await git(root, 'rev-parse', '--short', 'HEAD');
    await git(publication, 'commit', '-m', `Publish Expo Hunters build from ${source.trim()}`);
    // Без force: параллельные изменения ветки не перезаписываются.
    await git(publication, 'push', 'origin', 'HEAD:refs/heads/gh-pages');
    console.log('Updated gh-pages. GitHub Pages will publish this build.');
  }
  console.log('Site: https://kruglovadarias-cpu.github.io/balance-website/');
} finally {
  await rm(temporary, { recursive: true, force: true });
}
