import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('progress persistence uses localStorage and not IndexedDB', async () => {
  const source = await readFile('assets/storage.js', 'utf8');
  assert.match(source, /localStorage/);
  assert.equal(source.includes('indexedDB'), false);
  assert.equal(source.includes('linuxpath-db'), false);
});

test('the FAQ describes the storage actually used', async () => {
  const html = await readFile('index.html', 'utf8');
  assert.match(html, /localStorage/);
  assert.equal(html.includes('IndexedDB'), false);
});

test('the service worker only deletes linuxpath- caches and awaits cache.put', async () => {
  const source = await readFile('sw.js', 'utf8');
  assert.match(source, /CACHE_PREFIX/);
  assert.match(source, /startsWith\(CACHE_PREFIX\)/);
  assert.equal(/caches\.match\(/.test(source), false);
  assert.match(source, /await cache\.put/);
  assert.equal(source.includes('Pre-cache partiel'), false);
});

test('v86 documentation explains checksum-versioned cache lifecycle', async () => {
  const readme = await readFile('v86/README.md', 'utf8');
  assert.match(readme, /v86\/checksums\.sha256|checksums\.sha256/);
  assert.match(readme, /cache[^\n]*indépendant/i);
  assert.match(readme, /SHA-256[^\n]*manifeste/i);
  assert.match(readme, /sans re-télécharger|ne sont pas re-téléchargés/i);
  assert.match(readme, /linuxpath-v64/);
});
