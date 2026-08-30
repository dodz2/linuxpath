import test from 'node:test';
import assert from 'node:assert/strict';
import { loadJson } from '../../scripts/lib/content-validation.mjs';
import { evaluateValidator } from '../../scripts/lib/exercise-validators.mjs';
import { pedagogicalCommands } from '../../scripts/lib/pedagogical-commands.mjs';
import { runShell } from '../../scripts/lib/shell-exec.mjs';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function allExercises(exercises) {
  return Object.entries(exercises).flatMap(([moduleId, list]) => list.map((exercise) => ({ moduleId, exercise })));
}

function runCanonical(vfsSource, command) {
  return runShell({
    vfs: clone(vfsSource),
    cwd: '/home/user',
    command,
    extraCommands: pedagogicalCommands,
  });
}

test('every exercise has a declarative validator and a canonical answer', async () => {
  const exercises = await loadJson('data/exercises.json');
  const rows = allExercises(exercises);
  assert.equal(rows.length, 38);
  for (const { exercise } of rows) {
    assert.ok(exercise.validator && exercise.validator.type, `${exercise.id} missing validator`);
    assert.ok(Array.isArray(exercise.accepted) && exercise.accepted[0], `${exercise.id} missing accepted[0]`);
    assert.equal(exercise.accepted.includes("echo $USER"), false, `${exercise.id} still accepts echo $USER`);
    assert.equal(exercise.accepted.includes("echo $LOGNAME"), false, `${exercise.id} still accepts echo $LOGNAME`);
    assert.equal(exercise.accepted.includes("echo '$HOME'"), false, `${exercise.id} still accepts quoted $HOME`);
  }
});

test('the 38 canonical answers produce exit 0 and satisfy their effect oracle', async () => {
  const [exercises, vfs] = await Promise.all([loadJson('data/exercises.json'), loadJson('data/vfs.json')]);
  const failures = [];
  for (const { exercise } of allExercises(exercises)) {
    const result = runCanonical(vfs, exercise.accepted[0]);
    const verdict = evaluateValidator(exercise.validator, { ...result, vfs: result.cwd ? result : result });
    const ctx = { ...result, vfs: runShell({ vfs: clone(vfs), cwd: '/home/user', command: exercise.accepted[0], extraCommands: pedagogicalCommands }).cwd ? null : null };
    void ctx;
    const isolatedVfs = clone(vfs);
    const isolated = runShell({ vfs: isolatedVfs, cwd: '/home/user', command: exercise.accepted[0], extraCommands: pedagogicalCommands });
    const ok = evaluateValidator(exercise.validator, { ...isolated, vfs: isolatedVfs });
    if (isolated.exitCode !== 0 || !ok.ok) {
      failures.push({ id: exercise.id, command: exercise.accepted[0], exitCode: isolated.exitCode, stderr: isolated.stderr, reason: ok.reason, stdout: isolated.stdout });
    }
  }
  assert.deepEqual(failures, []);
});

test('no exercise can succeed when exitCode is not zero', async () => {
  const exercises = await loadJson('data/exercises.json');
  const vfs = await loadJson('data/vfs.json');
  const failures = [];
  for (const { exercise } of allExercises(exercises)) {
    const isolatedVfs = clone(vfs);
    const result = { exitCode: 1, stdout: ['fake success'], stderr: ['boom'], cwd: '/home/user', command: 'false', vfs: isolatedVfs };
    const verdict = evaluateValidator(exercise.validator, result);
    if (verdict.ok) failures.push(exercise.id);
  }
  assert.deepEqual(failures, []);
});

test('each exercise rejects a command that does not produce the required effect', async () => {
  const [exercises, vfs] = await Promise.all([loadJson('data/exercises.json'), loadJson('data/vfs.json')]);
  const failures = [];
  for (const { exercise } of allExercises(exercises)) {
    const isolatedVfs = clone(vfs);
    const isolated = runShell({ vfs: isolatedVfs, cwd: '/home/user', command: 'echo NOT_THE_EXERCISE', extraCommands: pedagogicalCommands });
    const verdict = evaluateValidator(exercise.validator, { ...isolated, vfs: isolatedVfs });
    if (verdict.ok) failures.push(exercise.id);
  }
  assert.deepEqual(failures, []);
});

test('mkdir -v projets satisfies the m1-e1 effect oracle', async () => {
  const [exercises, vfs] = await Promise.all([loadJson('data/exercises.json'), loadJson('data/vfs.json')]);
  const exercise = exercises.m1.find((entry) => entry.id === 'm1-e1');
  assert.ok(exercise.accepted.includes('mkdir -v projets'));
  const isolatedVfs = clone(vfs);
  assert.equal(Boolean(isolatedVfs['/home/user/projets']), false);
  const isolated = runShell({ vfs: isolatedVfs, cwd: '/home/user', command: 'mkdir -v projets', extraCommands: pedagogicalCommands });
  const verdict = evaluateValidator(exercise.validator, { ...isolated, vfs: isolatedVfs });
  assert.equal(isolated.exitCode, 0);
  assert.equal(verdict.ok, true, verdict.reason);
});
