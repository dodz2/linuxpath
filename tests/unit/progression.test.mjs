import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  activityBelongsToModule,
  computeModuleProgress,
  migrateProgress,
  nextModuleId,
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

test('m8 is followed by m9 and m14 has no successor', () => {
  assert.equal(nextModuleId('m8', modules), 'm9');
  assert.equal(nextModuleId('m14', modules), null);
});

test('a v1 fixture migrates to v2 without losing scores or unlocks', () => {
  const migrated = migrateProgress(v1);
  assert.equal(migrated._format, 'linuxpath-progress-v2');
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

test('hostile string scores are dropped during migration', () => {
  const migrated = migrateProgress({
    _format: 'linuxpath-progress-v1',
    quizScores: { m1: '<img src=x onerror="alert(1)">' },
  });
  assert.equal(migrated.quiz.m1, undefined);
});
