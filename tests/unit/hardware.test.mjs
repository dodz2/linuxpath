import test from 'node:test';
import assert from 'node:assert/strict';
import { loadJson } from '../../scripts/lib/content-validation.mjs';

const HW_IDS = ['hw1', 'hw2', 'hw3', 'hw4'];

test('the hardware track exists with four modules and a capstone', async () => {
  const catalogue = await loadJson('data/modules.json');
  const track = catalogue.tracks.find((entry) => entry.id === 'hardware');
  assert.ok(track, 'hardware track is missing');
  assert.equal(track.title, 'Lab & Tinker');
  assert.deepEqual(track.modules, HW_IDS);
  assert.equal(track.entryModule, 'hw1');
  assert.ok(track.capstone && track.capstone.length > 10);
  assert.ok(Array.isArray(track.objectives) && track.objectives.length >= 2);
  const ids = catalogue.modules.map((entry) => entry.id);
  for (const id of HW_IDS) assert.ok(ids.includes(id), `${id} missing from modules`);
});

test('hw modules chain prerequisites and hw4 is gated behind hw1-hw3', async () => {
  const catalogue = await loadJson('data/modules.json');
  const byId = Object.fromEntries(catalogue.modules.map((entry) => [entry.id, entry]));
  assert.deepEqual(byId.hw1.prerequisites, [], 'hw1 should be free');
  assert.deepEqual(byId.hw2.prerequisites, ['hw1']);
  assert.deepEqual(byId.hw3.prerequisites, ['hw2']);
  assert.deepEqual(byId.hw4.prerequisites, ['hw1', 'hw2', 'hw3'], 'hw4 must be gated behind hw1..hw3');
});

test('every published hw module ships 5 lessons, 2 exercises and a 5-question quiz', async () => {
  const catalogue = await loadJson('data/modules.json');
  const lessons = await loadJson('data/lessons.json');
  const exercises = await loadJson('data/exercises.json');
  const quizzes = await loadJson('data/quizzes.json');
  for (const id of HW_IDS) {
    const mod = catalogue.modules.find((entry) => entry.id === id);
    assert.equal(mod.status, 'published', `${id} should be published`);
    const ids = lessons[id].map((lesson) => lesson.id);
    assert.deepEqual(ids, [`${id}-l1`, `${id}-l2`, `${id}-l3`, `${id}-l4`, `${id}-l5`], id);
    for (const lesson of lessons[id]) {
      assert.equal(lesson.reviewStatus, 'reviewed', `${lesson.id} not reviewed`);
      assert.ok(lesson.reviewedAt && lesson.distro, `${lesson.id} missing review metadata`);
    }
    assert.equal(exercises[id].length, 2, `${id} exercises`);
    for (const exercise of exercises[id]) {
      assert.ok(exercise.validator && exercise.validator.type, `${exercise.id} missing validator`);
    }
    assert.equal(quizzes[id].questions.length, 5, `${id} quiz`);
  }
});

test('hw lessons avoid the same dangerous recipes as the rest of the course', async () => {
  const lessons = await loadJson('data/lessons.json');
  const forbidden = ['sudo rm', ':(){', 'mkfs', 'dd if=', 'chmod 777', '> /dev/sd', 'rfkill', 'iptables -F', 'nvram -c'];
  // A minima le contenu du module publié doit exister ; il grandit à chaque module ajouté.
  const all = HW_IDS.flatMap((id) => lessons[id] || []);
  assert.ok(all.length >= 5, 'expected at least the published hw lessons');
  for (const lesson of all) {
    for (const needle of forbidden) {
      assert.equal(lesson.content.includes(needle), false, `${lesson.id} contains ${needle}`);
    }
  }
});