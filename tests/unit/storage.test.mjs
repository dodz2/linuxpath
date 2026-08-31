import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateProgressImport } from '../../scripts/lib/progress-model.mjs';
import { loadJson } from '../../scripts/lib/content-validation.mjs';

async function catalog() {
  const [lessons, exercises, modules, ctf] = await Promise.all([
    loadJson('data/lessons.json'),
    loadJson('data/exercises.json'),
    loadJson('data/modules.json'),
    loadJson('data/ctf.json'),
  ]);
  return {
    lessonIds: Object.values(lessons).flat().map((entry) => entry.id),
    exerciseIds: Object.values(exercises).flat().map((entry) => entry.id),
    moduleIds: [...modules.modules.map((entry) => entry.id), 'sandbox'],
    ctfIds: ctf.challenges.map((entry) => entry.id),
  };
}

test('a valid v1 fixture is accepted and rebuilt as v3', async () => {
  const raw = await readFile('tests/fixtures/progress-v1.json', 'utf8');
  const result = validateProgressImport(raw, await catalog());
  assert.equal(result.ok, true);
  assert.equal(result.data._format, 'linuxpath-progress-v3');
  assert.equal(result.data.quiz.m1.lastScore, 3);
  assert.match(result.preview, /1 leçon/);
});

test('a hostile XSS payload is rejected', async () => {
  const raw = await readFile('tests/fixtures/progress-malicious.json', 'utf8');
  const result = validateProgressImport(raw, await catalog());
  assert.equal(result.ok, false);
  assert.equal(result.reason.includes('score'), true);
});

test('unknown ids, oversized files and prototype keys are rejected', async () => {
  const ids = await catalog();
  assert.equal(validateProgressImport(JSON.stringify({
    _format: 'linuxpath-progress-v2',
    lessonsDone: ['m99-l1'],
    exercisesDone: [],
    quiz: {},
    unlockedModules: ['m1'],
  }), ids).ok, false);
  assert.equal(validateProgressImport(`{"_format":"linuxpath-progress-v2"${' '.repeat(120000)}}`, ids).ok, false);
  assert.equal(validateProgressImport(JSON.stringify({
    _format: 'linuxpath-progress-v2',
    lessonsDone: [],
    exercisesDone: [],
    quiz: { m1: { lastScore: 9, bestScore: 9, attempts: 1, passed: true } },
    unlockedModules: ['m1'],
  }), ids).ok, false);
  const polluted = '{"_format":"linuxpath-progress-v2","lessonsDone":[],"exercisesDone":[],"quiz":{"__proto__":{"polluted":true}},"unlockedModules":["m1"]}';
  assert.equal(validateProgressImport(polluted, ids).ok, false);
});
