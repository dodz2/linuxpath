import { test, expect } from '@playwright/test';
import { answerQuiz, openApp } from './helpers.js';

test('a 2/5 quiz is recorded but does not complete the module', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => {
    state.lessonsDone = new Set(LESSONS.m1.map((lesson) => lesson.id));
    state.exercisesDone = new Set(EXERCISES.m1.map((exercise) => exercise.id));
    navigateTo('m1');
  });
  await answerQuiz(page, 'm1', 2);
  const result = await page.evaluate(() => {
    const quiz = state.quizScores.m1;
    return {
      score: quiz && typeof quiz === 'object' ? quiz.lastScore : quiz,
      passed: quiz && typeof quiz === 'object' ? quiz.passed : quiz >= 3,
      module: getModuleProgress('m1'),
      m2Unlocked: state.unlockedModules.has('m2'),
    };
  });
  expect(result.score).toBe(2);
  expect(result.passed).toBe(false);
  expect(result.module.done).toBeLessThan(result.module.total);
  expect(result.m2Unlocked).toBe(false);
});

test('a perfect 5/5 quiz reports mastered and unlocks the next module', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => {
    state.lessonsDone = new Set(LESSONS.m1.map((lesson) => lesson.id));
    state.exercisesDone = new Set(EXERCISES.m1.map((exercise) => exercise.id));
    navigateTo('m1');
  });
  await answerQuiz(page, 'm1', 5);
  const result = await page.evaluate(() => {
    const quiz = state.quizScores.m1;
    return {
      score: quiz && typeof quiz === 'object' ? quiz.lastScore : quiz,
      passed: quiz && typeof quiz === 'object' ? quiz.passed : quiz >= 5,
      resultText: document.querySelector('#quiz-result-m1')?.textContent.replace(/\s+/g, ' ').trim(),
      m2Unlocked: state.unlockedModules.has('m2'),
    };
  });
  expect(result.score).toBe(5);
  expect(result.passed).toBe(true);
  expect(result.m2Unlocked).toBe(true);
  expect(result.resultText).toContain('Maîtrisé');
});

test('the cheatsheet lists all commands, filters by category and searches', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => navigateTo('cheatsheet'));
  await page.waitForFunction(() => document.querySelectorAll('.cheatsheet-cmd-card').length > 0);
  const totalCards = await page.locator('.cheatsheet-cmd-card').count();
  expect(totalCards).toBe(118);

  // filter by the first category (other than all) — scoped to the cheatsheet filters
    const firstCat = page.locator('#cheatsheet-filters .cheatsheet-filter-btn:not([data-cat="all"])').first();
  const catName = await firstCat.getAttribute('data-cat');
  await firstCat.click();
  const filtered = await page.locator('.cheatsheet-cmd-card').count();
  expect(filtered).toBeGreaterThan(0);
  expect(filtered).toBeLessThan(totalCards);

  // search narrows the results
  const search = page.locator('#cheatsheet-search');
  await search.fill('ls');
  await page.waitForTimeout(150);
  const searched = await page.locator('.cheatsheet-cmd-card').count();
  expect(searched).toBeGreaterThanOrEqual(1);
  expect(searched).toBeLessThanOrEqual(filtered);
  // reset category then search still works on the whole set
  await page.locator('#cheatsheet-filters .cheatsheet-filter-btn[data-cat="all"]').click();
  await page.waitForTimeout(150);
  const afterReset = await page.locator('.cheatsheet-cmd-card').count();
  expect(afterReset).toBeGreaterThanOrEqual(searched);
});

test('the glossary lists 74 terms, filters by letter and searches', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => navigateTo('glossary'));
  await page.waitForFunction(() => document.querySelectorAll('.glossary-term-card').length > 0);
  const totalTerms = await page.locator('.glossary-term-card').count();
  expect(totalTerms).toBe(74);

  // filter by first letter present in the alpha nav
  const letterBtn = page.locator('.glossary-alpha-btn:not([data-letter="all"])').first();
  await letterBtn.click();
  const letter = await letterBtn.getAttribute('data-letter');
  const letterCount = await page.locator('.glossary-term-card').count();
  expect(letterCount).toBeGreaterThan(0);
  expect(letterCount).toBeLessThanOrEqual(totalTerms);

  // search runs globally (it resets the letter filter) and narrows the results
  const firstTerm = (await page.locator('.glossary-term-name').first().textContent())?.trim() || '';
  expect(firstTerm.length).toBeGreaterThan(1);
  const search = page.locator('#glossary-search');
  await search.fill(firstTerm);
  await page.waitForTimeout(150);
  const searched = await page.locator('.glossary-term-card').count();
  expect(searched).toBeGreaterThanOrEqual(1);
  expect(searched).toBeLessThan(totalTerms);
});