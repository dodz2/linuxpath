import { test, expect } from '@playwright/test';
import { openApp } from './helpers.js';

async function openFirstChallenge(page) {
  await page.evaluate(() => {
    if (typeof setTerminalMinimized === 'function') setTerminalMinimized(true);
    navigateTo('ctf');
  });
  await expect(page.locator('.ctf-card')).toHaveCount(10);
  await page.locator('#ctf-card-ctf-01 .ctf-card-btn').click();
  await expect(page.locator('#ctf-detail')).toBeVisible();
}

async function sendCtfCommand(page, command) {
  const input = page.locator('#ctf-terminal-input');
  await input.fill(command);
  await input.press('Enter');
}

test('ctf-01 can be solved through its official terminal path and submitted', async ({ page }, testInfo) => {
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await openApp(page);
  await openFirstChallenge(page);
  await sendCtfCommand(page, 'ls -la /home/user/');
  await sendCtfCommand(page, 'cat /home/user/.secret');

  const output = await page.locator('#ctf-terminal-output').innerText();
  const flag = output.match(/flag\{[^}\n]+\}/i)?.[0];
  expect(flag, output).toBeTruthy();
  await page.locator('#ctf-flag-input').fill(flag);
  await page.locator('.ctf-submit-btn').click();
  await testInfo.attach('page-errors', { body: JSON.stringify(pageErrors, null, 2), contentType: 'application/json' });

  expect(pageErrors, 'submitting a flag must not throw').toEqual([]);
  await expect(page.locator('#ctf-flag-feedback')).toContainText(/bravo|résolu|succès/i);
  expect(await page.evaluate(() => ctfState.solved.has('ctf-01'))).toBe(true);
});

test('the CTF reset control restores the challenge terminal', async ({ page }, testInfo) => {
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await openApp(page);
  await openFirstChallenge(page);
  await sendCtfCommand(page, 'cd /home/user');
  expect(await page.evaluate(() => ctfTerminal.getCurrentDir())).toBe('/home/user');

  await page.locator('.ctf-reset-term-btn').click();
  await testInfo.attach('page-errors', { body: JSON.stringify(pageErrors, null, 2), contentType: 'application/json' });
  expect(pageErrors, 'resetting the CTF terminal must not throw').toEqual([]);
  expect(await page.evaluate(() => ctfTerminal.getCurrentDir())).toBe('/');
  await expect(page.locator('#ctf-terminal-output')).toContainText('Challenge');
});

test('Enter and the submit button both accept the same valid flag', async ({ page }) => {
  await openApp(page);
  await openFirstChallenge(page);
  await page.locator('#ctf-flag-input').fill('flag{hidden_in_plain_sight}');
  await page.locator('#ctf-flag-input').press('Enter');
  await expect(page.locator('#ctf-flag-feedback')).toContainText(/bravo|résolu|succès/i);
  expect(await page.evaluate(() => ctfState.solved.has('ctf-01'))).toBe(true);
  expect(await page.evaluate(() => ctfState.how?.['ctf-01'] || 'autonomous')).toBe('autonomous');
});

test('a wrong flag is rejected without marking the challenge solved', async ({ page }) => {
  await openApp(page);
  await openFirstChallenge(page);
  await page.locator('#ctf-flag-input').fill('flag{nope}');
  await page.locator('.ctf-submit-btn').click();
  await expect(page.locator('#ctf-flag-feedback')).toContainText(/incorrect|réessaye|invalide/i);
  expect(await page.evaluate(() => ctfState.solved.has('ctf-01'))).toBe(false);
});

test('solving with a revealed hint is recorded as helped', async ({ page }) => {
  await openApp(page);
  await openFirstChallenge(page);
  await page.locator('#ctf-hint-btn').click();
  await page.locator('#ctf-flag-input').fill('flag{hidden_in_plain_sight}');
  await page.locator('.ctf-submit-btn').click();
  const meta = await page.evaluate(() => ({
    solved: ctfState.solved.has('ctf-01'),
    hints: ctfState.hints['ctf-01'],
    how: ctfState.how?.['ctf-01'],
  }));
  expect(meta.solved).toBe(true);
  expect(meta.hints).toBeGreaterThan(0);
  expect(meta.how).toBe('with_help');
});

test('submitting every official flag reaches 10/10 and survives reload', async ({ page }) => {
  const flags = {
    'ctf-01': 'flag{hidden_in_plain_sight}',
    'ctf-02': 'flag{world_readable_mistake}',
    'ctf-03': 'flag{base64_is_not_encryption}',
    'ctf-04': 'flag{environment_variable_leak}',
    'ctf-05': 'flag{process_arguments_exposed}',
    'ctf-06': 'flag{network_exfiltration_trace}',
    'ctf-07': 'flag{dns_chain_resolved}',
    'ctf-08': 'flag{cleartext_credentials_leaked}',
    'ctf-09': 'flag{port_4444_open_backdoor}',
    'ctf-10': 'flag{ssh_key_hidden_in_backup}',
  };
  await openApp(page);
  await page.evaluate(() => navigateTo('ctf'));
  await expect(page.locator('.ctf-card')).toHaveCount(10);
  await page.evaluate(async (official) => {
    for (const [id, flag] of Object.entries(official)) {
      ctfCurrentId = id;
      const input = document.getElementById('ctf-flag-input');
      if (input) {
        input.disabled = false;
        input.value = flag;
      }
      await submitCTFFlag();
    }
    updateCTFBadge();
    renderCTFGrid();
  }, flags);
  expect(await page.evaluate(() => ctfState.solved.size)).toBe(10);
  await expect(page.locator('#nav-badge-ctf')).toHaveText('10/10');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof loadCTFState === 'function' && ctfState.solved.size === 10);
  await expect(page.locator('#nav-badge-ctf')).toHaveText('10/10');
});
