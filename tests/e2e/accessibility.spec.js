import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { openApp } from './helpers.js';

async function blockingAxe(page, label) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  return results.violations
    .filter((violation) => ['serious', 'critical'].includes(violation.impact))
    .map((violation) => `${label}:${violation.id} (${violation.nodes.length})`);
}

test('the rendered learning application has no serious or critical axe violation', async ({ page }, testInfo) => {
  await openApp(page);
  const blocking = [];
  for (const view of ['home', 'm1', 'roadmap', 'ctf', 'news']) {
    await page.evaluate((target) => navigateTo(target), view);
    if (view === 'm1') await page.evaluate(() => startQuiz('m1'));
    blocking.push(...await blockingAxe(page, view));
  }
  await testInfo.attach('axe-blocking', { body: JSON.stringify(blocking, null, 2), contentType: 'application/json' });
  expect(blocking).toEqual([]);
});

test('lesson toggles and quiz options are native keyboard controls', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => navigateTo('m1'));
  const lessonControls = await page.locator('.lesson-header').evaluateAll((elements) => elements.map((element) => ({ tag: element.tagName, tabIndex: element.tabIndex })));
  expect(lessonControls.every((control) => control.tag === 'BUTTON' && control.tabIndex >= 0)).toBe(true);

  await page.evaluate(() => startQuiz('m1'));
  const quizControls = await page.locator('.quiz-option').evaluateAll((elements) => elements.map((element) => ({ tag: element.tagName, tabIndex: element.tabIndex })));
  expect(quizControls.every((control) => ['BUTTON', 'INPUT'].includes(control.tag) && control.tabIndex >= 0)).toBe(true);
});

test('module 1 lessons and quiz can be used with the keyboard only', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => navigateTo('m1'));
  const header = page.locator('.lesson-header').first();
  await header.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.lesson-card').first()).toHaveClass(/open/);
  await page.evaluate(() => startQuiz('m1'));
  const option = page.locator('.quiz-option').first();
  await option.focus();
  await page.keyboard.press('Enter');
  await expect(option).toHaveClass(/disabled|correct|wrong/);
});

test('the mobile menu closes with Escape and restores focus', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openApp(page);
  const hamburger = page.locator('.hamburger');
  await hamburger.click();
  await expect(page.locator('#sidebar')).toHaveClass(/open/);
  await page.keyboard.press('Escape');
  await expect(page.locator('#sidebar')).not.toHaveClass(/open/);
  await expect(hamburger).toBeFocused();
});

test('on mobile, sidebar groups stay clipped and the arrow toggles them', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openApp(page);
  await page.locator('.hamburger').click();
  await expect(page.locator('#sidebar')).toHaveClass(/open/);
  // Le bouton contrôle un seul conteneur qui doit contenir les quatre modules.
  const group = page.locator('#group-hardware');
  const header = page.locator('#group-hardware .sidebar-group-header');
  const body = page.locator('#group-hardware-body');
  const hardwareTargets = ['hw1', 'hw2', 'hw3', 'hw4'];
  await expect(group).not.toHaveClass(/open/);
  await expect(header).toHaveAttribute('aria-controls', 'group-hardware-body');
  await expect(header).toHaveAttribute('aria-expanded', 'false');
  for (const target of hardwareTargets) {
    const item = page.locator(`[data-target="${target}"]`);
    await expect(body.locator(`[data-target="${target}"]`)).toHaveCount(1);
    await expect(item).toBeHidden();
  }
  // On ouvre le groupe via son header (la flèche).
  await header.click();
  await expect(group).toHaveClass(/open/);
  await expect(header).toHaveAttribute('aria-expanded', 'true');
  for (const target of hardwareTargets) {
    await expect(page.locator(`[data-target="${target}"]`)).toBeVisible();
  }
  // La flèche referme : tous les items redeviennent masqués et non cliquables.
  await header.click();
  await expect(group).not.toHaveClass(/open/);
  await expect(header).toHaveAttribute('aria-expanded', 'false');
  for (const target of hardwareTargets) {
    await expect(page.locator(`[data-target="${target}"]`)).toBeHidden();
  }
  // La flèche rouvre : tous les items redeviennent cliquables.
  await header.click();
  await expect(group).toHaveClass(/open/);
  await expect(header).toHaveAttribute('aria-expanded', 'true');
  for (const target of hardwareTargets) {
    await expect(page.locator(`[data-target="${target}"]`)).toBeVisible();
  }
});

test('locked modules expose aria-disabled and a prerequisite label', async ({ page }) => {
  await openApp(page);
  const locked = page.locator('[data-target="m2"]');
  await expect(locked).toHaveAttribute('aria-disabled', 'true');
  await expect(locked).toContainText(/quiz précédent|verrouill/i);
});

test('reduced motion preference is declared in CSS', async ({ page }) => {
  await openApp(page);
  const declared = await page.evaluate(() => [...document.styleSheets].some((sheet) => {
    try {
      return [...sheet.cssRules].some((rule) => String(rule.cssText || '').includes('prefers-reduced-motion'));
    } catch {
      return false;
    }
  }));
  expect(declared).toBe(true);
});

