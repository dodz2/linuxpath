import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const SERVICE_WORKER_URL = 'https://linuxpath.test/sw.js';
const SERVICE_WORKER_SCOPE = 'https://linuxpath.test/';
const DOCUMENTED_V86_REVISION = 'bd0709747d908d7c485e22c8d0b7f2ec6c28c888bf8cda28998549d70c1243a9';
const DOCUMENTED_V86_CACHE = `linuxpath-v86-${DOCUMENTED_V86_REVISION}`;

async function loadServiceWorker({ fetchImpl, cachesImpl, transformSource = (source) => source }) {
  const listeners = new Map();
  const self = {
    location: new URL(SERVICE_WORKER_URL),
    registration: { scope: SERVICE_WORKER_SCOPE },
    clients: { claim: async () => undefined },
    skipWaiting: async () => undefined,
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
  };
  const context = vm.createContext({
    self,
    caches: cachesImpl,
    fetch: fetchImpl,
    URL,
    Request,
    Response,
    Headers,
    console,
  });
  const source = transformSource(await readFile('sw.js', 'utf8'));
  vm.runInContext(source, context, { filename: 'sw.js' });

  return {
    constants: vm.runInContext(`({
      cachePrefix: CACHE_PREFIX,
      appCache: typeof APP_CACHE === 'undefined' ? SW_VERSION : APP_CACHE,
      v86Cache: typeof V86_CACHE === 'undefined' ? SW_VERSION : V86_CACHE,
      v86Revision: typeof V86_MANIFEST_REVISION === 'undefined' ? null : V86_MANIFEST_REVISION,
      precacheUrls: [...PRECACHE_URLS],
    })`, context),
    async dispatchFetch(path, init = {}) {
      let responsePromise;
      const waits = [];
      const event = {
        request: new Request(new URL(path, SERVICE_WORKER_SCOPE), init),
        respondWith(value) {
          responsePromise = Promise.resolve(value);
        },
        waitUntil(value) {
          waits.push(Promise.resolve(value));
        },
      };
      listeners.get('fetch')(event);
      assert.ok(responsePromise, `No response registered for ${path}`);
      return { response: await responsePromise, waits };
    },
    async dispatchLifecycle(type) {
      const waits = [];
      listeners.get(type)({
        waitUntil(value) {
          waits.push(Promise.resolve(value));
        },
      });
      assert.ok(waits.length > 0, `No waitUntil registered for ${type}`);
      await Promise.all(waits);
    },
  };
}

