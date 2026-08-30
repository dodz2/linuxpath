import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';
import { openApp } from './helpers.js';

const fixtures = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../fixtures');

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
