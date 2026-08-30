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
