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

test('audit V2 adversarial fixture has ten unique and complete probes', async () => {
  const fixture = await loadJson('tests/fixtures/audit-v2-adversarial-commands.json');
  assert.equal(fixture.schemaVersion, 1);
  assert.equal(fixture.probes.length, 10);
  assert.equal(new Set(fixture.probes.map((probe) => probe.id)).size, fixture.probes.length);
  assert.equal(new Set(fixture.probes.map((probe) => probe.exerciseId)).size, fixture.probes.length);
  for (const probe of fixture.probes) {
    assert.deepEqual(Object.keys(probe).sort(), [
      'command', 'exerciseId', 'expectedResult', 'id', 'rejectionReason',
    ]);
    assert.match(probe.id, /^audit-v2-e01-\d{2}$/);
    assert.match(probe.exerciseId, /^m\d+-e\d+$/);
    assert.ok(probe.command.trim().length > 0);
    assert.deepEqual(probe.expectedResult, { accepted: false, exitCode: 'non-zero' });
    assert.ok(probe.rejectionReason.trim().length > 0);
  }
});

test('audit V2 remediation matrix traces all eighteen findings once', async () => {
  const matrix = await (await import('node:fs/promises')).readFile('docs/audit-v2-remediation-matrix.md', 'utf8');
  const rows = [...matrix.matchAll(/^\| (E-\d{2}|M-\d{2}|L-\d{2}) \|/gm)].map((match) => match[1]);
  const expected = [
    'E-01', 'E-02', 'E-03',
    'M-01', 'M-02', 'M-03', 'M-04', 'M-05', 'M-06', 'M-07', 'M-08', 'M-09', 'M-10', 'M-11',
    'L-01', 'L-02', 'L-03', 'L-04',
  ];
  assert.deepEqual(rows, expected);
  for (const line of matrix.split('\n').filter((entry) => /^\| (E|M|L)-\d{2} \|/.test(entry))) {
    assert.equal(line.split('|').length, 7, `incomplete remediation row: ${line}`);
  }
});
