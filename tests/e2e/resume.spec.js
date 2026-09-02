import { test, expect } from '@playwright/test';
import { openApp } from './helpers.js';

test('home resume includes progress from the m9-m14 tracks', async ({ page }) => {
  await openApp(page);
  const result = await page.evaluate(() => {
    state.lessonsDone = new Set([LESSONS.m9[0].id]);
    state.exercisesDone = new Set();
    state.quizScores = {};
    state.unlockedModules = new Set(['m1', 'm9']);
    renderHome();
    const button = document.querySelector('#home-hero .lp-cta-primary');
    return {
      returning: Boolean(document.querySelector('#home-hero .lp-hero-returning')),
      nextCard: Boolean(document.querySelector('#home-hero .lp-home-next-card')),
      label: button?.textContent.replace(/\s+/g, ' ').trim() || null,
      action: button?.dataset.action || null,
      target: button?.dataset.target || null,
    };
  });

  expect(result.returning).toBe(true);
  expect(result.nextCard).toBe(true);
  expect(result.action).toBe('navigate');
  expect(result.target).toBe('m9');
  expect(result.label).toContain('Reprendre');
});

test('an m12 score of seven survives reload and still renders as 7/7', async ({ page }) => {
  await openApp(page);
  await page.evaluate(async () => {
    state.quizScores.m12 = { lastScore: 7, bestScore: 7, attempts: 1, passed: true };
    await saveState();
  });

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof APP_READY !== 'undefined' && APP_READY);
  const result = await page.evaluate(() => {
    ensureModuleRendered('m12');
    return {
      score: state.quizScores.m12,
      text: document.querySelector('#quiz-card-m12 .quiz-start p')?.textContent || '',
    };
  });

  expect(result.score.lastScore).toBe(7);
  expect(result.score.bestScore).toBe(7);
  expect(result.text).toContain('7/7');
  expect(result.text).not.toContain('7/5');
});
