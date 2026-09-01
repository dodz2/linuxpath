import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { openApp } from './helpers.js';

test('a corrupt progress key is isolated while valid sibling progress still loads', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('lt_lessonsDone', '{"broken":');
    localStorage.setItem('lt_exercisesDone', JSON.stringify(['m1-e1']));
    localStorage.setItem('lt_progressMigration', '3');
  });

  await openApp(page);
  const result = await page.evaluate(() => ({
    lessonCount: state.lessonsDone.size,
    exercises: [...state.exercisesDone],
    recovery: getStorageRecoveryStatus(),
  }));

  expect(result.lessonCount).toBe(0);
  expect(result.exercises).toContain('m1-e1');
  expect(result.recovery.state).toBe('recovered');
  expect(result.recovery.entries.map((entry) => entry.key)).toEqual(['lt_lessonsDone']);
});

test('the recovery diagnostic renders a corrupt raw value as inert text', async ({ page }) => {
  const corrupt = '["m1-l1", "<img id=storage-xss src=x onerror=document.documentElement.dataset.storageXss=1>"';
  await page.addInitScript((raw) => {
    localStorage.setItem('lt_lessonsDone', raw);
    localStorage.setItem('lt_progressMigration', '3');
  }, corrupt);

  await openApp(page);
  const panel = page.locator('#storage-recovery-panel');
  await expect(panel).toBeVisible();
  await expect(panel).toHaveAttribute('data-recovery-state', 'recovered');
  await expect(panel.locator('[data-recovery-key="lt_lessonsDone"] .storage-recovery-raw')).toHaveText(corrupt);
  expect(await page.evaluate(() => document.documentElement.dataset.storageXss || null)).toBeNull();
  expect(await panel.locator('img').count()).toBe(0);
});

test('an ordinary empty store is reported as empty rather than recovered', async ({ page }) => {
  await openApp(page);
  expect(await page.evaluate(() => getStorageRecoveryStatus().state)).toBe('empty');
  await expect(page.locator('#storage-recovery-panel')).toHaveCount(0);
});

test('the recovery copy action preserves the exact corrupt raw value', async ({ page, context }) => {
  const corrupt = '{"payload":"<svg/onload=alert(1)>"';
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.addInitScript((raw) => {
    localStorage.setItem('lt_quizScores', raw);
    localStorage.setItem('lt_progressMigration', '3');
  }, corrupt);

  await openApp(page);
  await page.locator('[data-recovery-key="lt_quizScores"] .storage-recovery-copy').click();

  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(corrupt);
});

test('the recovery export action downloads the exact corrupt raw value', async ({ page }) => {
  const corrupt = '["m1-l1", invalid]';
  await page.addInitScript((raw) => {
    localStorage.setItem('lt_lessonsDone', raw);
    localStorage.setItem('lt_progressMigration', '3');
  }, corrupt);
  await openApp(page);

  const downloadPromise = page.waitForEvent('download');
  await page.locator('[data-recovery-key="lt_lessonsDone"] .storage-recovery-export').click();
  const download = await downloadPromise;
  const downloadedPath = await download.path();

  expect(download.suggestedFilename()).toBe('linuxpath-recovery-lt_lessonsDone.txt');
  expect(await readFile(downloadedPath, 'utf8')).toBe(corrupt);
});

test('resetting one recovered key leaves valid sibling progress untouched', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('lt_lessonsDone', '[broken');
    localStorage.setItem('lt_exercisesDone', JSON.stringify(['m1-e1']));
    localStorage.setItem('lt_progressMigration', '3');
  });
  await openApp(page);

  await page.locator('[data-recovery-key="lt_lessonsDone"] .storage-recovery-reset').click();
  const result = await page.evaluate(() => ({
    corruptKey: localStorage.getItem('lt_lessonsDone'),
    siblingRaw: localStorage.getItem('lt_exercisesDone'),
    exercises: [...state.exercisesDone],
    recovery: getStorageRecoveryStatus(),
  }));

  expect(result.corruptKey).toBeNull();
  expect(result.siblingRaw).toBe(JSON.stringify(['m1-e1']));
  expect(result.exercises).toContain('m1-e1');
  expect(result.recovery.state).toBe('empty');
  await expect(page.locator('#storage-recovery-panel')).toHaveCount(0);
});

test('a corrupt CTF key is isolated without blocking sibling CTF or main progress', async ({ page }) => {
  const corrupt = '["TOP-SECRET-RAW"';
  const consoleMessages = [];
  page.on('console', (message) => consoleMessages.push(message.text()));
  await page.addInitScript((raw) => {
    localStorage.setItem('lt_ctf_solved', raw);
    localStorage.setItem('lt_ctf_hints', JSON.stringify({ 'ctf-01': 1 }));
    localStorage.setItem('lt_ctf_how', JSON.stringify({ 'ctf-01': 'with_help' }));
    localStorage.setItem('lt_exercisesDone', JSON.stringify(['m1-e1']));
    localStorage.setItem('lt_progressMigration', '3');
  }, corrupt);

  await openApp(page);
  const result = await page.evaluate(() => ({
    solved: [...ctfState.solved],
    hints: ctfState.hints,
    how: ctfState.how,
    exercises: [...state.exercisesDone],
    recovery: getStorageRecoveryStatus(),
  }));

  expect(result.solved).toEqual([]);
  expect(result.hints).toEqual({ 'ctf-01': 1 });
  expect(result.how).toEqual({ 'ctf-01': 'with_help' });
  expect(result.exercises).toContain('m1-e1');
  expect(result.recovery.entries.map((entry) => [entry.key, entry.scope])).toContainEqual(['lt_ctf_solved', 'ctf']);
  expect(consoleMessages.join('\n')).not.toContain('TOP-SECRET-RAW');
});
