import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { openApp } from './helpers.js';

const AUDITED_VIEWS = [
  'home', 'sandbox', 'ctf', 'news', 'cheatsheet', 'glossary', 'roadmap',
  'm1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8', 'm9', 'm10', 'm11',
  'cs1', 'm12', 'm13', 'm14', 'hw1', 'hw2', 'hw3', 'hw4',
];
const STRUCTURAL_RULES = new Set(['page-has-heading-one', 'region', 'heading-order']);

async function blockingAxe(page, label) {
  const results = await new AxeBuilder({ page }).analyze();
  return results.violations
    .filter((violation) => ['serious', 'critical'].includes(violation.impact) || STRUCTURAL_RULES.has(violation.id))
    .map((violation) => `${label}:${violation.id}:${violation.impact} (${violation.nodes.length})`);
}

test('all 26 views on desktop and mobile have one H1, named regions and no blocking axe violation', async ({ page }, testInfo) => {
  test.setTimeout(300_000);
  await openApp(page);
  await page.evaluate(() => {
    getPublishedModuleIds().forEach((moduleId) => state.unlockedModules.add(moduleId));
    updateProgressUI();
  });

  const blocking = [];
  const headingFailures = [];
  for (const viewport of [
    { name: 'desktop', width: 1440, height: 1000 },
    { name: 'mobile', width: 390, height: 844 },
  ]) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    for (const view of AUDITED_VIEWS) {
      await page.evaluate((target) => navigateTo(target), view);
      if (view === 'm1') await page.evaluate(() => startQuiz('m1'));
      const heading = await page.locator(`#section-${view} h1:visible`).allTextContents();
      if (heading.length !== 1 || !heading[0].trim()) {
        headingFailures.push(`${viewport.name}:${view}: ${JSON.stringify(heading)}`);
      }
      blocking.push(...await blockingAxe(page, `${viewport.name}:${view}`));
    }
  }

  await testInfo.attach('axe-blocking', { body: JSON.stringify(blocking, null, 2), contentType: 'application/json' });
  await testInfo.attach('heading-failures', { body: JSON.stringify(headingFailures, null, 2), contentType: 'application/json' });
  expect(headingFailures).toEqual([]);
  expect(blocking).toEqual([]);
});

test('lesson toggles and quiz options are native keyboard controls', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => navigateTo('m1'));
  const lessonControls = await page.locator('.lesson-header').evaluateAll((elements) => elements.map((element) => ({ tag: element.tagName, tabIndex: element.tabIndex })));
  expect(lessonControls.every((control) => control.tag === 'BUTTON' && control.tabIndex >= 0)).toBe(true);

  await page.evaluate(() => startQuiz('m1'));
  const quizControls = await page.locator('.quiz-option').evaluateAll((elements) => elements.map((element) => ({ tag: element.tagName, tabIndex: element.tabIndex })));
  expect(quizControls.every((control) => ['BUTTON', 'INPUT'].includes(control.tag) && control.tabIndex >= 0)).toBe(true);
});

test('module 1 lessons and quiz can be used with the keyboard only', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => navigateTo('m1'));
  const header = page.locator('.lesson-header').first();
  await header.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.lesson-card').first()).toHaveClass(/open/);
  await page.evaluate(() => startQuiz('m1'));
  const option = page.locator('.quiz-option').first();
  await option.focus();
  await page.keyboard.press('Enter');
  await expect(option).toHaveClass(/disabled|correct|wrong/);
});

