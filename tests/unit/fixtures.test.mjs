import test from 'node:test';
import assert from 'node:assert/strict';
import { loadJson } from '../../scripts/lib/content-validation.mjs';

test('progress fixtures only reference ids that exist in the curriculum', async () => {
  const lessons = Object.values(await loadJson('data/lessons.json')).flat().map((entry) => entry.id);
  const exercises = Object.values(await loadJson('data/exercises.json')).flat().map((entry) => entry.id);
  const challenges = (await loadJson('data/ctf.json')).challenges.map((entry) => entry.id);
  const fixture = await loadJson('tests/fixtures/progress-v1.json');
  for (const id of fixture.lessonsDone) assert.ok(lessons.includes(id), id);
  for (const id of fixture.exercisesDone) assert.ok(exercises.includes(id), id);
  for (const id of fixture.ctfSolved) assert.ok(challenges.includes(id), id);
  assert.equal(fixture._format, 'linuxpath-progress-v1');
  assert.equal(typeof fixture.quizScores.m1, 'number');
});
