import { test, expect } from '@playwright/test';
import { openApp } from './helpers.js';

test('a new visitor sees three tracks before marketing copy', async ({ page }) => {
  await openApp(page);
  const order = await page.evaluate(() => {
    const ids = ['track-picker', 'lp-modules', 'compat-matrix'];
    return ids.map((id) => {
      const node = document.getElementById(id);
      return node ? node.getBoundingClientRect().top : null;
    });
  });
  expect(order[0]).not.toBeNull();
  expect(order[1]).not.toBeNull();
  expect(order[0]).toBeLessThan(order[1]);
  expect(order[1]).toBeLessThan(order[2]);
  const picker = page.locator('#track-picker');
  await expect(picker).toContainText(/Fondamentaux Linux/);
  await expect(picker).toContainText(/Réseau/);
  await expect(picker).toContainText(/DFIR|Pentest/);
  await expect(picker).not.toContainText(/offensive/i);
});

test('the home primary action is choose a track or continue', async ({ page }) => {
  await openApp(page);
  const primary = page.locator('#home-hero .lp-cta-primary').first();
  await expect(primary).toBeVisible();
  await expect(primary).toHaveText(/parcours|Continuer|Reprendre/i);
});

test('an experienced learner can enter the network track without finishing Linux', async ({ page }) => {
  await openApp(page);
  await page.locator('#track-network-enter').click();
  await expect(page.locator('#section-m9')).toHaveClass(/active/);
});

test('module 1 states observable objectives and a success criterion', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => navigateTo('m1'));
  const header = page.locator('#section-m1 .module-header');
  await expect(header).toContainText(/Objectif/i);
  await expect(header).toContainText(/min/);
  await expect(header).toContainText(/Réussite|critère/i);
});

test('m8 renders Git then Docker chapter headings', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => {
    state.unlockedModules.add('m8');
    navigateTo('m8');
  });
  await expect(page.locator('#section-m8 .chapter-heading')).toHaveCount(2);
  await expect(page.locator('#section-m8 .chapter-heading').nth(0)).toHaveText(/Git/i);
  await expect(page.locator('#section-m8 .chapter-heading').nth(1)).toHaveText(/Docker/i);
});
