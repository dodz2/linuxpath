import { test, expect } from '@playwright/test';
import { openApp } from './helpers.js';

test('a new visitor sees a clear start action and four track cards', async ({ page }) => {
  await openApp(page);

  const primary = page.locator('#home-hero .lp-cta-primary').first();
  await expect(primary).toBeVisible();
  await expect(primary).toHaveText(/Choisir mon parcours/i);
  await expect(primary).toHaveAttribute('data-action', 'scroll-to');
  await expect(primary).toHaveAttribute('data-scroll-target', 'track-picker');
  await expect(page.locator('#home-hero h1')).toHaveCount(1);
  await expect(page.locator('#home-hero .lp-hero-stats .lp-stat-num')).toHaveCount(5);
  await expect(page.locator('#track-picker .track-card')).toHaveCount(4);
  await expect(page.locator('#track-picker .track-card .lp-cta-primary, #track-picker .track-card .lp-cta-secondary')).toHaveCount(4);
  await expect(page.locator('#track-picker')).toContainText(/Fondamentaux Linux/);
  await expect(page.locator('#track-picker')).toContainText(/Réseau/);
  await expect(page.locator('#track-picker')).toContainText(/DFIR|Pentest/i);
  await expect(page.locator('#track-picker')).toContainText(/Lab & Tinker/);
});

test('choosing a track scrolls to the track picker without changing route', async ({ page }) => {
  await openApp(page);
  await page.locator('#home-hero .lp-cta-primary').first().click();
  await expect(page.locator('#section-home')).toHaveClass(/active/);
  await expect.poll(async () => page.evaluate(() => {
    const picker = document.getElementById('track-picker');
    if (!picker) return null;
    const rect = picker.getBoundingClientRect();
    return rect.top >= -8 && rect.top < window.innerHeight;
  })).toBe(true);
});

test('a returning learner gets a next-action dashboard and resume target', async ({ page }) => {
  await openApp(page);
  const result = await page.evaluate(() => {
    state.lessonsDone = new Set([LESSONS.m9[0].id]);
    state.exercisesDone = new Set();
    state.quizScores = {};
    state.unlockedModules = new Set(['m1', 'm9']);
    renderHome();
    const primary = document.querySelector('#home-hero .lp-cta-primary');
    const nextCard = document.querySelector('#home-hero .lp-home-next-card');
    const networkCard = document.querySelector('.track-card[data-track="network"]');
    return {
      returning: Boolean(document.querySelector('#home-hero .lp-hero-returning')),
      hasNextCard: Boolean(nextCard),
      heading: document.querySelector('#home-hero h1')?.textContent.trim() || '',
      label: primary?.textContent.replace(/\s+/g, ' ').trim() || null,
      action: primary?.dataset.action || null,
      target: primary?.dataset.target || null,
      summary: Array.from(document.querySelectorAll('#home-hero .lp-home-summary-value')).map((node) => node.textContent.trim()),
      networkProgress: networkCard?.querySelector('.track-progress-badge')?.textContent.trim() || null,
      networkCopyHidden: networkCard?.querySelector('.track-progress-copy')?.closest('[aria-hidden="true"]') != null,
      networkCopy: networkCard?.querySelector('.track-progress-copy')?.textContent.trim() || null,
      h1Count: document.querySelectorAll('#section-home h1').length,
    };
  });

  expect(result.returning).toBe(true);
  expect(result.hasNextCard).toBe(true);
  expect(result.heading).toMatch(/Continuez votre progression/i);
  expect(result.action).toBe('navigate');
  expect(result.target).toBe('m9');
  expect(result.label).toMatch(/Reprendre/i);
  expect(result.summary.length).toBe(3);
  expect(result.networkProgress).not.toBeNull();
  expect(result.networkCopyHidden).toBe(false);
  expect(result.networkCopy).toMatch(/éléments/i);
  expect(result.h1Count).toBe(1);
});

test('resume primary button opens the target module through existing navigation', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => {
    state.lessonsDone = new Set([LESSONS.m9[0].id]);
    state.exercisesDone = new Set();
    state.quizScores = {};
    state.unlockedModules = new Set(['m1', 'm9']);
    renderHome();
  });
  await page.locator('#home-hero .lp-cta-primary').first().click();
  await expect(page.locator('#section-m9')).toHaveClass(/active/);
  await expect(page.locator('#section-home')).not.toHaveClass(/active/);
});

