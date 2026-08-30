import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadJson } from '../../scripts/lib/content-validation.mjs';

const FORBIDDEN = [
  { id: 'm4-l5', needle: 'sudo echo' },
  { id: 'm6-l3', needle: 'sudo apt update && sudo apt upgrade -y' },
  { id: 'm7-l3', needle: 'password|passwd|secret' },
  { id: 'm8-l7', needle: 'docker run ubuntu echo' },
  { id: 'm9-l2', needle: 'nft flush table' },
  { id: 'm13-l1', needle: 'exploit/multi/handler' },
  { id: 'm13-l1', needle: 'set RHOSTS' },
  { id: 'm14-l2', needle: 'mount -o loop,offset=' },
];

const REQUIRED = [
  { id: 'm2-l2', needle: 'umask' },
  { id: 'm4-l5', needle: 'tee -a' },
  { id: 'm6-l3', needle: 'unattended-upgrades' },
  { id: 'm7-l3', needle: String.raw`\.[0-9]{1,3}` },
  { id: 'm8-l7', needle: 'docker run --rm' },
  { id: 'm9-l2', needle: 'chmod 600' },
  { id: 'm13-l1', needle: 'info' },
  { id: 'm14-l2', needle: 'ro,noload' },
  { id: 'm14-l2', needle: 'write blocker' },
  { id: 'm14-l5', needle: 'ordre de volatilité' },
];

test('lessons do not teach the audited operationally dangerous recipes', async () => {
  const lessons = await loadJson('data/lessons.json');
  const hits = [];
  for (const { id, needle } of FORBIDDEN) {
    const lesson = Object.values(lessons).flat().find((entry) => entry.id === id);
    assert.ok(lesson, `missing lesson ${id}`);
    if (lesson.content.includes(needle)) hits.push(`${id}: ${needle}`);
  }
  assert.deepEqual(hits, [], hits.join('; '));
});

test('priority lessons contain the corrected teaching', async () => {
  const lessons = await loadJson('data/lessons.json');
  const missing = [];
  for (const { id, needle } of REQUIRED) {
    const lesson = Object.values(lessons).flat().find((entry) => entry.id === id);
    assert.ok(lesson, `missing lesson ${id}`);
    if (!lesson.content.toLowerCase().includes(needle.toLowerCase())) missing.push(`${id}: ${needle}`);
  }
  assert.deepEqual(missing, []);
});

test('every lesson has a documented review status', async () => {
  const lessons = await loadJson('data/lessons.json');
  const rows = Object.values(lessons).flat();
  assert.equal(rows.length, 73);
  const incomplete = rows.filter((lesson) => lesson.reviewStatus !== 'reviewed' || !lesson.reviewedAt || !lesson.distro);
  assert.deepEqual(incomplete.map((lesson) => lesson.id), []);
});

test('content review matrix lists every published lesson', async () => {
  const lessons = await loadJson('data/lessons.json');
  const matrix = await readFile('docs/content-review-matrix.md', 'utf8');
  const missing = Object.values(lessons).flat().filter((lesson) => !matrix.includes(lesson.id)).map((lesson) => lesson.id);
  assert.deepEqual(missing, []);
});

test('no quiz bank uses answer A for every question', async () => {
  const quizzes = await loadJson('data/quizzes.json');
  const biased = [];
  for (const [moduleId, quiz] of Object.entries(quizzes)) {
    if (quiz.questions.length >= 5 && quiz.questions.every((question) => question.correct === 0)) {
      biased.push(moduleId);
    }
  }
  assert.deepEqual(biased, []);
});

test('ambiguous quiz prompts are rewritten as single-answer questions', async () => {
  const quizzes = await loadJson('data/quizzes.json');
  const blob = JSON.stringify(quizzes).toLowerCase();
  assert.equal(blob.includes('plusieurs réponses'), false);
  assert.equal(quizzes.m5.questions[1].expl.toLowerCase().includes('tous deux valides'), false);
  assert.equal(quizzes.m14.questions[2].expl.toLowerCase().includes('empreinte unique'), false);
});

test('no CTF hint contains a plaintext flag', async () => {
  const ctf = await loadJson('data/ctf.json');
  const leaks = [];
  for (const challenge of ctf.challenges) {
    for (const [index, hint] of (challenge.hints || []).entries()) {
      if (/flag\{[^}]+\}/i.test(hint)) leaks.push(`${challenge.id} hint ${index + 1}`);
    }
  }
  assert.deepEqual(leaks, []);
});

test('ctf-08 announces a simulated capture and ctf-10 does not pretend to decrypt with the key', async () => {
  const ctf = await loadJson('data/ctf.json');
  const ctf08 = ctf.challenges.find((challenge) => challenge.id === 'ctf-08');
  const ctf10 = ctf.challenges.find((challenge) => challenge.id === 'ctf-10');
  const ctf05 = ctf.challenges.find((challenge) => challenge.id === 'ctf-05');
  assert.match(`${ctf08.context} ${ctf08.hints.join(' ')}`, /simulation/i);
  assert.equal(/chiffr/i.test(ctf10.context), false);
  assert.equal(ctf05.difficulty, 'easy');
});

test('glossary does not present regreSSHion as a buffer overflow', async () => {
  const glossary = await loadJson('data/glossary.json');
  const overflow = glossary.terms.find((term) => term.id === 'buffer-overflow');
  assert.ok(overflow);
  assert.equal(/CVE-2024-6387/i.test(`${overflow.definition} ${overflow.example}`), false);
  assert.match(glossary.terms.find((term) => term.id === 'daemon').definition, /pas toujours/i);
});
