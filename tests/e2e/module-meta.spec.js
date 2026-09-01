import { test, expect } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { openApp } from './helpers.js';

test('each published module header announces the real lesson, exercise and quiz counts', async ({ page }) => {
  await openApp(page);
  const report = await page.evaluate(() => {
    const published = getPublishedModuleIds();
    // un objectif : vérifier le chemin réel — on déverrouille tout puis on
    // NAVIGUE vers chaque module (navigateTo → ensureModuleRendered → renderModuleMeta)
    published.forEach((id) => state.unlockedModules.add(id));
    return published.map((id) => {
      navigateTo(id);
      const counts = getModuleCounts(id);
      const questions = (QUIZZES[id] && QUIZZES[id].questions) ? QUIZZES[id].questions.length : 0;
      const items = [...document.querySelectorAll('#section-' + id + ' .module-header .module-meta-item')]
        .map((el) => el.textContent.replace(/\s+/g, ' ').trim());
      const text = items.join(' | ');
      return {
        id,
        lessons: counts.lessons,
        exercises: counts.exercises,
        questions,
        text,
        active: document.getElementById('section-' + id)?.classList.contains('active') || false,
        lessonsMatch: new RegExp('📚\\s*' + counts.lessons + '\\s+leçon').test(text),
        exercisesMatch: new RegExp('⚡\\s*' + counts.exercises + '\\s+exercice').test(text),
        quizMatch: new RegExp('❓\\s*Quiz\\s+' + questions + '\\s+question').test(text),
      };
    });
  });
  // chaque module est bien devenu la section active (navigateTo a fonctionné)
  const inactive = report.filter((row) => !row.active);
  expect(inactive, JSON.stringify(inactive, null, 2)).toEqual([]);
  const mismatches = report.filter((row) => !row.lessonsMatch || !row.exercisesMatch || !row.quizMatch);
  expect(mismatches, JSON.stringify(mismatches, null, 2)).toEqual([]);
  expect(report.length).toBeGreaterThanOrEqual(18);
});

test('cyber lessons render checked HTTPS references safely', async ({ page }) => {
  await openApp(page);
  const result = await page.evaluate(() => {
    state.unlockedModules.add('m12');
    navigateTo('m12');
    const card = document.querySelector('#lesson-card-m12-l1');
    if (!card.classList.contains('open')) toggleLesson('m12-l1');
    const links = [...card.querySelectorAll('.lesson-sources a')];
    return {
      count: links.length,
      text: card.querySelector('.lesson-sources')?.textContent.replace(/\s+/g, ' ').trim(),
      valid: links.every((link) => link.href.startsWith('https://') && link.target === '_blank' && link.rel === 'noopener noreferrer'),
    };
  });
  expect(result.count).toBeGreaterThanOrEqual(2);
  expect(result.valid).toBe(true);
  expect(result.text).toContain('vérifié le 2026-08-31');
});

test('all lessons render their HTTPS references as safe links without fetching them', async ({ page }) => {
  const lessons = JSON.parse(await readFile('data/lessons.json', 'utf8'));
  const sourceUrls = new Set(Object.values(lessons).flat()
    .flatMap((lesson) => lesson.sources || [])
    .filter((source) => source && typeof source === 'object')
    .map((source) => new URL(source.url).href));
  const fetchedSources = [];
  page.on('request', (request) => {
    if (sourceUrls.has(request.url())) fetchedSources.push(request.url());
  });

  await openApp(page);
  const report = await page.evaluate(() => {
    const rows = [];
    const published = getPublishedModuleIds();
    published.forEach((id) => state.unlockedModules.add(id));
    for (const moduleId of published) {
      navigateTo(moduleId);
      for (const lesson of LESSONS[moduleId] || []) {
        const card = document.getElementById(`lesson-card-${lesson.id}`);
        const sources = lesson.sources || [];
        const links = [...(card?.querySelectorAll('.lesson-sources a') || [])];
        rows.push({
          id: lesson.id,
          sources: sources.length,
          links: links.length,
          matching: links.every((link, index) => link.href === new URL(sources[index].url).href),
          valid: links.every((link) => link.href.startsWith('https://')
            && link.target === '_blank'
            && link.rel.split(/\s+/).includes('noopener')),
        });
      }
    }
    return rows;
  });

  expect(report).toHaveLength(99);
  expect(report.reduce((total, row) => total + row.sources, 0)).toBe(129);
  const invalid = report.filter((row) => row.sources < 1 || row.links !== row.sources || !row.matching || !row.valid);
  expect(invalid, JSON.stringify(invalid, null, 2)).toEqual([]);
  expect(fetchedSources).toEqual([]);
});

test('m11-l5 preserves its OpenSSL input redirections in DOM, clipboard and shell parsing', async ({ page, context }) => {
  await openApp(page);
  const commands = await page.evaluate(() => {
    state.unlockedModules.add('m11');
    navigateTo('m11');
    toggleLesson('m11-l5');
    return [...document.querySelectorAll('#lesson-card-m11-l5 .cmd')]
      .map((command) => command.textContent.trim());
  });
  const expected = 'openssl s_client -connect example.com:443 -servername example.com </dev/null 2>/dev/null | openssl x509 -noout -text';
  expect(commands[0]).toBe(expected);
  expect(commands[2]).toBe('openssl s_client -connect example.com:443 -showcerts </dev/null');

  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const firstCommand = page.locator('#lesson-card-m11-l5 .cmd').first();
  await firstCommand.selectText();
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+C' : 'Control+C');
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toBe(expected);

  const binDir = await mkdtemp(path.join(tmpdir(), 'linuxpath-openssl-'));
  const argsLog = path.join(binDir, 'openssl-args.log');
  try {
    await writeFile(path.join(binDir, 'openssl'), '#!/bin/sh\nprintf "%s\\n" "$*" >> "$OPENSSL_ARGS_LOG"\n', { mode: 0o755 });
    const result = spawnSync('/bin/sh', ['-c', copied], {
      encoding: 'utf8',
      env: { ...process.env, OPENSSL_ARGS_LOG: argsLog, PATH: binDir },
    });
    expect(result.status, result.stderr).toBe(0);
    const invocations = (await readFile(argsLog, 'utf8')).trim().split('\n');
    expect(invocations).toContain('s_client -connect example.com:443 -servername example.com');
    expect(invocations.some((args) => args.includes('/dev/null'))).toBe(false);
  } finally {
    await rm(binDir, { recursive: true, force: true });
  }
});
