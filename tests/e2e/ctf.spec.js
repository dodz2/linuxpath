import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { openApp } from './helpers.js';

const ctfFixturePath = fileURLToPath(new URL('../../data/ctf.json', import.meta.url));

async function openFirstChallenge(page) {
  await page.evaluate(() => {
    if (typeof setTerminalMinimized === 'function') setTerminalMinimized(true);
    navigateTo('ctf');
  });
  await expect(page.locator('.ctf-card')).toHaveCount(10);
  await page.locator('#ctf-card-ctf-01 .ctf-card-btn').click();
  await expect(page.locator('#ctf-detail')).toBeVisible();
}

async function openChallenge(page, id) {
  await page.evaluate(() => {
    if (typeof setTerminalMinimized === 'function') setTerminalMinimized(true);
    navigateTo('ctf');
  });
  await expect(page.locator('.ctf-card')).toHaveCount(10);
  await page.locator(`#ctf-card-${id} .ctf-card-btn`).click();
  await expect(page.locator('#ctf-detail')).toBeVisible();
}

async function sendCtfCommand(page, command) {
  const input = page.locator('#ctf-terminal-input');
  await input.fill(command);
  await input.press('Enter');
}

test('a pending optional CTF request never blocks the main application bootstrap', async ({ page }) => {
  await page.route('**/data/ctf.json', () => new Promise(() => {}));

  const response = await page.goto('./', { waitUntil: 'domcontentloaded' });
  expect(response?.status()).toBe(200);
  await page.waitForFunction(() => typeof APP_READY !== 'undefined' && APP_READY, null, { timeout: 5_000 });

  await expect(page.locator('#home-hero .lp-hero, #home-hero > *').first()).toBeVisible();
  expect(await page.evaluate(() => ({
    mainTerminalReady: Boolean(mainTerminal),
    ctfStatus: CTF_CATALOGUE_STATUS,
    moduleCount: getPublishedModuleIds().length,
  }))).toEqual({
    mainTerminalReady: true,
    ctfStatus: 'loading',
    moduleCount: 19,
  });
});

test('a CTF catalogue 404 exposes an honest retryable alert and recovers on 200', async ({ page }) => {
  let catalogueRequests = 0;
  await page.route('**/data/ctf.json', async (route) => {
    catalogueRequests += 1;
    if (catalogueRequests === 1) {
      await route.fulfill({
        status: 404,
        contentType: 'text/plain',
        body: 'raw server stack secret\n    at catalogue.js:42'
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      path: ctfFixturePath
    });
  });

  await page.goto('./', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof APP_READY !== 'undefined' && APP_READY);
  await page.evaluate(() => navigateTo('ctf'));

  const alert = page.locator('#ctf-grid [role="alert"]');
  await expect(alert).toContainText('Impossible de charger le catalogue CTF');
  await expect(alert).not.toContainText('raw server stack');
  await expect(alert).not.toContainText('catalogue.js');
  const retry = alert.getByRole('button', { name: 'Réessayer' });
  await expect(retry).toBeVisible();
  await retry.click();

  await expect(page.locator('.ctf-card')).toHaveCount(10);
  await expect(alert).toHaveCount(0);
  expect(catalogueRequests).toBe(2);
});

test('an empty successful CTF catalogue is distinct from a loading failure', async ({ page }) => {
  await page.route('**/data/ctf.json', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ challenges: [] })
  }));

  await page.goto('./', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof APP_READY !== 'undefined' && APP_READY);
  await page.evaluate(() => navigateTo('ctf'));

  const status = page.locator('#ctf-grid [role="status"]');
  await expect(status).toContainText('catalogue CTF est disponible');
  await expect(status).toContainText('aucun challenge');
  await expect(page.locator('#ctf-grid [role="alert"]')).toHaveCount(0);
  await expect(page.locator('#ctf-grid .ctf-catalogue-retry')).toHaveCount(0);
  await expect(page.locator('.ctf-card')).toHaveCount(0);
  expect(await page.evaluate(() => CTF_CATALOGUE_STATUS)).toBe('empty');
});

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

