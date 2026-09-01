import test from 'node:test';
import assert from 'node:assert/strict';
import { access, cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { validateContent, loadJson } from '../../scripts/lib/content-validation.mjs';

const EXPECTED_COUNTS = {
  modules: 19,
  lessons: 99,
  exercises: 49,
  quizQuestions: 97,
  quizzes: 19,
  ctfChallenges: 10,
  cheatsheetCommands: 118,
  glossaryTerms: 74,
};

test('all curriculum JSON has the audited shape, unique ids and exact counts', async () => {
  const result = await validateContent();
  assert.deepEqual(result.errors, []);
  for (const [key, value] of Object.entries(EXPECTED_COUNTS)) assert.equal(result.counts[key], value, key);
});

test('course answers and CTF hashes stay within valid ranges and formats', async () => {
  const result = await validateContent();
  const quizzes = result.data['quizzes.json'];
  const challenges = result.data['ctf.json'].challenges;
  for (const [moduleId, quiz] of Object.entries(quizzes)) {
    quiz.questions.forEach((question, index) => {
      assert.ok(Number.isInteger(question.correct), `${moduleId} question ${index + 1}`);
      assert.ok(question.correct >= 0 && question.correct < question.options.length, `${moduleId} question ${index + 1}`);
    });
  }
  for (const challenge of challenges) assert.match(challenge.flagHash, /^[0-9a-f]{64}$/, challenge.id);
});

test('every quiz declares a valid explicit pass score', async () => {
  const quizzes = await loadJson('data/quizzes.json');
  for (const [moduleId, quiz] of Object.entries(quizzes)) {
    assert.equal(Number.isInteger(quiz.passScore), true, moduleId);
    assert.ok(quiz.passScore >= 1 && quiz.passScore <= quiz.questions.length, moduleId);
  }
  assert.equal(quizzes.m12.passScore, 3);
});

test('browser bootstrap no longer consumes a global quiz threshold', async () => {
  const [app, storage] = await Promise.all([
    readFile('assets/app.js', 'utf8'),
    readFile('assets/storage.js', 'utf8'),
  ]);
  assert.equal(app.includes('catalogue.passScore'), false);
  assert.equal(storage.includes('options.passScore'), false);
});

test('content validation rejects a quiz threshold outside its question bounds', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'linuxpath-quiz-policy-'));
  try {
    await cp('data', path.join(root, 'data'), { recursive: true });
    const fixturePath = path.join(root, 'data/quizzes.json');
    const quizzes = JSON.parse(await readFile(fixturePath, 'utf8'));
    quizzes.m1.passScore = quizzes.m1.questions.length + 1;
    await writeFile(fixturePath, `${JSON.stringify(quizzes, null, 2)}\n`);

    const result = await validateContent(root);
    assert.deepEqual(result.errors.filter((entry) => entry.code === 'invalid-quiz-pass-score'), [{
      severity: 'error',
      code: 'invalid-quiz-pass-score',
      location: 'data/quizzes.json#m1',
      message: 'Quiz m1 passScore must be an integer between 1 and 5',
    }]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('content validation itemizes every malformed lesson source with its reason', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'linuxpath-lesson-sources-'));
  try {
    await cp('data', path.join(root, 'data'), { recursive: true });
    const fixturePath = path.join(root, 'data/lessons.json');
    const lessons = JSON.parse(await readFile(fixturePath, 'utf8'));
    delete lessons.m1[0].sources;
    lessons.m1[1].sources = ['man-pages'];
    lessons.m1[2].sources = [{
      title: '   ',
      url: 'http://example.com/',
      scope: '',
      checkedAt: '2026-02-30',
    }];
    await writeFile(fixturePath, `${JSON.stringify(lessons, null, 2)}\n`);

    const result = await validateContent(root);
    assert.deepEqual(result.errors.filter((entry) => entry.code === 'invalid-lesson-source'), [
      {
        severity: 'error',
        code: 'invalid-lesson-source',
        location: 'data/lessons.json#m1-l1',
        message: 'Lesson m1-l1: sources must be a non-empty array',
      },
      {
        severity: 'error',
        code: 'invalid-lesson-source',
        location: 'data/lessons.json#m1-l2/sources/0',
        message: 'Lesson m1-l2 source 1: must be an object',
      },
      {
        severity: 'error',
        code: 'invalid-lesson-source',
        location: 'data/lessons.json#m1-l3/sources/0',
        message: 'Lesson m1-l3 source 1: title must be a non-empty string',
      },
      {
        severity: 'error',
        code: 'invalid-lesson-source',
        location: 'data/lessons.json#m1-l3/sources/0',
        message: 'Lesson m1-l3 source 1: url must be an HTTPS URL',
      },
      {
        severity: 'error',
        code: 'invalid-lesson-source',
        location: 'data/lessons.json#m1-l3/sources/0',
        message: 'Lesson m1-l3 source 1: scope must be a non-empty string',
      },
      {
        severity: 'error',
        code: 'invalid-lesson-source',
        location: 'data/lessons.json#m1-l3/sources/0',
        message: 'Lesson m1-l3 source 1: checkedAt must be a valid YYYY-MM-DD date',
      },
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('rendering sources contain no legacy hard-coded product totals', async () => {
  const files = ['assets/render.js', 'assets/ctf.js', 'assets/storage.js', 'assets/app.js', 'assets/site-patches.js'];
  const texts = [];
  for (const file of files) {
    try { texts.push(await readFile(file, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  const blob = texts.join('\n');
  const legacy = [
    ['hero module total', /<div class="lp-stat-num">9<\/div><div class="lp-stat-label">Modules/],
    ['hero lesson total', /<div class="lp-stat-num">48<\/div><div class="lp-stat-label">Leçons/],
    ['hero exercise total', /<div class="lp-stat-num">23<\/div><div class="lp-stat-label">Exercices/],
    ['hero quiz total', /<div class="lp-stat-num">45<\/div><div class="lp-stat-label">Questions QCM/],
    ['hero CTF total', /<div class="lp-stat-num">6<\/div><div class="lp-stat-label">Challenges CTF/],
    ['CTF badge denominator', /ctfState\.solved\.size\s*\+\s*'\/6'/],
    ['hard-coded progress total', /const total = 125;/],
  ];
  const found = legacy.filter(([, pattern]) => pattern.test(blob)).map(([label]) => label);
  assert.deepEqual(found, [], `legacy totals still rendered: ${found.join(', ')}`);
});

test('modules.json is the unique published-module catalogue', async () => {
  const catalogue = await loadJson('data/modules.json');
  const modules = catalogue.modules;
  assert.equal(modules.length, 19);
  const ids = modules.map((entry) => entry.id);
  assert.deepEqual(ids, [...Array.from({ length: 14 }, (_, index) => `m${index + 1}`), 'cs1', 'hw1', 'hw2', 'hw3', 'hw4']);
  for (const entry of modules) {
    assert.equal(typeof entry.title, 'string');
    assert.ok(entry.title.length > 0, entry.id);
    assert.ok(['linux', 'network', 'offsec', 'hardware'].includes(entry.track), entry.id);
    assert.ok(['published', 'draft'].includes(entry.status), entry.id);
    assert.ok(Array.isArray(entry.prerequisites));
    assert.equal(typeof entry.displayOrder, 'number');
  }
});

test('site-patches runtime layer is gone from the product tree', async () => {
  const html = await readFile('index.html', 'utf8');
  const sw = await readFile('sw.js', 'utf8');
  assert.equal(html.includes('site-patches'), false);
  assert.equal(sw.includes('site-patches'), false);
  await assert.rejects(() => access('assets/site-patches.js', constants.F_OK), { code: 'ENOENT' });
});

test('the static module headers in index.html match the real data counts', async () => {
  const [html, lessons, exercises, quizzes] = await Promise.all([
    readFile('index.html', 'utf8'),
    loadJson('data/lessons.json'),
    loadJson('data/exercises.json'),
    loadJson('data/quizzes.json'),
  ]);
  const sections = [...html.matchAll(/<section id="section-(m\d+|hw\d+)"([\s\S]*?)(?=<section id="section-|<!-- =====|<\/main>)/g)];
  const failures = [];
  for (const [, moduleId, body] of sections) {
    const items = [...body.matchAll(/module-meta-item">([^<]+)<\/span>/g)].map((match) => match[1]);
    const text = items.join(' | ');
    const expected = {
      leçons: (lessons[moduleId] || []).length,
      exercices: (exercises[moduleId] || []).length,
      questions: ((quizzes[moduleId] || {}).questions || []).length,
    };
    const ok = (
      text.includes(`📚 ${expected.leçons} leçon`) &&
      text.includes(`⚡ ${expected.exercices} exercice`) &&
      text.includes(`Quiz ${expected.questions} question`)
    );
    if (!ok) failures.push({ moduleId, html: text, expected });
  }
  assert.deepEqual(failures, []);
});
