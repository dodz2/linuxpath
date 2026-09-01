import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { validateProgressImport } from '../../scripts/lib/progress-model.mjs';
import { loadJson } from '../../scripts/lib/content-validation.mjs';

async function catalog() {
  const [lessons, exercises, modules, quizzes, ctf] = await Promise.all([
    loadJson('data/lessons.json'),
    loadJson('data/exercises.json'),
    loadJson('data/modules.json'),
    loadJson('data/quizzes.json'),
    loadJson('data/ctf.json'),
  ]);
  return {
    lessonIds: Object.values(lessons).flat().map((entry) => entry.id),
    exerciseIds: Object.values(exercises).flat().map((entry) => entry.id),
    moduleIds: [...modules.modules.map((entry) => entry.id), 'sandbox'],
    quizPolicies: Object.fromEntries(Object.entries(quizzes).map(([moduleId, quiz]) => [moduleId, {
      maxScore: quiz.questions.length,
      passScore: quiz.passScore,
    }])),
    ctfIds: ctf.challenges.map((entry) => entry.id),
  };
}

async function loadBrowserStorage(localStorage, exposed = 'storage', setup = '') {
  const source = await readFile('assets/storage.js', 'utf8');
  const context = vm.createContext({
    window: { localStorage },
    console,
    TextEncoder,
  });
  new vm.Script(`${source}\n${setup}\n;globalThis.__storageTest = { ${exposed} };`).runInContext(context);
  return context.__storageTest;
}

test('memory fallback reads the latest write for each failed key', async () => {
  const localStorage = {
    getItem() { return null; },
    setItem() { throw new Error('quota denied'); },
  };
  const { storage } = await loadBrowserStorage(localStorage);

  await storage.set('alpha', 'latest-alpha');
  await storage.set('beta', 'latest-beta');

  assert.equal(await storage.get('alpha'), 'latest-alpha');
  assert.equal(await storage.get('beta'), 'latest-beta');
});

test('persistence status exposes a non-persistent session', async () => {
  const localStorage = {
    getItem() { return null; },
    setItem() { throw new Error('quota denied'); },
  };
  const { storage, getPersistenceStatus } = await loadBrowserStorage(
    localStorage,
    "storage, getPersistenceStatus: typeof getPersistenceStatus === 'function' ? getPersistenceStatus : undefined",
  );

  await storage.set('alpha', 'latest-alpha');

  assert.equal(typeof getPersistenceStatus, 'function');
  assert.equal(getPersistenceStatus().persistent, false);
  assert.deepEqual([...getPersistenceStatus().fallbackKeys], ['alpha']);
});

test('saveState reports when any progress write is non-durable', async () => {
  const localStorage = {
    getItem() { return null; },
    setItem() { throw new Error('quota denied'); },
  };
  const { saveState } = await loadBrowserStorage(
    localStorage,
    "saveState: typeof saveState === 'function' ? saveState : undefined",
  );

  const result = await saveState();

  assert.equal(result.persistent, false);
  assert.equal(result.writes.length, 7);
  assert.equal(result.writes.every((write) => write.persistent === false), true);
});

test('a non-durable import restores the previous in-memory progress', async () => {
  const localStorage = {
    getItem() { return null; },
    setItem() { throw new Error('quota denied'); },
  };
  const setup = `
    LESSONS = { m1: [{ id: 'm1-l1' }, { id: 'm1-l2' }] };
    EXERCISES = { m1: [] };
    QUIZZES = { m1: { questions: [{}, {}, {}, {}, {}], passScore: 3 } };
    MODULES = [{ id: 'm1', status: 'published', prerequisites: [] }];
    globalThis.CTF_CHALLENGES = [{ id: 'ctf-01' }];
    globalThis.ctfState = { solved: new Set(['ctf-01']), hints: { 'ctf-01': 1 }, how: {} };
    globalThis.saveCTFState = async function () {
      await Promise.all([
        storage.set('lt_ctf_solved', JSON.stringify([...ctfState.solved])),
        storage.set('lt_ctf_hints', JSON.stringify(ctfState.hints)),
        storage.set('lt_ctf_how', JSON.stringify(ctfState.how || {})),
      ]);
    };
    state.lessonsDone = new Set(['m1-l1']);
    state.unlockedModules = new Set(['m1']);
  `;
  const runtime = await loadBrowserStorage(
    localStorage,
    "persistProgressImport: typeof persistProgressImport === 'function' ? persistProgressImport : undefined, snapshot: () => exportProgressData(), storage",
    setup,
  );

  const result = await runtime.persistProgressImport({
    _format: 'linuxpath-progress-v3',
    lessonsDone: ['m1-l2'],
    exercisesDone: [],
    quiz: {},
    unlockedModules: ['m1'],
    ctfSolved: [],
    ctfHints: {},
    ctfHow: {},
    variantAssignments: {},
    variantResults: {},
  });

  const restored = runtime.snapshot();
  assert.equal(result.durable, false);
  assert.deepEqual([...restored.lessonsDone], ['m1-l1']);
  assert.deepEqual([...restored.ctfSolved], ['ctf-01']);
  assert.equal(await runtime.storage.get('lt_lessonsDone'), '["m1-l1"]');
});

