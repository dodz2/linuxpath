import { test, expect } from '@playwright/test';
import { answerQuiz, openApp } from './helpers.js';

test('a failed 0/5 quiz is attempted but never completed', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => {
    state.lessonsDone = new Set(LESSONS.m1.map((lesson) => lesson.id));
    state.exercisesDone = new Set(EXERCISES.m1.map((exercise) => exercise.id));
    navigateTo('m1');
  });
  await answerQuiz(page, 'm1', 'wrong');
  await page.evaluate(() => navigateTo('roadmap'));

  const result = await page.evaluate(() => {
    const firstNode = document.querySelectorAll('.roadmap-node')[0];
    const activityCount = LESSONS.m1.length + EXERCISES.m1.length;
    const quiz = state.quizScores.m1;
    return {
      score: quiz && typeof quiz === 'object' ? quiz.lastScore : quiz,
      passed: quiz && typeof quiz === 'object' ? quiz.passed : quiz >= 3,
      module: getModuleProgress('m1'),
      expected: {
        done: activityCount,
        total: activityCount + 1,
        pct: Math.round(activityCount / (activityCount + 1) * 100),
      },
      nodeClass: firstNode?.className,
      nodeText: firstNode?.textContent.replace(/\s+/g, ' ').trim(),
      roadmapSummary: document.querySelector('#roadmap-summary')?.textContent.replace(/\s+/g, ' ').trim(),
      expectedCompletedModules: `0/${getPublishedModuleIds().length}`,
    };
  });
  expect(result.score).toBe(0);
  expect(result.passed).toBe(false);
  expect(result.module.done).toBe(result.expected.done);
  expect(result.module.total).toBe(result.expected.total);
  expect(result.module.pct).toBe(result.expected.pct);
  expect(result.nodeClass).not.toContain('completed');
  expect(result.nodeText).toContain('0/1 quiz');
  expect(result.roadmapSummary).toContain(result.expectedCompletedModules);
});

test('a 3/5 quiz completes a module whose lessons and exercises are done', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => {
    state.lessonsDone = new Set(LESSONS.m1.map((lesson) => lesson.id));
    state.exercisesDone = new Set(EXERCISES.m1.map((exercise) => exercise.id));
    navigateTo('m1');
  });
  await answerQuiz(page, 'm1', 3);
  const result = await page.evaluate(() => {
    const quiz = state.quizScores.m1;
    return {
      score: quiz && typeof quiz === 'object' ? quiz.lastScore : quiz,
      passed: quiz && typeof quiz === 'object' ? quiz.passed : quiz >= 3,
      module: getModuleProgress('m1'),
      m2Unlocked: state.unlockedModules.has('m2'),
    };
  });
  expect(result.score).toBe(3);
  expect(result.passed).toBe(true);
  expect(result.module.done).toBe(result.module.total);
  expect(result.module.pct).toBe(100);
  expect(result.m2Unlocked).toBe(true);
});

test('a passed quiz alone does not unlock the dependent cyber module', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => navigateTo('m12'));
  await answerQuiz(page, 'm12', 3);
  const result = await page.evaluate(() => ({
    m13Unlocked: state.unlockedModules.has('m13'),
    text: document.querySelector('#quiz-result-m12')?.textContent.replace(/\s+/g, ' ').trim(),
    nextButtons: [...document.querySelectorAll('#quiz-result-m12 button')].filter((button) => button.textContent.includes('Module suivant')).length,
  }));
  expect(result.m13Unlocked).toBe(false);
  expect(result.text).toContain('Terminez les leçons et exercices');
  expect(result.nextButtons).toBe(0);
});

test('a fully completed cyber module unlocks its dependent module', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => {
    state.lessonsDone = new Set(LESSONS.m12.map((lesson) => lesson.id));
    state.exercisesDone = new Set(EXERCISES.m12.map((exercise) => exercise.id));
    navigateTo('m12');
  });
  await answerQuiz(page, 'm12', 3);
  const result = await page.evaluate(() => ({
    m13Unlocked: state.unlockedModules.has('m13'),
    text: document.querySelector('#quiz-result-m12')?.textContent.replace(/\s+/g, ' ').trim(),
    nextButtons: [...document.querySelectorAll('#quiz-result-m12 button')].filter((button) => button.textContent.includes('Module suivant')).length,
  }));
  expect(result.m13Unlocked).toBe(true);
  expect(result.text).toContain('Module suivant déverrouillé');
  expect(result.nextButtons).toBe(1);
});

