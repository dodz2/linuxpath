import { test, expect } from '@playwright/test';
import { openApp } from './helpers.js';

test('hw1 is reachable from the start and renders its five lessons', async ({ page }) => {
  await openApp(page);
  const trackCards = page.locator('#track-picker .track-card');
  await expect(trackCards).toHaveCount(4);
  await expect(page.locator('#track-picker')).toContainText(/Lab & Tinker/);
  await page.evaluate(() => navigateTo('hw1'));
  await expect(page.locator('#section-hw1 .lesson-card')).toHaveCount(5);
  await expect(page.locator('#section-hw1 .exercise-card')).toHaveCount(2);
  await expect(page.locator('#quiz-hw1 .quiz-card')).toHaveCount(1);
});

test('hw4 is locked until hw1, hw2 and hw3 are fully completed', async ({ page }) => {
  await openApp(page);
  const locked = await page.evaluate(() => ({
    unlocked: state.unlockedModules.has('hw4'),
    hw1: state.unlockedModules.has('hw1'),
    hw2: state.unlockedModules.has('hw2'),
  }));
  expect(locked.hw1).toBe(true);
  expect(locked.hw2).toBe(false);
  expect(locked.unlocked).toBe(false);

  // terminer les trois modules en direct (refreshUnlocks recalcule)
  await page.evaluate(() => {
    state.lessonsDone = new Set(['hw1', 'hw2', 'hw3'].flatMap((moduleId) => LESSONS[moduleId].map((lesson) => lesson.id)));
    state.exercisesDone = new Set(['hw1', 'hw2', 'hw3'].flatMap((moduleId) => EXERCISES[moduleId].map((exercise) => exercise.id)));
    state.quizScores = { hw1: { lastScore: 5, bestScore: 5, passed: true }, hw2: { lastScore: 5, bestScore: 5, passed: true }, hw3: { lastScore: 5, bestScore: 5, passed: true } };
    refreshUnlocks();
    updateProgressUI();
  });
  const after = await page.evaluate(() => state.unlockedModules.has('hw4'));
  expect(after).toBe(true);
});

test('a new user needs the hw1 lessons and exercises as well as the quiz to unlock hw2', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => navigateTo('hw1'));
  const { answerQuiz } = await import('./helpers.js');
  await answerQuiz(page, 'hw1', 'correct');
  const result = await page.evaluate(() => ({
    passed: state.quizScores.hw1.passed === true || state.quizScores.hw1 >= 3,
    hw2: state.unlockedModules.has('hw2'),
    mastery: document.querySelector('#quiz-result-hw1')?.textContent.replace(/\s+/g, ' ').trim(),
  }));
  expect(result.passed).toBe(true);
  expect(result.hw2).toBe(false);
  expect(result.mastery).toContain('Terminez les leçons et exercices');
});

test('the main course chain still ends at m14 and never jumps into hardware', async ({ page }) => {
  await openApp(page);
  const next = await page.evaluate(() => ({
    m14Next: nextModuleId('m14'),
    m8Next: nextModuleId('m8'),
    hw1Next: nextModuleId('hw1'),
    hw2Next: nextModuleId('hw2'),
    hw3Next: nextModuleId('hw3'),
    hw4Next: nextModuleId('hw4'),
  }));
  expect(next.m14Next).toBeNull();
  expect(next.m8Next).toBe('m9');
  // La chenille Lab & Tinker suit uniquement en interne : hw1 -> hw2 -> hw3 -> hw4 -> fin.
  expect(next.hw1Next).toBe('hw2');
  expect(next.hw2Next).toBe('hw3');
  expect(next.hw3Next).toBe('hw4');
  expect(next.hw4Next).toBeNull();
});
