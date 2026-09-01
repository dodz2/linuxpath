import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';
import { openApp } from './helpers.js';

const fixtures = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../fixtures');

test('the UI reports when progress is only stored for the current session', async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.getItem = function getItem() { return null; };
    Storage.prototype.setItem = function setItem() { throw new Error('storage denied'); };
  });
  await openApp(page);

  const banner = page.locator('#storage-status-banner');
  await expect(banner).toBeVisible();
  await expect(banner).toHaveAttribute('role', 'status');
  await expect(banner).toContainText(/session non persistante/i);
});

test('the session-only warning clears after every fallback key is truly persisted', async ({ page }) => {
  await page.addInitScript(() => {
    const nativeSetItem = Storage.prototype.setItem;
    window.__allowStorageWrites = false;
    Storage.prototype.setItem = function setItem(key, value) {
      if (!window.__allowStorageWrites) throw new Error('storage denied');
      return nativeSetItem.call(this, key, value);
    };
  });
  await openApp(page);
  const banner = page.locator('#storage-status-banner');
  await expect(banner).toBeVisible();

  const status = await page.evaluate(async () => {
    const pending = [];
    for (const key of getPersistenceStatus().fallbackKeys) {
      pending.push([key, await storage.get(key)]);
    }
    window.__allowStorageWrites = true;
    for (const [key, value] of pending) await storage.set(key, value);
    return getPersistenceStatus();
  });

  expect(status.persistent).toBe(true);
  expect(status.fallbackKeys).toEqual([]);
  await expect(banner).toHaveCount(0);
});

test('session fallback progress is not presented as surviving a reload', async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.getItem = function getItem() { return null; };
    Storage.prototype.setItem = function setItem() { throw new Error('storage denied'); };
  });
  await openApp(page);
  const lessonId = await page.evaluate(async () => {
    const id = LESSONS.m1[0].id;
    await markLessonDone(id);
    return id;
  });
  expect(await page.evaluate((id) => state.lessonsDone.has(id), lessonId)).toBe(true);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof APP_READY !== 'undefined' && APP_READY);
  expect(await page.evaluate((id) => state.lessonsDone.has(id), lessonId)).toBe(false);
  await expect(page.locator('#storage-status-banner')).toContainText(/perdus au rechargement/i);
});

test('a non-durable import restores prior progress and never announces success or reloads', async ({ page }) => {
  const dialogs = [];
  page.on('dialog', async (dialog) => {
    dialogs.push({ type: dialog.type(), message: dialog.message() });
    await dialog.accept();
  });
  await openApp(page);

  const before = await page.evaluate(async () => {
    const preservedLesson = LESSONS.m1[1].id;
    state.lessonsDone = new Set([preservedLesson]);
    state.exercisesDone = new Set();
    state.quizScores = {};
    await saveState();
    window.__importPageMarker = 'same-document';
    Storage.prototype.setItem = function setItem() { throw new Error('quota denied'); };
    return { preservedLesson };
  });

  const chooserPromise = page.waitForEvent('filechooser');
  await page.evaluate(() => importProgress());
  const chooser = await chooserPromise;
  await chooser.setFiles(path.join(fixtures, 'progress-v1.json'));
  await expect.poll(() => dialogs.some((dialog) => /import non durable/i.test(dialog.message))).toBe(true);

  const result = await page.evaluate(() => ({
    marker: window.__importPageMarker || null,
    lessons: Array.from(state.lessonsDone),
  }));
  expect(result.marker).toBe('same-document');
  expect(result.lessons).toEqual([before.preservedLesson]);
  expect(dialogs.some((dialog) => /importée avec succès/i.test(dialog.message))).toBe(false);
});

test('a hostile progress import is rejected without executing markup', async ({ page }, testInfo) => {
  const dialogs = [];
  page.on('dialog', async (dialog) => {
    dialogs.push({ type: dialog.type(), message: dialog.message() });
    await dialog.accept();
  });
  await openApp(page);

  const chooserPromise = page.waitForEvent('filechooser');
  await page.evaluate(() => importProgress());
  const chooser = await chooserPromise;
  await chooser.setFiles(path.join(fixtures, 'progress-malicious.json'));
  await expect.poll(() => dialogs.some((dialog) => dialog.type === 'alert' && /refus/i.test(dialog.message))).toBe(true);

  const result = await page.evaluate(() => ({
    marker: document.documentElement.dataset.linuxpathXss || null,
    importedScoreType: typeof state.quizScores.m1,
    injectedHandlers: document.querySelectorAll('#quiz-card-m1 [onerror]').length,
    confirmShown: false,
  }));
  await testInfo.attach('import-dialogs', { body: JSON.stringify(dialogs, null, 2), contentType: 'application/json' });
  expect(dialogs.some((dialog) => dialog.type === 'confirm')).toBe(false);
  expect(result.marker).toBeNull();
  expect(result.importedScoreType).not.toBe('string');
  expect(result.injectedHandlers).toBe(0);
});

test('a real version-1 fixture can still be selected by the importer', async ({ page }) => {
  const dialogs = [];
  page.on('dialog', async (dialog) => {
    dialogs.push(dialog.type());
    await dialog.dismiss();
  });
  await openApp(page);
  const chooserPromise = page.waitForEvent('filechooser');
  await page.evaluate(() => importProgress());
  const chooser = await chooserPromise;
  await chooser.setFiles(path.join(fixtures, 'progress-v1.json'));
  await expect.poll(() => dialogs.includes('confirm')).toBe(true);
});