test('terminal toggle and roadmap bonus actions are native keyboard controls', async ({ page }) => {
  await openApp(page);

  const terminalToggle = page.locator('#terminal-toggle');
  await expect(terminalToggle).toHaveJSProperty('tagName', 'BUTTON');
  await expect(terminalToggle).toHaveAttribute('aria-controls', 'terminal-output');
  await expect(terminalToggle).toHaveAttribute('aria-expanded', 'false');
  await terminalToggle.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#terminal-section')).not.toHaveClass(/minimized/);
  await expect(terminalToggle).toHaveAttribute('aria-expanded', 'true');
  await expect(terminalToggle).toBeFocused();
  await page.keyboard.press('Space');
  await expect(page.locator('#terminal-section')).toHaveClass(/minimized/);
  await expect(terminalToggle).toHaveAttribute('aria-expanded', 'false');
  await expect(terminalToggle).toBeFocused();
  expect(await terminalToggle.evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe('none');

  await page.evaluate(() => navigateTo('roadmap'));
  const bonusActions = page.locator('#roadmap-bonus-grid .roadmap-bonus-card');
  await expect(bonusActions).toHaveCount(5);
  expect(await bonusActions.evaluateAll((elements) => elements.every((element) => element.tagName === 'BUTTON' && element.tabIndex >= 0))).toBe(true);

  const firstBonus = bonusActions.first();
  await firstBonus.focus();
  await page.keyboard.press('Enter');
  expect(await page.evaluate(() => currentSection)).toBe('sandbox');
  await page.evaluate(() => navigateTo('roadmap'));
  await bonusActions.first().focus();
  await page.keyboard.press('Space');
  expect(await page.evaluate(() => currentSection)).toBe('sandbox');
});

test('CTF, flag and sandbox inputs have labels and terminal histories expose controlled logs', async ({ page }) => {
  await openApp(page);

  await expect(page.getByLabel('Commande du terminal CTF', { exact: true })).toHaveAttribute('id', 'ctf-terminal-input');
  await expect(page.getByLabel('Flag du challenge CTF', { exact: true })).toHaveAttribute('id', 'ctf-flag-input');
  await expect(page.getByLabel('Commande de la sandbox Linux', { exact: true })).toHaveAttribute('id', 'sandbox-input');

  for (const selector of ['#terminal-output', '#ctf-terminal-output']) {
    const log = page.locator(selector);
    await expect(log).toHaveAttribute('role', 'log');
    await expect(log).toHaveAttribute('aria-live', 'polite');
    await expect(log).toHaveAttribute('aria-atomic', 'false');
    await expect(log).toHaveAttribute('aria-relevant', 'additions');
  }
});

test('all 49 exercises expose persistent title-specific answer names', async ({ page }) => {
  await openApp(page);
  const rows = await page.evaluate(() => {
    getPublishedModuleIds().forEach((moduleId) => ensureModuleRendered(moduleId));
    return Object.values(EXERCISES).flat().map((exercise) => {
      const card = document.getElementById(`ex-card-${exercise.id}`);
      const controls = [...card.querySelectorAll('.exercise-input, [data-report-field]')];
      return {
        id: exercise.id,
        title: exercise.title,
        labels: controls.map((control) => control.getAttribute('aria-label') || ''),
      };
    });
  });

  expect(rows).toHaveLength(49);
  for (const row of rows) {
    expect(row.labels.length, row.id).toBeGreaterThan(0);
    expect(row.labels.every((label) => label.trim() && label.includes(row.id) && label.includes(row.title)), row.id).toBe(true);
    expect(new Set(row.labels).size, row.id).toBe(row.labels.length);
  }
});

test('all five FAQ disclosures expose their answer and state to assistive technologies', async ({ page }) => {
  await openApp(page);

  const faqButtons = page.locator('.lp-faq-q');
  await expect(faqButtons).toHaveCount(5);
  expect(await faqButtons.evaluateAll((buttons) => buttons.every((button) => {
    const answerId = button.getAttribute('aria-controls');
    const icon = button.querySelector('.lp-faq-icon');
    return button.getAttribute('aria-expanded') === 'false'
      && Boolean(answerId && document.getElementById(answerId))
      && icon?.getAttribute('aria-hidden') === 'true';
  }))).toBe(true);

  await faqButtons.first().focus();
  await page.keyboard.press('Enter');
  await expect(faqButtons.first()).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#faq-answer-1')).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(faqButtons.first()).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('#faq-answer-1')).toBeHidden();
});

test('a rejected clipboard copy announces an honest failure without raw exception text', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => navigateTo('cheatsheet'));
  await page.evaluate(async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: () => Promise.reject(new Error('raw clipboard stack secret')) }
    });
    document.execCommand = () => false;
    await copyCmd('pwd');
  });

  const toast = page.locator('#cheatsheet-toast');
  await expect(toast).toHaveAttribute('role', 'status');
  await expect(toast).toHaveAttribute('aria-live', 'polite');
  await expect(toast).toContainText('Échec de la copie');
  await expect(toast).not.toContainText('Copié');
  await expect(toast).not.toContainText('raw clipboard');
});

