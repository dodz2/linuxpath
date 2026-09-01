import { test, expect } from '@playwright/test';
import { openApp } from './helpers.js';

async function openSandbox(page) {
  await openApp(page);
  await page.evaluate(() => navigateTo('sandbox'));
  await expect(page.locator('#section-sandbox')).toHaveClass(/active/);
}

async function startAndWaitForLinuxPrompt(page) {
  await page.locator('#btn-start-sandbox').click();
  const screenContainer = page.locator('#sandbox-screen');
  await expect(screenContainer).toContainText('/root%', { timeout: 35_000 });
  await expect(screenContainer).not.toBeEmpty();
  expect(await page.evaluate(() => typeof _sandboxEmulator === 'object' && _sandboxEmulator !== null)).toBe(true);
  return screenContainer;
}

test('sandbox panel is reachable and describes its scope honestly', async ({ page }) => {
  await openSandbox(page);
  await expect(page.locator('#btn-start-sandbox')).toBeVisible();
  await expect(page.locator('#section-sandbox')).toContainText(/WebAssembly|Alpine|isol/i);
  await expect(page.locator('#section-sandbox')).toContainText(/Limites|isol/i);
});

test('sandbox boots a real v86 instance to a non-empty Linux prompt', async ({ page }) => {
  test.setTimeout(45_000);
  await openSandbox(page);

  const screenContainer = await startAndWaitForLinuxPrompt(page);
  await expect(screenContainer).toContainText(/VFS: Mounted root|\/root%/);
  await expect(page.locator('#sandbox-screen-wrap')).toBeVisible();
});

test('sandbox reset keeps one Enter listener and sends exactly two commands for two Enters', async ({ page }) => {
  test.setTimeout(70_000);
  await openSandbox(page);
  let screenContainer = await startAndWaitForLinuxPrompt(page);

  const reset = page.locator('#btn-reset-sandbox');
  await expect(reset).toBeVisible();
  await reset.click();
  screenContainer = page.locator('#sandbox-screen');
  await expect(screenContainer).toContainText('/root%', { timeout: 35_000 });
  await screenContainer.click();

  await page.evaluate(() => {
    window.__sandboxKeydownCount = 0;
    window.__sandboxSends = [];
    const originalSend = _sandboxEmulator.keyboard_send_text.bind(_sandboxEmulator);
    _sandboxEmulator.keyboard_send_text = (text) => {
      window.__sandboxSends.push(text);
      return originalSend(text);
    };
  });

  const input = page.locator('#sandbox-input');
  await input.focus();
  await input.fill('echo first');
  await input.press('Enter');
  await input.fill('echo second');
  await input.press('Enter');

  await expect.poll(() => page.evaluate(() => window.__sandboxSends.length)).toBe(2);
  expect(await page.evaluate(() => window.__sandboxSends)).toEqual(['echo first\n', 'echo second\n']);
  expect(await page.evaluate(() => window.__sandboxKeydownCount)).toBe(2);
});
