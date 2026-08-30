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
      label: button?.textContent.replace(/\s+/g, ' ').trim() || null,
      action: button?.getAttribute('onclick') || null,
    };
  });

  expect(result.returning).toBe(true);
  expect(result.action).toContain("navigateTo('m9')");
  expect(result.label).toContain('Reprendre');
});