test('network-first returns a valid 200 response when cache.put rejects', async () => {
  let putCalls = 0;
  const cache = {
    match: async () => undefined,
    put: async () => {
      putCalls += 1;
      throw new Error('simulated cache quota failure');
    },
  };
  const worker = await loadServiceWorker({
    fetchImpl: async () => new Response('{"fresh":true}', {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
    cachesImpl: { open: async () => cache },
  });

  const { response } = await worker.dispatchFetch('/data/lessons.json');

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { fresh: true });
  assert.equal(putCalls, 1);
});

test('Range cache miss bypasses cache lookup and preserves the network 206 without cache.put', async () => {
  let matchCalls = 0;
  let putCalls = 0;
  let openCalls = 0;
  const cache = {
    match: async () => {
      matchCalls += 1;
      return undefined;
    },
    put: async () => {
      putCalls += 1;
    },
  };
  const worker = await loadServiceWorker({
    fetchImpl: async () => new Response('partial-v86-bytes', { status: 206 }),
    cachesImpl: {
      open: async () => {
        openCalls += 1;
        return cache;
      },
    },
  });

  const { response } = await worker.dispatchFetch('/v86/linux.iso', {
    headers: { Range: 'bytes=0-15' },
  });

  assert.equal(response.status, 206);
  assert.equal(await response.text(), 'partial-v86-bytes');
  assert.equal(openCalls, 0);
  assert.equal(matchCalls, 0);
  assert.equal(putCalls, 0);
});

test('Range requests bypass a complete entry in the current v86 cache', async () => {
  let fetchCalls = 0;
  let matchCalls = 0;
  let putCalls = 0;
  const cache = {
    match: async () => {
      matchCalls += 1;
      return new Response('complete-cached-v86', { status: 200 });
    },
    put: async () => { putCalls += 1; },
  };
  const worker = await loadServiceWorker({
    fetchImpl: async () => {
      fetchCalls += 1;
      return new Response('partial-network-v86', { status: 206 });
    },
    cachesImpl: { open: async () => cache },
  });

  const { response } = await worker.dispatchFetch('/v86/linux.iso', {
    headers: { Range: 'bytes=16-31' },
  });

  assert.equal(response.status, 206);
  assert.equal(await response.text(), 'partial-network-v86');
  assert.equal(fetchCalls, 1);
  assert.equal(matchCalls, 0);
  assert.equal(putCalls, 0);
});

test('Range requests bypass complete entries in the legacy v64 cache', async () => {
  const opened = [];
  let legacyMatches = 0;
  let putCalls = 0;
  const current = {
    match: async () => undefined,
    put: async () => { putCalls += 1; },
  };
  const legacy = {
    match: async () => {
      legacyMatches += 1;
      return new Response('complete-legacy-v86', { status: 200 });
    },
  };
  const worker = await loadServiceWorker({
    fetchImpl: async () => new Response('partial-network-v86', { status: 206 }),
    cachesImpl: {
      keys: async () => ['linuxpath-v64'],
      open: async (name) => {
        opened.push(name);
        return name === 'linuxpath-v64' ? legacy : current;
      },
    },
  });

  const { response } = await worker.dispatchFetch('/v86/linux.iso', {
    headers: { Range: 'bytes=32-47' },
  });

  assert.equal(response.status, 206);
  assert.equal(await response.text(), 'partial-network-v86');
  assert.deepEqual(opened, []);
  assert.equal(legacyMatches, 0);
  assert.equal(putCalls, 0);
});

test('Range requests never expose a complete network 200 response', async () => {
  let openCalls = 0;
  const worker = await loadServiceWorker({
    fetchImpl: async () => new Response('complete-network-v86', { status: 200 }),
    cachesImpl: {
      open: async () => {
        openCalls += 1;
        return { match: async () => undefined, put: async () => undefined };
      },
    },
  });

  const { response } = await worker.dispatchFetch('/v86/linux.iso', {
    headers: { Range: 'bytes=48-63' },
  });

  assert.equal(response.status, 502);
  assert.equal(openCalls, 0);
});

test('network-first falls back to a healthy cache entry on a 503 response', async () => {
  let putCalls = 0;
  const cachedResponse = new Response('{"cached":true}', {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
  const cache = {
    match: async () => cachedResponse,
    put: async () => {
      putCalls += 1;
    },
  };
  const worker = await loadServiceWorker({
    fetchImpl: async () => new Response('upstream unavailable', { status: 503 }),
    cachesImpl: { open: async () => cache },
  });

  const { response } = await worker.dispatchFetch('/data/lessons.json');

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { cached: true });
  assert.equal(putCalls, 0);
});

test('network-first treats a 404 as authoritative and does not revive cached content', async () => {
  let putCalls = 0;
  const cache = {
    match: async () => new Response('{"stale":true}', {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
    put: async () => {
      putCalls += 1;
    },
  };
  const worker = await loadServiceWorker({
    fetchImpl: async () => new Response('not found', { status: 404 }),
    cachesImpl: { open: async () => cache },
  });

  const { response } = await worker.dispatchFetch('/data/removed.json');

  assert.equal(response.status, 404);
  assert.equal(await response.text(), 'not found');
  assert.equal(putCalls, 0);
});

test('stale-while-revalidate keeps cached revalidation alive with event.waitUntil', async () => {
  let putCalls = 0;
  const cache = {
    match: async () => new Response('cached-css', { status: 200 }),
    put: async () => {
      putCalls += 1;
    },
  };
  const worker = await loadServiceWorker({
    fetchImpl: async () => new Response('fresh-css', { status: 200 }),
    cachesImpl: { open: async () => cache },
  });

  const { response, waits } = await worker.dispatchFetch('/assets/base.css');

  assert.equal(await response.text(), 'cached-css');
  assert.equal(waits.length, 1);
  await Promise.all(waits);
  assert.equal(putCalls, 1);
});

test('cache-first keeps a valid 200 response when cache.put rejects', async () => {
  const cache = {
    match: async () => undefined,
    put: async () => {
      throw new Error('simulated cache quota failure');
    },
  };
  const worker = await loadServiceWorker({
    fetchImpl: async () => new Response('complete-v86-file', { status: 200 }),
    cachesImpl: { open: async () => cache },
  });

  const { response } = await worker.dispatchFetch('/v86/v86.wasm');

  assert.equal(response.status, 200);
  assert.equal(await response.text(), 'complete-v86-file');
});

test('stale-while-revalidate keeps a valid 200 cache miss when cache.put rejects', async () => {
  const cache = {
    match: async () => undefined,
    put: async () => {
      throw new Error('simulated cache quota failure');
    },
  };
  const worker = await loadServiceWorker({
    fetchImpl: async () => new Response('fresh-asset', { status: 200 }),
    cachesImpl: { open: async () => cache },
  });

  const { response } = await worker.dispatchFetch('/assets/new.css');

  assert.equal(response.status, 200);
  assert.equal(await response.text(), 'fresh-asset');
});

test('first split-cache deployment migrates cached v86 entries out of legacy app v64', async () => {
  const legacyV86Request = new Request('https://linuxpath.test/v86/linux.iso');
  const legacyAssetRequest = new Request('https://linuxpath.test/assets/app.min.js');
  const migrated = [];
  const names = new Set(['linuxpath-v64']);
  const legacy = {
    keys: async () => [legacyV86Request, legacyAssetRequest],
    match: async (request) => new Response(new URL(request.url).pathname, { status: 200 }),
  };
  const target = {
    put: async (request, response) => migrated.push([new URL(request.url).pathname, await response.text()]),
  };
  const worker = await loadServiceWorker({
    fetchImpl: async () => new Response('unused'),
    cachesImpl: {
      open: async (name) => name === 'linuxpath-v64' ? legacy : target,
      keys: async () => [...names],
      delete: async (name) => names.delete(name),
    },
  });

  await worker.dispatchLifecycle('activate');

  assert.deepEqual(migrated, [['/v86/linux.iso', '/v86/linux.iso']]);
  assert.equal(names.has('linuxpath-v64'), false);
});

test('failed v64 migration keeps and serves the legacy v86 entry offline', async () => {
  const request = new Request('https://linuxpath.test/v86/linux.iso');
  const names = new Set(['linuxpath-v64']);
  const legacy = {
    keys: async () => [request],
    match: async () => new Response('legacy-iso', { status: 200 }),
  };
  const target = {
    keys: async () => [],
    match: async () => undefined,
    put: async () => { throw new Error('quota'); },
  };
  let fetchCalls = 0;
  const worker = await loadServiceWorker({
    fetchImpl: async () => {
      fetchCalls += 1;
      throw new Error('offline');
    },
    cachesImpl: {
      open: async (name) => name === 'linuxpath-v64' ? legacy : target,
      keys: async () => [...names],
      delete: async (name) => names.delete(name),
    },
  });

  await worker.dispatchLifecycle('activate');
  const { response } = await worker.dispatchFetch('/v86/linux.iso');

  assert.equal(names.has('linuxpath-v64'), true);
  assert.equal(await response.text(), 'legacy-iso');
  assert.equal(fetchCalls, 0);
});

test('a future v86 revision does not migrate or serve stale v64 bytes', async () => {
  const nextRevision = 'b'.repeat(64);
  const names = new Set(['linuxpath-v64']);
  let legacyMatches = 0;
  const worker = await loadServiceWorker({
    transformSource: (source) => source.replace(DOCUMENTED_V86_REVISION, nextRevision),
    fetchImpl: async () => { throw new Error('offline'); },
    cachesImpl: {
      open: async (name) => name === 'linuxpath-v64'
        ? {
            keys: async () => [new Request('https://linuxpath.test/v86/linux.iso')],
            match: async () => {
              legacyMatches += 1;
              return new Response('stale-v64');
            },
          }
        : { match: async () => undefined, put: async () => undefined },
      keys: async () => [...names],
      delete: async (name) => names.delete(name),
    },
  });

  await worker.dispatchLifecycle('activate');
  const { response } = await worker.dispatchFetch('/v86/linux.iso');

  assert.equal(names.has('linuxpath-v64'), false);
  assert.equal(response.status, 503);
  assert.equal(legacyMatches, 0);
});

test('an application upgrade preserves the v86 cache when documented checksums are unchanged', async () => {
  const names = new Set([
    'linuxpath-app-v64',
    DOCUMENTED_V86_CACHE,
    'other-app-v7',
  ]);
  const deleted = [];
  const worker = await loadServiceWorker({
    fetchImpl: async () => new Response('unused'),
    cachesImpl: {
      open: async () => ({ match: async () => undefined, put: async () => undefined }),
      keys: async () => [...names],
      delete: async (name) => {
        deleted.push(name);
        return names.delete(name);
      },
    },
  });

  await worker.dispatchLifecycle('activate');

  assert.equal(names.has('linuxpath-app-v64'), false);
  assert.equal(names.has(DOCUMENTED_V86_CACHE), true);
  assert.equal(names.has('other-app-v7'), true);
  assert.equal(deleted.includes(DOCUMENTED_V86_CACHE), false);
});

test('a v86 checksum change invalidates only the previous v86 cache', async () => {
  const nextRevision = 'a'.repeat(64);
  const names = new Set(['other-app-v7']);
  const deleted = [];
  const worker = await loadServiceWorker({
    transformSource: (source) => source.replace(DOCUMENTED_V86_REVISION, nextRevision),
    fetchImpl: async () => new Response('unused'),
    cachesImpl: {
      open: async () => ({ match: async () => undefined, put: async () => undefined }),
      keys: async () => [...names],
      delete: async (name) => {
        deleted.push(name);
        return names.delete(name);
      },
    },
  });
  names.add(worker.constants.appCache);
  names.add(DOCUMENTED_V86_CACHE);

  await worker.dispatchLifecycle('activate');

  assert.equal(worker.constants.v86Cache, `linuxpath-v86-${nextRevision}`);
  assert.equal(names.has(worker.constants.appCache), true);
  assert.equal(names.has(DOCUMENTED_V86_CACHE), false);
  assert.equal(names.has('other-app-v7'), true);
  assert.deepEqual(deleted, [DOCUMENTED_V86_CACHE]);
});

test('v86 requests use the checksum-versioned cache instead of the application cache', async () => {
  const opened = [];
  const cache = {
    match: async () => undefined,
    put: async () => undefined,
  };
  const worker = await loadServiceWorker({
    fetchImpl: async () => new Response('v86-file', { status: 200 }),
    cachesImpl: {
      open: async (name) => {
        opened.push(name);
        return cache;
      },
    },
  });

  const { response } = await worker.dispatchFetch('/v86/seabios.bin');

  assert.equal(response.status, 200);
  assert.deepEqual(opened, [DOCUMENTED_V86_CACHE]);
  assert.notEqual(worker.constants.appCache, worker.constants.v86Cache);
});

test('root and index navigations share one canonical precache key', async () => {
  const matched = [];
  const cache = {
    match: async (request) => {
      matched.push(new URL(typeof request === 'string' ? request : request.url).pathname);
      return new Response('cached-index', { status: 200 });
    },
    put: async () => undefined,
  };
  const worker = await loadServiceWorker({
    fetchImpl: async () => new Response('network-index', { status: 200 }),
    cachesImpl: { open: async () => cache },
  });

  assert.equal(worker.constants.precacheUrls.includes('./'), false);
  assert.equal(worker.constants.precacheUrls.filter((url) => url === './index.html').length, 1);
  const root = await worker.dispatchFetch('/');
  const index = await worker.dispatchFetch('/index.html');
  await Promise.all([...root.waits, ...index.waits]);

  assert.deepEqual(matched, ['/index.html', '/index.html']);
});

test('v86 cache revision is the SHA-256 of a complete verified checksum manifest', async () => {
  const manifest = await readFile('v86/checksums.sha256');
  const revision = createHash('sha256').update(manifest).digest('hex');
  const lines = manifest.toString('utf8').trim().split('\n');
  assert.equal(lines.length, 5);
  assert.equal(revision, DOCUMENTED_V86_REVISION);

  for (const line of lines) {
    const match = line.match(/^([0-9a-f]{64})  ([A-Za-z0-9._-]+)$/);
    assert.ok(match, `invalid checksum line: ${line}`);
    const actual = createHash('sha256').update(await readFile(`v86/${match[2]}`)).digest('hex');
    assert.equal(actual, match[1], match[2]);
  }
});
