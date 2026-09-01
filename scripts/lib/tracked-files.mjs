import { createHash } from 'node:crypto';
import { lstat, readFile, readlink } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

async function fingerprint(file) {
  try {
    const stats = await lstat(file);
    if (stats.isSymbolicLink()) return `symlink:${await readlink(file)}`;
    return createHash('sha256').update(await readFile(file)).digest('hex');
  } catch (error) {
    if (error.code === 'ENOENT') return 'missing';
    throw error;
  }
}

export async function captureTrackedFiles(root = process.cwd()) {
  const result = spawnSync('git', ['ls-files', '-z'], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });
  if (result.status !== 0) return null;
  const names = result.stdout.split('\0').filter(Boolean).sort();
  const snapshot = new Map();
  for (const name of names) snapshot.set(name, await fingerprint(path.join(root, name)));
  return snapshot;
}

export async function assertTrackedFilesUnchanged(before, root = process.cwd()) {
  if (!before) return;
  const after = await captureTrackedFiles(root);
  if (!after) throw new Error('Tracked file integrity check became unavailable after build.');
  const changed = [];
  const names = new Set([...before.keys(), ...after.keys()]);
  for (const name of [...names].sort()) {
    if (before.get(name) !== after.get(name)) changed.push(name);
  }
  if (changed.length) {
    throw new Error(`Tracked file modified unexpectedly by build: ${changed.join(', ')}`);
  }
}