test('Linux progress counts m1 exactly and does not confuse m10 through m14', async ({ page }) => {
  await openApp(page);
  const badge = await page.evaluate(async () => {
    state.lessonsDone = new Set();
    state.exercisesDone = new Set();
    state.quizScores = { m10: 5, m11: 5, m12: 5, m13: 5, m14: 5 };
    updateProgressUI();
    return document.querySelector('#group-modules-badge')?.textContent.trim();
  });
  expect(badge).toBe('0%');
});

test('passing m8 offers a real transition to m9', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => {
    state.lessonsDone = new Set(LESSONS.m8.map((lesson) => lesson.id));
    state.exercisesDone = new Set(EXERCISES.m8.map((exercise) => exercise.id));
    state.unlockedModules.add('m8');
    navigateTo('m8');
  });
  await answerQuiz(page, 'm8', 'correct');
  const result = await page.evaluate(() => ({
    m9Unlocked: state.unlockedModules.has('m9'),
    actionLabels: [...document.querySelectorAll('#quiz-result-m8 button')].map((button) => button.textContent.trim()),
  }));
  expect(result.m9Unlocked).toBe(true);
  expect(result.actionLabels).toContain('Module suivant →');
});

test('passing m14 ends the course without a self-referential next module', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => {
    state.unlockedModules.add('m14');
    navigateTo('m14');
  });
  await answerQuiz(page, 'm14', 'correct');
  const result = await page.evaluate(() => ({
    nextModule: getNextMod('m14'),
    resultText: document.querySelector('#quiz-result-m14')?.textContent.replace(/\s+/g, ' ').trim(),
    nextButtons: [...document.querySelectorAll('#quiz-result-m14 button')].filter((button) => button.textContent.includes('Module suivant')).length,
  }));
  expect(result.nextModule).toBeNull();
  expect(result.resultText).not.toContain('Module suivant déverrouillé');
  expect(result.resultText).not.toContain('Parcours terminé');
  expect(result.nextButtons).toBe(0);
});

test('an imported stale unlock cannot bypass incomplete prerequisites', async ({ page }) => {
  await openApp(page);
  const result = await page.evaluate(() => {
    applyImportedProgress({
      _format: 'linuxpath-progress-v2',
      lessonsDone: [],
      exercisesDone: [],
      quiz: { m12: { lastScore: 5, bestScore: 5, passed: true } },
      unlockedModules: ['m12', 'm13'],
      ctfSolved: [],
      ctfHints: {},
      ctfHow: {},
    });
    return { m12: state.unlockedModules.has('m12'), m13: state.unlockedModules.has('m13') };
  });
  expect(result.m12).toBe(true);
  expect(result.m13).toBe(false);
});

test('an imported passed flag cannot replace an unsuccessful quiz score', async ({ page }) => {
  await openApp(page);
  const result = await page.evaluate(() => {
    applyImportedProgress({
      _format: 'linuxpath-progress-v2',
      lessonsDone: LESSONS.m12.map((lesson) => lesson.id),
      exercisesDone: EXERCISES.m12.map((exercise) => exercise.id),
      quiz: { m12: { lastScore: 0, bestScore: 0, passed: true } },
      unlockedModules: ['m12', 'm13'],
      ctfSolved: [],
      ctfHints: {},
      ctfHow: {},
    });
    return { quiz: state.quizScores.m12, m13: state.unlockedModules.has('m13') };
  });
  expect(result.quiz.passed).toBe(false);
  expect(result.m13).toBe(false);
});

test('an imported unknown activity cannot inflate overall progress', async ({ page }) => {
  await openApp(page);
  const result = await page.evaluate(() => {
    const bogusLessons = Array.from({ length: 200 }, (_, index) => `m12-lbogus-${index}`);
    const bogusExercises = Array.from({ length: 200 }, (_, index) => `m12-ebogus-${index}`);
    applyImportedProgress({
      _format: 'linuxpath-progress-v2',
      lessonsDone: bogusLessons,
      exercisesDone: bogusExercises,
      quiz: { unknown: { lastScore: 5, bestScore: 5, passed: true } },
      unlockedModules: ['m12', 'unknown'],
      ctfSolved: [],
      ctfHints: {},
      ctfHow: {},
    });
    return {
      progress: getProgress(),
      lessonsDone: state.lessonsDone.size,
      exercisesDone: state.exercisesDone.size,
      quizModules: Object.keys(state.quizScores),
    };
  });
  expect(result.progress.done).toBe(0);
  expect(result.progress.pct).toBe(0);
  expect(result.lessonsDone).toBe(0);
  expect(result.exercisesDone).toBe(0);
  expect(result.quizModules).toEqual([]);
});