test('corrupt progress is isolated while a valid theme still loads and the raw value remains recoverable', async () => {
  const corrupt = '{"lessons":["m1-l1"],"payload":"<img src=x onerror=alert(1)>"';
  const values = new Map([
    ['progress', corrupt],
    ['theme', '"dark"'],
  ]);
  const localStorage = {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, value); },
  };
  const { readStoredJson, getStorageRecoveryStatus } = await loadBrowserStorage(
    localStorage,
    [
      "readStoredJson: typeof readStoredJson === 'function' ? readStoredJson : undefined",
      "getStorageRecoveryStatus: typeof getStorageRecoveryStatus === 'function' ? getStorageRecoveryStatus : undefined",
    ].join(', '),
  );

  assert.equal(typeof readStoredJson, 'function');
  const progress = await readStoredJson('progress', { lessons: [] }, (value) => Array.isArray(value.lessons), 'progress');
  const theme = await readStoredJson('theme', 'system', (value) => value === 'dark' || value === 'light', 'theme');
  const recovery = getStorageRecoveryStatus();

  assert.deepEqual(progress, { lessons: [] });
  assert.equal(theme, 'dark');
  assert.equal(recovery.state, 'recovered');
  assert.equal(recovery.entries.length, 1);
  assert.equal(recovery.entries[0].key, 'progress');
  assert.equal(recovery.entries[0].scope, 'progress');
  assert.equal(recovery.entries[0].raw, corrupt);
});

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

test('m12 score bounds come from quiz metadata', async () => {
  const ids = await catalog();
  const progress = (score) => JSON.stringify({
    _format: 'linuxpath-progress-v3',
    lessonsDone: [],
    exercisesDone: [],
    quiz: { m12: { lastScore: score, bestScore: score, attempts: 1, passed: false } },
    unlockedModules: [],
  });

  assert.equal(validateProgressImport(progress(6), ids).ok, true);
  assert.equal(validateProgressImport(progress(7), ids).ok, true);
  assert.deepEqual(validateProgressImport(progress(8), ids), { ok: false, reason: 'score' });
});

test('imported quiz pass status is rebuilt from its catalog threshold', async () => {
  const ids = await catalog();
  ids.quizPolicies.m12.passScore = 7;
  const raw = JSON.stringify({
    _format: 'linuxpath-progress-v3',
    lessonsDone: [],
    exercisesDone: [],
    quiz: { m12: { lastScore: 6, bestScore: 6, attempts: 1, passed: true } },
    unlockedModules: [],
  });

  const result = validateProgressImport(raw, ids);
  assert.equal(result.ok, true);
  assert.equal(result.data.quiz.m12.passed, false);
});

test('m12 v3 score 7 survives export import round trip', async () => {
  const ids = await catalog();
  const raw = await readFile('tests/fixtures/progress-v3-m12-7.json', 'utf8');
  const imported = validateProgressImport(raw, ids);
  assert.equal(imported.ok, true);
  assert.deepEqual(imported.data.quiz.m12, {
    attempts: 1,
    bestScore: 7,
    lastScore: 7,
    passed: true,
  });

  const reimported = validateProgressImport(JSON.stringify(imported.data), ids);
  assert.equal(reimported.ok, true);
  assert.deepEqual(reimported.data.quiz.m12, imported.data.quiz.m12);
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
