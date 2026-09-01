import { test, expect } from '@playwright/test';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { openApp } from './helpers.js';

test('a first successful online visit is reloadable offline', async ({ page, context }, testInfo) => {
  await page.addInitScript(() => {
    window.__offlineCspViolations = [];
    document.addEventListener('securitypolicyviolation', (event) => {
      window.__offlineCspViolations.push({ directive: event.effectiveDirective, blockedURI: event.blockedURI });
    });
  });
  await openApp(page);
  await page.waitForLoadState('load');
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));

  const cacheState = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    const names = await caches.keys();
    const entries = {};
    for (const name of names) {
      const cache = await caches.open(name);
      entries[name] = (await cache.keys()).map((request) => request.url);
    }
    return { active: Boolean(registration.active), controller: Boolean(navigator.serviceWorker.controller), entries };
  });
  await testInfo.attach('fresh-cache-state', { body: JSON.stringify(cacheState, null, 2), contentType: 'application/json' });

  await context.setOffline(true);
  let offline = { loaded: false, error: null, lessonCards: 0 };
  try {
    const response = await page.reload({ waitUntil: 'domcontentloaded', timeout: 12_000 });
    offline.loaded = true;
    offline.status = response?.status() ?? null;
    // DOMContentLoaded fires before the asynchronous JSON fetches and render
    // complete. Stay offline and wait for the observable product outcome.
    await page.waitForFunction(
      () => Boolean(document.querySelector('#home-hero .lp-hero, #home-hero > *')) && typeof LESSONS === 'object',
      undefined,
      { timeout: 8_000 },
    );
    offline.lessonCards = await page.evaluate(() => Object.values(LESSONS).reduce((total, value) => total + value.length, 0));
    offline.cspViolations = await page.evaluate(() => window.__offlineCspViolations || []);
  } catch (error) {
    offline.error = error.message;
  } finally {
    await context.setOffline(false);
  }
  await testInfo.attach('offline-reload', { body: JSON.stringify(offline, null, 2), contentType: 'application/json' });

  const cachedUrls = Object.values(cacheState.entries).flat();
  expect(cacheState.active).toBe(true);
  expect(cachedUrls.length, JSON.stringify(cacheState, null, 2)).toBeGreaterThan(0);
  expect(offline.loaded, offline.error || 'offline reload did not load').toBe(true);
  expect(offline.lessonCards).toBe(99);
  expect(offline.cspViolations).toEqual([]);
});

test('activation does not delete caches outside the linuxpath- prefix', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await page.evaluate(async () => {
    const foreign = await caches.open('other-app-v7');
    await foreign.put('/other-app-keep', new Response('keep'));
    const stale = await caches.open('linuxpath-stale-test');
    await stale.put('/stale', new Response('drop'));
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister()));
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  const names = await page.evaluate(() => caches.keys());
  expect(names).toContain('other-app-v7');
  expect(names).not.toContain('linuxpath-stale-test');
});

test('app-shell upgrade preserves cached v86 and the sandbox boots offline', async ({ page, context }, testInfo) => {
  test.setTimeout(120_000);
  const source = await readFile('dist/sw.js', 'utf8');
  const current = source.match(/const SW_VERSION = '(linuxpath-app-v\d+)'/)?.[1];
  expect(current).toBeTruthy();
  const next = current.replace(/v(\d+)$/, (_, value) => `v${Number(value) + 1}`);
  const upgradeFile = `sw-upgrade-test-${testInfo.workerIndex}-${testInfo.parallelIndex}.js`;
  const upgradePath = `dist/${upgradeFile}`;
  await writeFile(upgradePath, source.replaceAll(current, next));

  try {
    await openApp(page);
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
    const cachedV86 = await page.evaluate(async () => {
      const urls = [
        './v86/libv86.js', './v86/v86.wasm', './v86/seabios.bin',
        './v86/vgabios.bin', './v86/linux.iso',
      ];
      const responses = await Promise.all(urls.map((url) => fetch(url)));
      await Promise.all(responses.map(async (response) => {
        if (!response.ok) throw new Error(`${response.url}: ${response.status}`);
        await response.arrayBuffer();
      }));
      return caches.keys();
    });
    const v86Cache = cachedV86.find((name) => name.startsWith('linuxpath-v86-'));
    expect(v86Cache).toBeTruthy();

    await page.evaluate(async (scriptUrl) => {
      const previous = navigator.serviceWorker.controller;
      const changed = new Promise((resolve) => {
        navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true });
      });
      const registration = await navigator.serviceWorker.register(scriptUrl, { scope: './' });
      await registration.update();
      if (navigator.serviceWorker.controller === previous) await changed;
    }, `./${upgradeFile}`);

    await expect.poll(async () => page.evaluate((cacheName) => caches.has(cacheName), current)).toBe(false);
    const upgradedCaches = await page.evaluate(() => caches.keys());
    await testInfo.attach('upgrade-cache-state', {
      body: JSON.stringify({ current, next, v86Cache, upgradedCaches }, null, 2),
      contentType: 'application/json',
    });
    expect(upgradedCaches).toContain(next);
    expect(upgradedCaches).not.toContain(current);
    expect(upgradedCaches).toContain(v86Cache);

    await context.setOffline(true);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => typeof navigateTo === 'function' && typeof startSandbox === 'function');
    await page.evaluate(() => navigateTo('sandbox'));
    await page.locator('#btn-start-sandbox').click();
    await expect(page.locator('#sandbox-screen')).toContainText('/root%', { timeout: 35_000 });
  } finally {
    await context.setOffline(false).catch(() => undefined);
    await rm(upgradePath, { force: true });
  }
});