test('an unlocked available module offers Commencer instead of a fake resume', async ({ page }) => {
  await openApp(page);
  const result = await page.evaluate(() => {
    const m1Lessons = (LESSONS.m1 || []).map((lesson) => lesson.id);
    const m1Exercises = (EXERCISES.m1 || []).map((exercise) => exercise.id);
    state.lessonsDone = new Set(m1Lessons);
    state.exercisesDone = new Set(m1Exercises);
    state.quizScores = { m1: { lastScore: 5, bestScore: 5, attempts: 1, passed: true } };
    state.unlockedModules = new Set(['m1', 'm2', 'm9', 'sandbox']);
    renderHome();
    const primary = document.querySelector('#home-hero .lp-cta-primary');
    return {
      label: primary?.textContent.replace(/\s+/g, ' ').trim() || null,
      target: primary?.dataset.target || null,
      copy: document.querySelector('#home-hero .lp-home-next-copy')?.textContent.trim() || null,
      kicker: document.querySelector('#home-hero .lp-home-next-kicker')?.textContent.trim() || null,
    };
  });

  expect(result.target).toBe('m2');
  expect(result.label).toMatch(/Commencer/i);
  expect(result.kicker).toMatch(/Prochaine étape/i);
  expect(result.copy).not.toMatch(/là où votre progression s’est arrêtée/i);
});

test('a completed curriculum shows completion actions instead of a fake resume', async ({ page }) => {
  await openApp(page);
  const result = await page.evaluate(() => {
    const mods = getPublishedModuleIds();
    state.lessonsDone = new Set(mods.flatMap((mod) => (LESSONS[mod] || []).map((lesson) => lesson.id)));
    state.exercisesDone = new Set(mods.flatMap((mod) => (EXERCISES[mod] || []).map((exercise) => exercise.id)));
    state.quizScores = Object.fromEntries(mods.map((mod) => {
      const questions = (QUIZZES[mod] && QUIZZES[mod].questions) ? QUIZZES[mod].questions.length : 5;
      return [mod, { lastScore: questions, bestScore: questions, attempts: 1, passed: true }];
    }));
    state.unlockedModules = new Set(mods);
    renderHome();
    const primary = document.querySelector('#home-hero .lp-cta-primary');
    return {
      completeCard: Boolean(document.querySelector('#home-hero .lp-home-next-card-complete')),
      heading: document.querySelector('#home-hero h1')?.textContent.trim() || '',
      primaryLabel: primary?.textContent.replace(/\s+/g, ' ').trim() || null,
      primaryTarget: primary?.dataset.target || null,
      actions: Array.from(document.querySelectorAll('#home-hero .lp-home-next-actions [data-action="navigate"]'))
        .map((node) => node.dataset.target),
      fakeResume: Array.from(document.querySelectorAll('#home-hero .lp-cta-primary')).some((node) => /Reprendre —/i.test(node.textContent || '')),
    };
  });

  expect(result.completeCard).toBe(true);
  expect(result.heading).toMatch(/Parcours terminé/i);
  expect(result.primaryTarget).toBe('roadmap');
  expect(result.primaryLabel).toMatch(/roadmap/i);
  expect(result.fakeResume).toBe(false);
  expect(result.actions).toEqual(expect.arrayContaining(['roadmap', 'sandbox', 'ctf']));
});

test('home dashboard stays usable on a narrow mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openApp(page);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await expect(page.locator('#home-hero .lp-cta-primary').first()).toBeVisible();
  await expect(page.locator('#track-picker .track-card')).toHaveCount(4);

  await page.evaluate(() => {
    state.lessonsDone = new Set([LESSONS.m1[0].id]);
    state.unlockedModules = new Set(['m1', 'm9']);
    renderHome();
  });
  const returningOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(returningOverflow).toBeLessThanOrEqual(0);
  await expect(page.locator('#home-hero .lp-home-next-card')).toBeVisible();
});