test('a fully completed curriculum reports 100 percent from real data totals', async ({ page }) => {
  await openApp(page);
  const result = await page.evaluate(() => {
    state.lessonsDone = new Set(Object.values(LESSONS).flat().map((lesson) => lesson.id));
    state.exercisesDone = new Set(Object.values(EXERCISES).flat().map((exercise) => exercise.id));
    state.quizScores = Object.fromEntries(Object.keys(QUIZZES).map((moduleId) => [moduleId, 5]));
    updateProgressUI();
    return {
      progress: getProgress(),
      topbar: document.querySelector('#topbar-progress-label')?.textContent.trim(),
      linuxBadge: document.querySelector('#group-modules-badge')?.textContent.trim(),
      networkBadge: document.querySelector('#group-network-badge')?.textContent.trim(),
      securityBadge: document.querySelector('#group-offsec-badge')?.textContent.trim(),
      hardwareBadge: document.querySelector('#group-hardware-badge')?.textContent.trim(),
    };
  });
  expect(result.progress.done).toBe(157);
  expect(result.progress.total).toBe(157);
  expect(result.progress.pct).toBe(100);
  expect(result.topbar).toBe('157 / 157 complétés');
  expect(result.linuxBadge).toBe('100%');
  expect(result.networkBadge).toBe('100%');
  expect(result.securityBadge).toBe('100%');
  expect(result.hardwareBadge).toBe('100%');
});

test('a later worse quiz keeps the best score and the pass', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => {
    state.lessonsDone = new Set(LESSONS.m1.map((lesson) => lesson.id));
    state.exercisesDone = new Set(EXERCISES.m1.map((exercise) => exercise.id));
    navigateTo('m1');
  });
  await answerQuiz(page, 'm1', 4);
  await answerQuiz(page, 'm1', 1);
  const quiz = await page.evaluate(() => state.quizScores.m1);
  expect(quiz.bestScore).toBe(4);
  expect(quiz.lastScore).toBe(1);
  expect(quiz.passed).toBe(true);
  expect(quiz.attempts).toBe(2);
});

test('a version-1 save is migrated in memory without losing the passed quiz', async ({ page }) => {
  await openApp(page);
  const migrated = await page.evaluate(async () => {
    const payload = {
      _format: 'linuxpath-progress-v1',
      lessonsDone: ['m1-l1'],
      exercisesDone: ['m1-e1'],
      quizScores: { m1: 3 },
      unlockedModules: ['m1', 'm2'],
      ctfSolved: ['ctf-01'],
      ctfHints: {},
    };
    applyImportedProgress(payload);
    return {
      format: exportProgressData()._format,
      quiz: state.quizScores.m1,
      lessons: [...state.lessonsDone],
    };
  });
  expect(migrated.format).toBe('linuxpath-progress-v3');
  expect(migrated.quiz.passed).toBe(true);
  expect(migrated.quiz.lastScore).toBe(3);
  expect(migrated.lessons).toContain('m1-l1');
});

test('a completed lesson can be unmarked and a module can be reset', async ({ page }) => {
  await openApp(page);
  const result = await page.evaluate(async () => {
    const lessonId = LESSONS.m1[0].id;
    await markLessonDone(lessonId);
    const afterMark = state.lessonsDone.has(lessonId);
    await markLessonDone(lessonId);
    const afterUnmark = state.lessonsDone.has(lessonId);
    state.quizScores.m1 = recordQuizAttempt(null, 4);
    resetModuleProgress('m1');
    return {
      afterMark,
      afterUnmark,
      quizAfterReset: state.quizScores.m1,
    };
  });
  expect(result.afterMark).toBe(true);
  expect(result.afterUnmark).toBe(false);
  expect(result.quizAfterReset).toBeUndefined();
});

test('a version-2 save invalidates only the replaced M14-E1 exercise', async ({ page }) => {
  await openApp(page);
  const migrated = await page.evaluate(() => {
    applyImportedProgress({
      _format: 'linuxpath-progress-v2',
      lessonsDone: [],
      exercisesDone: ['m12-e1', 'm14-e1', 'm14-e2', 'm14-e3'],
      quiz: {}, unlockedModules: ['m12'], ctfSolved: [], ctfHints: {}, ctfHow: {},
    });
    return { format: exportProgressData()._format, exercises: [...state.exercisesDone] };
  });
  expect(migrated.format).toBe('linuxpath-progress-v3');
  expect(migrated.exercises).toEqual(['m12-e1', 'm14-e2', 'm14-e3']);
});

test('a complete reset clears CTF completion metadata too', async ({ page }) => {
  await openApp(page);
  const result = await page.evaluate(async () => {
    ctfState.solved = new Set(['ctf-01']);
    ctfState.hints = { 'ctf-01': 1 };
    ctfState.how = { 'ctf-01': 'with_help' };
    await resetState();
    return exportProgressData();
  });
  expect(result.ctfSolved).toEqual([]);
  expect(result.ctfHints).toEqual({});
  expect(result.ctfHow).toEqual({});
});
