import { test, expect } from '@playwright/test';
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
