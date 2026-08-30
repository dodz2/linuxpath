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
