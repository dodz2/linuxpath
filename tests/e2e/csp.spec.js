import { test, expect } from '@playwright/test';
import { openApp } from './helpers.js';

test('CSP stays violation-free across home, module, CTF and v86 sandbox', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await page.addInitScript(() => {
    window.__cspViolations = [];
    document.addEventListener('securitypolicyviolation', (event) => {
      window.__cspViolations.push({
        directive: event.effectiveDirective,
        blockedURI: event.blockedURI,
        sourceFile: event.sourceFile,
      });
    });
  });

  await openApp(page);
  const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
  expect(csp).toContain("script-src 'self' 'wasm-unsafe-eval'");
  expect(csp).not.toContain("script-src 'self' 'unsafe-inline'");
  expect(csp).not.toContain("'unsafe-eval'");

  for (const target of ['m1', 'ctf']) {
    await page.evaluate((section) => navigateTo(section), target);
  }
  await page.evaluate(() => navigateTo('sandbox'));
  await page.locator('#btn-start-sandbox').click();
  await expect.poll(async () => page.locator('#sandbox-screen').textContent(), { timeout: 60_000 }).toContain('/root%');

  const violations = await page.evaluate(() => window.__cspViolations);
  await testInfo.attach('csp-violations', {
    body: JSON.stringify(violations, null, 2),
    contentType: 'application/json',
  });
  expect(violations).toEqual([]);
});

test('declarative delegation drives static and dynamic controls and rejects unknown parameters', async ({ page }) => {
  await openApp(page);

  expect(await page.locator('[onclick], [oninput], [onkeydown]').count()).toBe(0);
  expect(await page.locator('[data-action="navigate"]').count()).toBeGreaterThan(0);

  await page.locator('#nav-roadmap').click();
  expect(await page.evaluate(() => currentSection)).toBe('roadmap');

  await page.evaluate(() => navigateTo('m1'));
  const lesson = page.locator('.lesson-header').first();
  await lesson.click();
  await expect(page.locator('.lesson-card').first()).toHaveClass(/open/);

  const previousSection = await page.evaluate(() => currentSection);
  await page.evaluate(() => {
    const probe = document.createElement('button');
    probe.id = 'invalid-delegated-action';
    probe.dataset.action = 'navigate';
    probe.dataset.target = 'constructor';
    document.body.appendChild(probe);
  });
  await page.evaluate(() => document.getElementById('invalid-delegated-action').click());
  expect(await page.evaluate(() => currentSection)).toBe(previousSection);

  await page.evaluate(() => {
    const probe = document.getElementById('invalid-delegated-action');
    probe.dataset.action = 'constructor';
    probe.click();
  });
  expect(await page.evaluate(() => currentSection)).toBe(previousSection);

  await page.evaluate(() => navigateTo('ctf'));
  await expect(page.locator('.ctf-card')).toHaveCount(10);
  await page.locator('#ctf-card-ctf-01 .ctf-card-btn').click();
  await expect(page.locator('#ctf-detail')).toBeVisible();

  const runtimeHandlers = await page.locator('*').evaluateAll((elements) => elements.flatMap((element) => (
    ['onclick', 'oninput', 'onkeydown', 'onchange', 'onload', 'onerror']
      .filter((property) => typeof element[property] === 'function')
      .map((property) => `${element.tagName.toLowerCase()}#${element.id || ''}.${property}`)
  )));
  expect(runtimeHandlers).toEqual([]);
});

test('field clicks never submit exercise commands or CTF flags before Enter', async ({ page }) => {
  await openApp(page);

  await page.evaluate(() => navigateTo('m1'));
  const exerciseInput = page.locator('#ex-input-m1-e1');
  await exerciseInput.fill('mkdir projets');
  await exerciseInput.click();
  const exerciseBeforeEnter = await page.evaluate(() => ({
    solved: state.exercisesDone.has('m1-e1'),
    feedback: document.querySelector('#feedback-m1-e1')?.textContent.trim(),
  }));
  await exerciseInput.press('Enter');
  const exerciseAfterEnter = await page.evaluate(() => ({
    solved: state.exercisesDone.has('m1-e1'),
    feedback: document.querySelector('#feedback-m1-e1')?.textContent.trim(),
  }));

  await page.evaluate(() => navigateTo('ctf'));
  await page.locator('#ctf-card-ctf-01 .ctf-card-btn').click();
  const flagInput = page.locator('#ctf-flag-input');
  await flagInput.fill('flag{hidden_in_plain_sight}');
  await flagInput.click();
  const flagBeforeEnter = await page.evaluate(() => ({
    solved: ctfState.solved.has('ctf-01'),
    feedback: document.querySelector('#ctf-flag-feedback')?.textContent.trim(),
  }));
  await flagInput.press('Enter');
  const flagAfterEnter = await page.evaluate(() => ({
    solved: ctfState.solved.has('ctf-01'),
    feedback: document.querySelector('#ctf-flag-feedback')?.textContent.trim(),
  }));

  expect({ exerciseBeforeEnter, flagBeforeEnter }).toEqual({
    exerciseBeforeEnter: { solved: false, feedback: '' },
    flagBeforeEnter: { solved: false, feedback: '' },
  });
  expect(exerciseAfterEnter.solved).toBe(true);
  expect(exerciseAfterEnter.feedback).toMatch(/^✓/);
  expect(flagAfterEnter.solved).toBe(true);
  expect(flagAfterEnter.feedback).toMatch(/bravo|résolu|succès/i);
});
