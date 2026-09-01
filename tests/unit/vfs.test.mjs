import test from 'node:test';
import assert from 'node:assert/strict';
import { loadJson, findDanglingVfsReferences } from '../../scripts/lib/content-validation.mjs';
import { runShell } from '../../scripts/lib/shell-exec.mjs';

async function freshVfs() {
  return structuredClone(await loadJson('data/vfs.json'));
}

test('the main virtual filesystem has no dangling child references', async () => {
  const vfs = await loadJson('data/vfs.json');
  const dangling = findDanglingVfsReferences(vfs);
  assert.equal(dangling.length, 0, `expected no dangling VFS nodes, found ${dangling.length}: ${dangling.map((entry) => entry.childPath).join(', ')}`);
});

test('touch refuses a missing parent without creating an orphan', async () => {
  const vfs = await freshVfs();
  const result = runShell({ vfs, cwd: '/home/user', command: 'touch /missing/ghost' });
  assert.notEqual(result.exitCode, 0);
  assert.equal(Object.hasOwn(vfs, '/missing/ghost'), false);
  assert.equal(findDanglingVfsReferences(vfs).length, 0);
});

test('rm -r removes a directory and every descendant', async () => {
  const vfs = await freshVfs();
  assert.equal(runShell({ vfs, cwd: '/home/user', command: 'mkdir tree' }).exitCode, 0);
  assert.equal(runShell({ vfs, cwd: '/home/user', command: 'mkdir tree/nested' }).exitCode, 0);
  assert.equal(runShell({ vfs, cwd: '/home/user', command: 'touch tree/nested/leaf.txt' }).exitCode, 0);

  const result = runShell({ vfs, cwd: '/home/user', command: 'rm -r tree' });
  assert.equal(result.exitCode, 0);
  assert.equal(Object.keys(vfs).some((path) => path === '/home/user/tree' || path.startsWith('/home/user/tree/')), false);
  assert.equal(findDanglingVfsReferences(vfs).length, 0);
});

test('cp -r creates a deep independent directory copy', async () => {
  const vfs = await freshVfs();
  runShell({ vfs, cwd: '/home/user', command: 'mkdir tree' });
  runShell({ vfs, cwd: '/home/user', command: 'mkdir tree/nested' });
  runShell({ vfs, cwd: '/home/user', command: 'touch tree/nested/leaf.txt' });

  const result = runShell({ vfs, cwd: '/home/user', command: 'cp -r tree tree-copy' });
  assert.equal(result.exitCode, 0);
  assert.equal(vfs['/home/user/tree-copy/nested/leaf.txt'].type, 'file');
  assert.notStrictEqual(vfs['/home/user/tree-copy'], vfs['/home/user/tree']);
  assert.notStrictEqual(vfs['/home/user/tree-copy'].children, vfs['/home/user/tree'].children);
  assert.equal(findDanglingVfsReferences(vfs).length, 0);
});

test('mv relocates every descendant and removes the old prefix', async () => {
  const vfs = await freshVfs();
  runShell({ vfs, cwd: '/home/user', command: 'mkdir tree' });
  runShell({ vfs, cwd: '/home/user', command: 'mkdir tree/nested' });
  runShell({ vfs, cwd: '/home/user', command: 'touch tree/nested/leaf.txt' });

  const result = runShell({ vfs, cwd: '/home/user', command: 'mv tree moved' });
  assert.equal(result.exitCode, 0);
  assert.equal(vfs['/home/user/moved/nested/leaf.txt'].type, 'file');
  assert.equal(Object.keys(vfs).some((path) => path === '/home/user/tree' || path.startsWith('/home/user/tree/')), false);
  assert.equal(vfs['/home/user'].children.includes('tree'), false);
  assert.equal(vfs['/home/user'].children.includes('moved'), true);
  assert.equal(findDanglingVfsReferences(vfs).length, 0);
});
