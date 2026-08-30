import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const ROOT = process.cwd();
const ROOTS = ['assets', 'scripts', 'tests'];
const SKIP_DIRS = new Set(['node_modules', 'dist', 'test-results', 'playwright-report']);

async function collect(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await collect(full));
    else if (/\.(?:js|mjs|cjs)$/.test(entry.name)) files.push(full);
  }
  return files;
}

const files = [];
for (const root of ROOTS) {
  try { files.push(...await collect(path.join(ROOT, root))); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}
files.push(path.join(ROOT, 'playwright.config.js'));

const failures = [];
for (const file of [...new Set(files)].sort()) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) failures.push({ file: path.relative(ROOT, file), error: result.stderr.trim() });
}
if (failures.length) {
  console.error(JSON.stringify({ ok: false, checked: files.length, failures }, null, 2));
  process.exit(1);
}
console.log(JSON.stringify({ ok: true, checked: files.length }, null, 2));
