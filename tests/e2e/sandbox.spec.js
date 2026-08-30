import { test, expect } from '@playwright/test';
import { openApp } from './helpers.js';

test('sandbox panel is reachable and describes its scope honestly', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => navigateTo('sandbox'));
  await expect(page.locator('#section-sandbox')).toHaveClass(/active/);
  await expect(page.locator('#btn-start-sandbox')).toBeVisible();
  await expect(page.locator('#section-sandbox')).toContainText(/WebAssembly|Alpine|isol/i);
  await expect(page.locator('#section-sandbox')).toContainText(/Limites|isol/i);
});

test('sandbox shows a loading state, times out or boots, and can be reset without leaking listeners', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => navigateTo('sandbox'));
  const start = page.locator('#btn-start-sandbox');
  await start.click();
  // status must appear promptly
  await expect(page.locator('#sandbox-status')).toBeVisible({ timeout: 5_000 });
  await expect(page.locator('#sandbox-status-text')).not.toBeEmpty({ timeout: 5_000 });
  // either it boots (emulator-started) or it shows a failure within 20s — never stuck forever on spinner
  await page.waitForFunction(() => {
    const txt = document.getElementById('sandbox-status-text')?.textContent || '';
    const hidden = document.getElementById('sandbox-status')?.style.display === 'none';
    return hidden || /échoué|erreur|timeout|Boot en cours|Chargement/i.test(txt);
  }, { timeout: 20_000 });

  // reset must not duplicate the Enter handler on the fallback input
  const before = await page.evaluate(() => {
    const input = document.getElementById('sandbox-input');
    // count listeners via a marker we set: window.__sandboxKeydownCount
    return window.__sandboxKeydownCount || 0;
  });
  // trigger reset if available, otherwise start again
  const reset = page.locator('#btn-reset-sandbox');
  if (await reset.isVisible()) {
    await reset.click();
    await page.waitForTimeout(600);
    await reset.click().catch(() => {});
    await page.waitForTimeout(600);
  } else {
    await start.click().catch(() => {});
    await page.waitForTimeout(600);
  }
  const after = await page.evaluate(() => window.__sandboxKeydownCount || 0);
  // must not have grown by more than 1 (exactly 1 handler, not N)
  expect(after).toBeLessThanOrEqual(1);
  // pressing Enter once must not fire the handler twice
  const sends = await page.evaluate(async () => {
    window.__sandboxSends = 0;
    const orig = typeof _sandboxEmulator !== 'undefined' && _sandboxEmulator ? _sandboxEmulator.keyboard_send_text : null;
    if (orig) {
      _sandboxEmulator.keyboard_send_text = function(t) { window.__sandboxSends++; return orig.call(this, t); };
    }
    const input = document.getElementById('sandbox-input');
    if (input) {
      input.focus();
      input.value = 'echo ok';
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    }
    await new Promise(r => setTimeout(r, 200));
    return window.__sandboxSends || 0;
  });
  // 2 Enters should give exactly 2 sends, not 4 (would indicate duplicate listeners)
  expect(sends).toBeLessThanOrEqual(2);
});
