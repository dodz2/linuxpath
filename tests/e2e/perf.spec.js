import { test, expect } from '@playwright/test';
import { openApp } from './helpers.js';

test('a cold home load does not fetch webfonts or the sandbox emulator', async ({ page }) => {
  const forbidden = [];
  page.on('request', (request) => {
    const url = request.url();
    if (/fonts\.googleapis\.com|fonts\.gstatic\.com|\/v86\//.test(url)) forbidden.push(url);
  });
  await openApp(page);
  await page.waitForLoadState('networkidle');
  expect(forbidden).toEqual([]);
});

test('home does not mount the whole curriculum DOM', async ({ page }) => {
  await openApp(page);
  await expect(page.locator('.lesson-card')).toHaveCount(0);
  await expect(page.locator('.exercise-card')).toHaveCount(0);
  const heroMin = await page.locator('#home-hero').evaluate((el) => parseFloat(getComputedStyle(el).minHeight));
  expect(heroMin).toBeGreaterThanOrEqual(180);
});

test('opening a module renders it and the back button restores home', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => navigateTo('m1'));
  await expect(page.locator('#section-m1 .lesson-card')).toHaveCount(4);
  await expect(page.locator('#section-m1 .quiz-card')).toHaveCount(1);
  await page.goBack();
  await expect(page.locator('#section-home')).toHaveClass(/active/);
  await expect(page.locator('#home-hero')).toBeVisible();
});
