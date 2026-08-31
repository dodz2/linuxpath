import { test, expect } from '@playwright/test';
import { openApp } from './helpers.js';

test('a first successful online visit is reloadable offline', async ({ page, context }, testInfo) => {
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
