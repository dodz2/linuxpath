import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';

async function exists(path) {
  try { await access(path, constants.F_OK); return true; }
  catch { return false; }
}

test('README does not instruct the dead local minify workflow', async () => {
  const readme = await readFile('README.md', 'utf8');
  assert.equal(/bash minify\.sh/.test(readme), false, 'README still tells contributors to run minify.sh');
  assert.equal(/validation de minification/.test(readme), false, 'README still describes a minification-validation workflow');
  // the modern build path is documented instead
  assert.match(readme, /npm run build/);
});

test('the dead pre-commit hook script is removed', async () => {
  assert.equal(await exists('scripts/git-hooks/pre-commit'), false, 'scripts/git-hooks/pre-commit still exists');
});

test('known-failures.json no longer lists resolved defects as expected failures', async () => {
  const data = JSON.parse(await readFile('tests/known-failures.json', 'utf8'));
  assert.ok(Array.isArray(data.source), 'known-failures must keep a source array');
  assert.equal(data.source.length, 0, `expected failures remain: ${data.source.join(', ')}`);
});

test('the build drops unminified sources from the dist asset bundle', async () => {
  const { spawn } = await import('node:child_process');
  const { readdir } = await import('node:fs/promises');
  const result = await new Promise((resolve) => {
    const child = spawn('npm', ['run', 'build'], { cwd: process.cwd(), stdio: 'pipe' });
    let out = '';
    child.stdout.on('data', (chunk) => { out += chunk; });
    child.stderr.on('data', (chunk) => { out += chunk; });
    child.on('close', (code) => resolve({ code, out }));
  });
  assert.equal(result.code, 0, `build failed:\n${result.out}`);
  const files = await readdir('dist/assets');
  const unminified = files.filter((name) => name.endsWith('.js') && !name.endsWith('.min.js'));
  assert.deepEqual(unminified, [], `dist/assets still ships unminified sources: ${unminified.join(', ')}`);
});

test('the harness suite verifies and cleans up its self-marker', async () => {
  const { rm, readdir } = await import('node:fs/promises');
  // clean any leftover marker from previous runs
  for (const entry of await readdir(tmpdir())) {
    if (entry.startsWith('linuxpath-harness-marker-')) await rm(`${tmpdir()}/${entry}`, { force: true });
  }
  const result = spawnSync(process.execPath, ['scripts/run-suite.mjs', 'harness'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    timeout: 120_000,
    maxBuffer: 50 * 1024 * 1024,
  });
  assert.equal(result.status, 0, `harness suite failed:\n${result.stdout}\n${result.stderr}`);
  // the marker must be gone after the run (cleaned up, not leaked in tmpdir)
  const leftovers = (await readdir(tmpdir())).filter((entry) => entry.startsWith('linuxpath-harness-marker-'));
  assert.deepEqual(leftovers, [], `harness-self-marker leaked marker(s) in tmpdir: ${leftovers.join(', ')}`);
});