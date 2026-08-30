import test from 'node:test';
import assert from 'node:assert/strict';
import { loadJson, findDanglingVfsReferences } from '../../scripts/lib/content-validation.mjs';

test('the main virtual filesystem has no dangling child references', async () => {
  const vfs = await loadJson('data/vfs.json');
  const dangling = findDanglingVfsReferences(vfs);
  assert.equal(dangling.length, 0, `expected no dangling VFS nodes, found ${dangling.length}: ${dangling.map((entry) => entry.childPath).join(', ')}`);
});
