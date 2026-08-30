import test from 'node:test';
import assert from 'node:assert/strict';
import { loadJson } from '../../scripts/lib/content-validation.mjs';
import { masteryLabel } from '../../scripts/lib/progress-model.mjs';

test('three learning tracks are explicit and the third is not labelled offensive', async () => {
  const catalogue = await loadJson('data/modules.json');
  const tracks = catalogue.tracks;
  assert.equal(tracks.length, 3);
  assert.deepEqual(tracks.map((track) => track.id), ['linux', 'network', 'offsec']);
  assert.equal(tracks[0].title, 'Fondamentaux Linux');
  assert.equal(tracks[1].title, 'Réseau & services');
  assert.match(tracks[2].title, /Sécurité.*DFIR|Pentest.*DFIR/i);
  assert.equal(/offensive/i.test(tracks[2].title), false);
  assert.deepEqual(tracks[0].modules, ['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8']);
  assert.deepEqual(tracks[1].modules, ['m9', 'm10', 'm11']);
  assert.deepEqual(tracks[2].modules, ['m12', 'm13', 'm14']);
  for (const track of tracks) {
    assert.ok(track.level);
    assert.ok(track.prerequisites);
    assert.ok(Number.isFinite(track.estimatedHours));
    assert.ok(Array.isArray(track.objectives) && track.objectives.length >= 2);
    assert.ok(track.capstone);
    assert.ok(track.entryModule);
  }
});

test('every published module has objectives, time estimate and a success criterion', async () => {
  const catalogue = await loadJson('data/modules.json');
  for (const entry of catalogue.modules) {
    assert.ok(Array.isArray(entry.objectives) && entry.objectives.length >= 2, entry.id);
    assert.ok(Number.isFinite(entry.estimatedMinutes) && entry.estimatedMinutes > 0, entry.id);
    assert.equal(typeof entry.successCriteria, 'string', entry.id);
    assert.ok(entry.successCriteria.length > 12, entry.id);
  }
});

test('m8 is split into Git and Docker chapters without changing lesson ids', async () => {
  const catalogue = await loadJson('data/modules.json');
  const lessons = await loadJson('data/lessons.json');
  const module = catalogue.modules.find((entry) => entry.id === 'm8');
  const lessonIds = lessons.m8.map((lesson) => lesson.id);
  assert.deepEqual(module.chapters.map((chapter) => chapter.id), ['git', 'docker']);
  const covered = module.chapters.flatMap((chapter) => chapter.lessons);
  assert.deepEqual(covered, lessonIds);
});

test('mastery labels distinguish helped, autonomous and mastered', () => {
  assert.equal(masteryLabel({ passed: true, bestScore: 5, withHelp: false }), 'mastered');
  assert.equal(masteryLabel({ passed: true, bestScore: 4, withHelp: false }), 'autonomous');
  assert.equal(masteryLabel({ passed: true, bestScore: 3, withHelp: true }), 'helped');
  assert.equal(masteryLabel({ passed: false, bestScore: 2, withHelp: false }), 'attempted');
});
