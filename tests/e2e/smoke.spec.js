import { test, expect } from '@playwright/test';
import { openApp, sameOriginHttpFailures } from './helpers.js';

test('cold load has no same-origin HTTP failure or uncaught JavaScript error', async ({ page, baseURL }) => {
  const origin = new URL(baseURL).origin;
  const httpFailures = sameOriginHttpFailures(page, origin);
  const pageErrors = [];
  const consoleErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  await openApp(page);
  await page.waitForLoadState('load');

  expect(httpFailures, JSON.stringify(httpFailures, null, 2)).toEqual([]);
  expect(pageErrors, JSON.stringify(pageErrors, null, 2)).toEqual([]);
  expect(consoleErrors, JSON.stringify(consoleErrors, null, 2)).toEqual([]);
});

test('the loaded app exposes every audited activity family', async ({ page }) => {
  await openApp(page);
  const totals = await page.evaluate(() => {
    const count = (source) => Object.values(source).reduce((total, value) => total + (Array.isArray(value) ? value.length : 0), 0);
    return {
      modules: Object.keys(LESSONS).length,
      lessons: count(LESSONS),
      exercises: count(EXERCISES),
      quizzes: Object.keys(QUIZZES).length,
    };
  });
  expect(totals).toEqual({ modules: 18, lessons: 94, exercises: 47, quizzes: 18 });
  await page.evaluate(() => navigateTo('m1'));
  await expect(page.locator('#section-m1 .lesson-card')).toHaveCount(4);
  await page.evaluate(() => navigateTo('hw1'));
  await expect(page.locator('#section-hw1 .lesson-card')).toHaveCount(5);
  await page.evaluate(() => navigateTo('ctf'));
  await expect(page.locator('.ctf-card')).toHaveCount(10);
});

test('the home statistics reflect the current curriculum data', async ({ page }) => {
  await openApp(page);
  const expected = await page.evaluate(() => {
    const count = (source) => Object.values(source).reduce((total, value) => total + (Array.isArray(value) ? value.length : 0), 0);
    const questions = Object.values(QUIZZES).reduce((total, quiz) => total + (quiz.questions || []).length, 0);
    return [
      String(Object.keys(LESSONS).length),
      String(count(LESSONS)),
      String(count(EXERCISES)),
      String(questions),
      String(CTF_CHALLENGES.length),
    ];
  });
  const stats = await page.locator('.lp-hero-stats .lp-stat-num').allTextContents();
  expect(stats).toEqual(expected);
});


