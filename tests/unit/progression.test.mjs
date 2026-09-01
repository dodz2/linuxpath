import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  activityBelongsToModule,
  computeModuleProgress,
  isModuleComplete,
  migrateProgress,
  nextModuleId,
  normalizeQuizRecord,
  recordQuizAttempt,
} from '../../scripts/lib/progress-model.mjs';

const v1 = JSON.parse(await readFile('tests/fixtures/progress-v1.json', 'utf8'));
const v2 = JSON.parse(await readFile('tests/fixtures/progress-v2.json', 'utf8'));
const modules = JSON.parse(await readFile('data/modules.json', 'utf8')).modules;

test('m10 ids are not counted as m1 activities', () => {
  assert.equal(activityBelongsToModule('m1-l1', 'm1'), true);
  assert.equal(activityBelongsToModule('m10-l1', 'm1'), false);
  assert.equal(activityBelongsToModule('m1', 'm1'), true);
  assert.equal(activityBelongsToModule('m10', 'm1'), false);
});

test('a 0/5 attempt is recorded but does not complete the module', () => {
  const quiz = recordQuizAttempt(null, 0);
  const progress = computeModuleProgress({
    lessonTotal: 4,
    exerciseTotal: 3,
    lessonsDone: 4,
    exercisesDone: 3,
    quizValue: quiz,
    unlocked: true,
  });
  assert.equal(quiz.passed, false);
  assert.equal(quiz.attempts, 1);
  assert.equal(progress.done, 7);
  assert.equal(progress.total, 8);
  assert.equal(progress.state, 'in_progress');
});

test('a 3/5 pass completes the module and later lower scores keep the best', () => {
  const passed = recordQuizAttempt(null, 3);
  const retry = recordQuizAttempt(passed, 1);
  const progress = computeModuleProgress({
    lessonTotal: 4,
    exerciseTotal: 3,
    lessonsDone: 4,
    exercisesDone: 3,
    quizValue: retry,
    unlocked: true,
  });
  assert.equal(retry.bestScore, 3);
  assert.equal(retry.lastScore, 1);
  assert.equal(retry.passed, true);
  assert.equal(retry.attempts, 2);
  assert.equal(progress.state, 'passed');
  assert.equal(progress.pct, 100);
});

test('a forged passed flag cannot replace a passing quiz score', () => {
  const forged = normalizeQuizRecord({ lastScore: 0, bestScore: 0, passed: true });
  assert.equal(forged.passed, false);
  assert.equal(isModuleComplete({
    lessonIds: ['m12-l1'],
    exerciseIds: ['m12-e1'],
    lessonsDone: ['m12-l1'],
    exercisesDone: ['m12-e1'],
    quizValue: forged,
  }), false);
});

test('a module unlock prerequisite requires lessons, exercises and a passed quiz', () => {
  const base = {
    lessonIds: ['m12-l1', 'm12-l2'],
    exerciseIds: ['m12-e1'],
    lessonsDone: ['m12-l1', 'm12-l2'],
    exercisesDone: ['m12-e1'],
    quizValue: recordQuizAttempt(null, 3),
  };
  assert.equal(isModuleComplete(base), true);
  assert.equal(isModuleComplete({ ...base, lessonsDone: ['m12-l1'] }), false);
  assert.equal(isModuleComplete({ ...base, exercisesDone: [] }), false);
  assert.equal(isModuleComplete({ ...base, quizValue: recordQuizAttempt(null, 2) }), false);
});

test('m8 is followed by m9 and m14 has no successor', () => {
  assert.equal(nextModuleId('m8', modules), 'm9');
  assert.equal(nextModuleId('m14', modules), null);
});

test('a v1 fixture migrates to v3 without losing scores or unlocks', () => {
  const migrated = migrateProgress(v1);
  assert.equal(migrated._format, 'linuxpath-progress-v3');
  assert.deepEqual(migrated.lessonsDone, ['m1-l1']);
  assert.deepEqual(migrated.exercisesDone, ['m1-e1']);
  assert.equal(migrated.quiz.m1.lastScore, 3);
  assert.equal(migrated.quiz.m1.passed, true);
  assert.equal(migrated.unlockedModules.includes('m2'), true);
  assert.deepEqual(migrated.ctfSolved, ['ctf-01']);
});

test('a v2 fixture is accepted as-is after normalization', () => {
  const migrated = migrateProgress(v2);
  assert.equal(migrated.quiz.m1.bestScore, 4);
  assert.equal(migrated.quiz.m1.lastScore, 3);
  assert.equal(migrated.quiz.m1.passed, true);
});

test('m12 pass status comes from the quiz threshold', () => {
  const progress = {
    _format: 'linuxpath-progress-v3',
    lessonsDone: [],
    exercisesDone: [],
    quiz: { m12: { lastScore: 3, bestScore: 3, attempts: 1, passed: true } },
  };
  const policies = { m12: { maxScore: 7, passScore: 4 } };

  assert.equal(migrateProgress(progress, policies).quiz.m12.passed, false);
  progress.quiz.m12.lastScore = 4;
  progress.quiz.m12.bestScore = 4;
  assert.equal(migrateProgress(progress, policies).quiz.m12.passed, true);
});

test('v1 and v2 invalidate only the replaced M14-E1 exercise', () => {
  const migrated = migrateProgress({
    _format: 'linuxpath-progress-v2',
    lessonsDone: [],
    exercisesDone: ['m12-e1', 'm13-e3', 'm14-e1', 'm14-e2', 'm14-e3'],
    quiz: {},
  });
  assert.deepEqual(migrated.exercisesDone, ['m12-e1', 'm13-e3', 'm14-e2', 'm14-e3']);
});

test('hostile string scores are dropped during migration', () => {
  const migrated = migrateProgress({
    _format: 'linuxpath-progress-v1',
    quizScores: { m1: '<img src=x onerror="alert(1)">' },
  });
  assert.equal(migrated.quiz.m1, undefined);
});
