import { test, expect } from '@playwright/test';
import { openApp } from './helpers.js';

test('the hero displays a demo terminal with a typing boot sequence', async ({ page }) => {
  await openApp(page);
  const term = page.locator('[data-hero-terminal]');
  await expect(term).toBeVisible();
  await expect(term).toHaveAttribute('aria-label', /démonstration|demo/i);
  // the first demo command appears after a short typing delay
  await expect(page.locator('[data-hero-screen]')).toContainText(/whoami|visiteur@linuxpath/, { timeout: 8000 });
});

test('the demo script eventually prints its first output line', async ({ page }) => {
  await openApp(page);
  const screen = page.locator('[data-hero-screen]');
  await page.waitForFunction(() => {
    const screen = document.querySelector('[data-hero-screen]');
    if (!screen) return false;
    const outs = screen.querySelectorAll('.hero-term-out');
    return outs.length >= 1 && outs[0].textContent.trim() === 'visiteur';
  }, undefined, { timeout: 12000 });
  await expect(screen.locator('.hero-term-out').first()).toHaveText('visiteur');
});

test('reduced motion renders the full demo instantly without animation', async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await context.newPage();
  await openApp(page);
  // with reduced motion the whole script is present near-immediately
  await expect(page.locator('[data-hero-screen]')).toContainText(/motivation\.txt/, { timeout: 8000 });
  await context.close();
});

test('the demo terminal becomes a real input on keyboard interaction', async ({ page }) => {
  await openApp(page);
  const input = page.locator('[data-hero-input]');
  // reachable via keyboard
  await expect(input).toBeVisible();
  await input.focus();
  await page.keyboard.type('echo coucou');
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-hero-screen]')).toContainText('coucou', { timeout: 5000 });
  // an unknown command answers honestly
  await input.fill('rm -rf /');
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-hero-screen]')).toContainText(/indisponible|démo/i, { timeout: 5000 });
});

test('the hero demo terminal is announced and unobtrusive for assistive tech', async ({ page }) => {
  await openApp(page);
  const term = page.locator('[data-hero-terminal]');
  await expect(term).toHaveAttribute('role', 'group');
  await expect(term).toHaveAttribute('aria-label', /démonstration/i);
  // the decorative animated screen is hidden from AT, the input is labelled
  await expect(page.locator('[data-hero-screen]')).toHaveAttribute('aria-hidden', 'true');
  await expect(page.locator('[data-hero-input]')).toHaveAttribute('aria-label', /commande/);
});