test('all ten CTF catalogues expose closed VFS graphs and executable command stubs', async ({ page }, testInfo) => {
  await openApp(page);
  const reports = await page.evaluate(() => CTF_CHALLENGES.map((challenge) => {
    const errors = [];
    let executableReferences = 0;
    for (const [parent, node] of Object.entries(challenge.vfs)) {
      if (!node || node.type !== 'dir') continue;
      for (const child of node.children || []) {
        const childPath = parent === '/' ? `/${child}` : `${parent}/${child}`;
        if (!Object.hasOwn(challenge.vfs, childPath)) errors.push(`missing child: ${childPath}`);
      }
    }
    for (const command of challenge.vfs['/bin']?.children || []) {
      executableReferences += 1;
      const commandPath = `/bin/${command}`;
      const commandNode = challenge.vfs[commandPath];
      if (!commandNode || commandNode.type !== 'file') errors.push(`invalid executable node: ${commandPath}`);
      else if (commandNode.perms !== '-rwxr-xr-x') errors.push(`non-executable permissions: ${commandPath}`);
      else if (commandNode.content !== '') errors.push(`non-neutral executable content: ${commandPath}`);
    }
    return { id: challenge.id, executableReferences, errors };
  }));

  await testInfo.attach('ctf-vfs-closure', {
    body: JSON.stringify(reports, null, 2),
    contentType: 'application/json',
  });
  expect(reports).toHaveLength(10);
  expect(reports.reduce((total, report) => total + report.executableReferences, 0)).toBe(27);
  const broken = reports.filter((report) => report.errors.length > 0);
  expect(broken, JSON.stringify(broken, null, 2)).toEqual([]);
});

test("ctf-06 awk extracts only the documented final DATA fields", async ({ page }) => {
  await openApp(page);
  await openChallenge(page, 'ctf-06');
  await sendCtfCommand(page, "grep '203.0.113.99' /var/log/syslog | awk '{print $NF}'");

  const result = await page.evaluate(() => ({
    outputLines: [...document.querySelectorAll('#ctf-terminal-output .term-output')]
      .map((line) => line.textContent.trim())
      .filter(Boolean),
    errors: [...document.querySelectorAll('#ctf-terminal-output .t-err')]
      .map((line) => line.textContent.trim()),
  }));
  expect(result.errors).toEqual([]);
  expect(result.outputLines.slice(-4)).toEqual([
    'DATA=flag{',
    'DATA=network_',
    'DATA=exfiltration_',
    'DATA=trace}',
  ]);
});

test('ctf-06 cut accepts the documented attached options', async ({ page }) => {
  await openApp(page);
  await openChallenge(page, 'ctf-06');
  await sendCtfCommand(page, "grep '203.0.113.99' /var/log/syslog | cut -d= -f2");

  const result = await page.evaluate(() => ({
    outputLines: [...document.querySelectorAll('#ctf-terminal-output .term-output')]
      .map((line) => line.textContent.trim())
      .filter(Boolean),
    errors: [...document.querySelectorAll('#ctf-terminal-output .t-err')]
      .map((line) => line.textContent.trim()),
  }));
  expect(result.errors).toEqual([]);
  expect(result.outputLines.slice(-4)).toEqual(['flag{', 'network_', 'exfiltration_', 'trace}']);
});

test('dig renders hostile catalogue values as inert text without changing their display', async ({ page }) => {
  await openApp(page);
  await openChallenge(page, 'ctf-07');
  const hostile = '<img src=x onerror=window.__digExecuted=1>';
  await page.evaluate((value) => {
    window.__digExecuted = 0;
    const challenge = CTF_CHALLENGES.find((entry) => entry.id === 'ctf-07');
    challenge._dns['hostile.target.local'] = { type: 'CNAME', value };
    ctfTerminal.exec('dig hostile.target.local');
  }, hostile);

  const output = page.locator('#ctf-terminal-output');
  await expect(output).toContainText(hostile);
  await expect(output.locator('img')).toHaveCount(0);
  expect(await page.evaluate(() => window.__digExecuted)).toBe(0);
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