test('the mobile menu closes with Escape and restores focus', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openApp(page);
  const hamburger = page.locator('.hamburger');
  await hamburger.click();
  await expect(page.locator('#sidebar')).toHaveClass(/open/);
  await page.keyboard.press('Escape');
  await expect(page.locator('#sidebar')).not.toHaveClass(/open/);
  await expect(hamburger).toBeFocused();
});

test('on mobile, sidebar groups stay clipped and the arrow toggles them', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openApp(page);
  await page.locator('.hamburger').click();
  await expect(page.locator('#sidebar')).toHaveClass(/open/);
  // Le bouton contrôle un seul conteneur qui doit contenir les quatre modules.
  const group = page.locator('#group-hardware');
  const header = page.locator('#group-hardware .sidebar-group-header');
  const body = page.locator('#group-hardware-body');
  const hardwareTargets = ['hw1', 'hw2', 'hw3', 'hw4'];
  await expect(group).not.toHaveClass(/open/);
  await expect(header).toHaveAttribute('aria-controls', 'group-hardware-body');
  await expect(header).toHaveAttribute('aria-expanded', 'false');
  for (const target of hardwareTargets) {
    const item = body.locator(`[data-target="${target}"]`);
    await expect(body.locator(`[data-target="${target}"]`)).toHaveCount(1);
    await expect(item).toBeHidden();
  }
  // On ouvre le groupe via son header (la flèche).
  await header.click();
  await expect(group).toHaveClass(/open/);
  await expect(header).toHaveAttribute('aria-expanded', 'true');
  for (const target of hardwareTargets) {
    await expect(body.locator(`[data-target="${target}"]`)).toBeVisible();
  }
  // La flèche referme : tous les items redeviennent masqués et non cliquables.
  await header.click();
  await expect(group).not.toHaveClass(/open/);
  await expect(header).toHaveAttribute('aria-expanded', 'false');
  for (const target of hardwareTargets) {
    await expect(body.locator(`[data-target="${target}"]`)).toBeHidden();
  }
  // La flèche rouvre : tous les items redeviennent cliquables.
  await header.click();
  await expect(group).toHaveClass(/open/);
  await expect(header).toHaveAttribute('aria-expanded', 'true');
  for (const target of hardwareTargets) {
    await expect(body.locator(`[data-target="${target}"]`)).toBeVisible();
  }
});

test('locked modules expose their prerequisite and explain it in the terminal', async ({ page }) => {
  await openApp(page);
  const locked = page.locator('[data-target="m2"]');
  await expect(locked).toHaveAttribute('aria-disabled', 'true');
  await expect(locked).toContainText(/quiz précédent|verrouill/i);

  const initialUrl = page.url();
  const output = page.locator('#terminal-output');
  const lineCount = await output.locator('.term-line').count();
  // Le bouton reste volontairement accessible au clic pour expliquer le prérequis.
  await locked.dispatchEvent('click');
  const feedback = output.locator('.term-line').nth(lineCount);
  await expect(feedback).toHaveText(/Le module "m2" est verrouillé\. Complétez le quiz du module précédent d'abord\./);
  await expect(feedback).toHaveClass(/(^|\s)error-line(\s|$)/);
  await expect(feedback).not.toHaveText(/^error-line$/);
  await expect(page.locator('#section-m2')).not.toHaveClass(/active/);
  expect(await page.evaluate(() => currentSection)).toBe('home');
  expect(page.url()).toBe(initialUrl);
});

test('reduced motion preference is declared in CSS', async ({ page }) => {
  await openApp(page);
  const declared = await page.evaluate(() => [...document.styleSheets].some((sheet) => {
    try {
      return [...sheet.cssRules].some((rule) => String(rule.cssText || '').includes('prefers-reduced-motion'));
    } catch {
      return false;
    }
  }));
  expect(declared).toBe(true);
});

