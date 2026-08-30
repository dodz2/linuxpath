import { test, expect } from '@playwright/test';
import { openApp } from './helpers.js';

test('all application sections remain inside the content area', async ({ page }) => {
  await openApp(page);
  const structure = await page.evaluate(() => {
    const content = document.querySelector('main > .content-area');
    const sections = [...document.querySelectorAll('main .module-section')];
    return {
      contentAreas: document.querySelectorAll('main > .content-area').length,
      sectionCount: sections.length,
      outside: sections.filter((section) => !content?.contains(section)).map((section) => section.id),
    };
  });
  expect(structure.contentAreas).toBe(1);
  expect(structure.sectionCount).toBeGreaterThanOrEqual(20);
  expect(structure.outside).toEqual([]);
});

test('the global terminal is minimized until the learner explicitly opens it', async ({ page }) => {
  await openApp(page);
  await expect(page.locator('#terminal-section')).toHaveClass(/\bminimized\b/);
});

test('mobile pages have no horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openApp(page);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'mobile-390', width: 390, height: 844 },
  { name: 'mobile-375', width: 375, height: 812 },
];

for (const viewport of VIEWPORTS) {
  test(`${viewport.name} has no horizontal overflow`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await openApp(page);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, viewport.name).toBeLessThanOrEqual(0);
  });
}

test('the modules overview grid is actually styled as a grid', async ({ page }) => {
  await openApp(page);
  const style = await page.locator('#modules-overview-grid').evaluate((element) => {
    const computed = getComputedStyle(element);
    return { display: computed.display, columns: computed.gridTemplateColumns };
  });
  expect(style.display).toBe('grid');
  expect(style.columns.split(' ').length).toBeGreaterThan(1);
});

test('the open desktop terminal does not intercept quiz controls', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => {
    navigateTo('m1');
    startQuiz('m1');
  });
  const option = page.locator('#section-m1 .quiz-option').first();
  await option.scrollIntoViewIfNeeded();
  await expect(option).toBeVisible();
  const box = await option.boundingBox();
  expect(box).toBeTruthy();
  const hit = await page.evaluate(({ x, y }) => {
    const top = document.elementFromPoint(x, y);
    return Boolean(top && top.closest('.quiz-option'));
  }, { x: box.x + box.width / 2, y: box.y + box.height / 2 });
  await expect(page.locator('#terminal-section')).toHaveClass(/\bminimized\b/);
  expect(hit).toBe(true);
});

test('entering ctf or sandbox closes the global terminal drawer', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => {
    setTerminalMinimized(false);
    navigateTo('ctf');
  });
  await expect(page.locator('#terminal-section')).toHaveClass(/\bminimized\b/);
  await page.evaluate(() => {
    setTerminalMinimized(false);
    navigateTo('sandbox');
  });
  await expect(page.locator('#terminal-section')).toHaveClass(/\bminimized\b/);
});

test('the home page publishes an honest device compatibility matrix', async ({ page }) => {
  await openApp(page);
  const matrix = page.locator('#compat-matrix');
  await expect(matrix).toBeVisible();
  await expect(matrix).toContainText(/site/i);
  await expect(matrix).toContainText(/sandbox/i);
  await expect(matrix).toContainText(/desktop/i);
  const heroCopy = await page.locator('#section-home').innerText();
  expect(heroCopy.toLowerCase()).not.toMatch(/100%\s*mobile/);
});

test('the minimized terminal does not cover the last home content', async ({ page }) => {
  await openApp(page);
  const last = page.locator('#section-home .lp-final-cta');
  await last.scrollIntoViewIfNeeded();
  const overlap = await page.evaluate(() => {
    const node = document.querySelector('#section-home .lp-final-cta');
    const terminal = document.querySelector('#terminal-section');
    if (!node || !terminal) return { missing: true };
    const lastBox = node.getBoundingClientRect();
    const termBox = terminal.getBoundingClientRect();
    return { lastBottom: lastBox.bottom, termTop: termBox.top, overlap: lastBox.bottom - termBox.top };
  });
  expect(overlap.missing).toBeFalsy();
  expect(overlap.overlap).toBeLessThanOrEqual(0);
});

test('landscape mobile has no horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await openApp(page);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test('the home hero does not leave a dead gap before the programme', async ({ page }) => {
  await openApp(page);
  const gap = await page.evaluate(() => {
    const hero = document.querySelector('.lp-hero, #home-hero');
    if (!hero) return null;
    return parseFloat(getComputedStyle(hero.matches('.lp-hero') ? hero : hero.querySelector('.lp-hero') || hero).marginBottom);
  });
  expect(gap).not.toBeNull();
  expect(gap).toBeLessThanOrEqual(32);
});
