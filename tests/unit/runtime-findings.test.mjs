import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

class FakeElement {
  constructor(tagName, action) {
    this.tagName = tagName.toUpperCase();
    this.dataset = { action };
  }

  closest(selector) {
    return selector === '[data-action]' ? this : null;
  }

  matches(selector) {
    return selector.split(',').some((entry) => entry.trim().toUpperCase() === this.tagName);
  }
}

async function loadDelegatedListeners() {
  const listeners = new Map();
  let focusCalls = 0;
  let flagCalls = 0;
  const document = {
    addEventListener(type, listener) {
      const handlers = listeners.get(type) || [];
      handlers.push(listener);
      listeners.set(type, handlers);
    },
    documentElement: { contains: () => true },
  };
  const context = vm.createContext({
    document,
    Element: FakeElement,
    focusTerminal: () => { focusCalls += 1; },
    submitCTFFlag: () => { flagCalls += 1; },
    window: { addEventListener() {} },
    location: { hash: '' },
    console,
    setInterval,
    clearInterval,
    setTimeout,
    clearTimeout,
  });
  const source = await readFile('assets/app.js', 'utf8');
  new vm.Script(source).runInContext(context);
  return {
    listeners,
    calls: () => ({ focusCalls, flagCalls }),
  };
}

async function loadExerciseControlLabel() {
  const context = vm.createContext({ console });
  const source = await readFile('assets/render.js', 'utf8');
  new vm.Script(`${source}\n;globalThis.__labelTest = typeof exerciseControlLabel === 'function' ? exerciseControlLabel : undefined;`).runInContext(context);
  return context.__labelTest;
}

test('delegated clicks ignore form fields while buttons and Enter still dispatch', async () => {
  const { listeners, calls } = await loadDelegatedListeners();
  const click = listeners.get('click')[0];
  const keydown = listeners.get('keydown')[0];

  for (const tagName of ['input', 'textarea', 'select']) {
    click({ target: new FakeElement(tagName, 'focus-terminal'), preventDefault() {} });
  }
  assert.deepEqual(calls(), { focusCalls: 0, flagCalls: 0 });

  click({ target: new FakeElement('button', 'focus-terminal'), preventDefault() {} });
  assert.deepEqual(calls(), { focusCalls: 1, flagCalls: 0 });

  keydown({ key: 'Enter', target: new FakeElement('input', 'submit-ctf-flag') });
  assert.deepEqual(calls(), { focusCalls: 1, flagCalls: 1 });
});

test('all 49 exercise labels are non-empty, unique and title-specific', async () => {
  const labelFor = await loadExerciseControlLabel();
  const exercises = JSON.parse(await readFile('data/exercises.json', 'utf8'));
  const rows = Object.values(exercises).flat();
  assert.equal(rows.length, 49);
  assert.equal(typeof labelFor, 'function');

  const labels = rows.map((exercise) => labelFor(exercise));
  assert.equal(labels.every((label, index) => label.trim() && label.includes(rows[index].id) && label.includes(rows[index].title)), true);
  assert.equal(new Set(labels).size, 49);
});
