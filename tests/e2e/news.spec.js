import { test, expect } from '@playwright/test';
import { openApp } from './helpers.js';

test('news lives in a secondary resources group without a NEW badge', async ({ page }) => {
  await openApp(page);
  // ouvrir le groupe ressources comme le ferait un utilisateur (il est fermé par défaut)
  await page.locator('#group-resources .sidebar-group-header').click();
  const news = page.locator('#nav-news');
  await expect(news).toBeVisible();
  await expect(news).not.toContainText(/NEW/);
  const group = page.locator('#group-resources');
  await expect(group.locator('#nav-cheatsheet')).toHaveCount(1);
  await expect(group.locator('#nav-glossary')).toHaveCount(1);
  await expect(group.locator('#nav-news')).toHaveCount(1);
  const order = await page.evaluate(() => {
    const ids = [...document.querySelectorAll('#group-resources-body [data-target]')].map((el) => el.getAttribute('data-target'));
    return ids;
  });
  expect(order.at(-1)).toBe('news');
});

test('the news page does not claim a manual verified update', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => navigateTo('news'));
  await expect(page.locator('#section-news')).toHaveClass(/active/);
  await expect(page.locator('#section-news')).not.toContainText(/manuellement/i);
  const unevaluated = page.locator('.news-sev-badge.unevaluated');
  const count = await unevaluated.count();
  expect(count).toBeGreaterThan(0);
});
