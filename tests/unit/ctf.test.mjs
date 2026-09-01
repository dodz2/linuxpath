import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  normalizeFlag,
  rewriteCtfCommand,
  sha256Hex,
  solveKind,
} from '../../scripts/lib/ctf-model.mjs';
import {
  findDanglingVfsReferences,
  validateContent,
} from '../../scripts/lib/content-validation.mjs';

const flags = JSON.parse(await readFile('tests/fixtures/ctf-flags.json', 'utf8'));
const catalogue = JSON.parse(await readFile('data/ctf.json', 'utf8'));

async function loadBrowserCtf(cataloguePayload) {
  const elements = new Map();
  const createElement = (tagName) => ({
    tagName,
    attributes: {},
    children: [],
    className: '',
    classList: { add() {} },
    dataset: {},
    append(...children) { this.children.push(...children); },
    appendChild(child) { this.children.push(child); },
    setAttribute(name, value) { this.attributes[name] = value; },
  });
  const grid = createElement('div');
  grid.replaceChildren = (...children) => { grid.children = children; };
  elements.set('ctf-grid', grid);
  elements.set('nav-badge-ctf', createElement('span'));

  const sandbox = {
    fetch: async () => ({ ok: true, json: async () => structuredClone(cataloguePayload) }),
    document: {
      createElement,
      getElementById: (id) => elements.get(id) || null,
      querySelectorAll: () => [],
    },
    getCurriculumStats: () => ({ challenges: 0, difficulty: { easy: 0, medium: 0, hard: 0 } }),
    createTerminalEngine: () => ({}),
    escapeHtml: (value) => String(value),
    storage: { get: async () => null, set: async () => undefined },
    readStoredJson: async (_key, fallback) => fallback,
    console,
    crypto,
    TextEncoder,
    atob,
    btoa,
  };
  const context = vm.createContext(sandbox);
  vm.runInContext(await readFile('assets/ctf.js', 'utf8'), context, { filename: 'assets/ctf.js' });
  return {
    context,
    grid,
    load: () => vm.runInContext('loadCTFCatalogue()', context),
    snapshot: () => vm.runInContext('({ status: CTF_CATALOGUE_STATUS, challenges: CTF_CHALLENGES })', context),
  };
}

test('malformed CTF challenge becomes a recoverable catalogue error without rejection', async () => {
  const browserCtf = await loadBrowserCtf({ challenges: [{}] });
  let loaded;

  await assert.doesNotReject(async () => { loaded = await browserCtf.load(); });
  const state = browserCtf.snapshot();

  assert.equal(loaded, false);
  assert.equal(state.status, 'error');
  assert.deepEqual(Array.from(state.challenges), []);
  assert.equal(browserCtf.grid.children[0].attributes.role, 'alert');
});

test('valid CTF challenges are normalized before becoming renderable', async () => {
  const raw = structuredClone(catalogue.challenges[0]);
  raw.id = `  ${raw.id}  `;
  raw.title = `  ${raw.title}  `;
  raw.difficulty = ' EASY ';
  raw.hints = raw.hints.map((hint) => `  ${hint}  `);
  const browserCtf = await loadBrowserCtf({
    challenges: [raw, ...structuredClone(catalogue.challenges.slice(1))],
  });

  assert.equal(await browserCtf.load(), true);
  const state = browserCtf.snapshot();
  const [challenge] = state.challenges;

  assert.equal(state.challenges.length, catalogue.challenges.length);
  assert.equal(challenge.id, 'ctf-01');
  assert.equal(challenge.title, 'Fichier caché');
  assert.equal(challenge.difficulty, 'easy');
  assert.equal(challenge.hints[0], raw.hints[0].trim());
});

test('every CTF virtual filesystem closes each directory child reference', () => {
  const danglingByChallenge = catalogue.challenges
    .map((challenge) => ({
      id: challenge.id,
      paths: findDanglingVfsReferences(challenge.vfs).map((entry) => entry.childPath),
    }))
    .filter((entry) => entry.paths.length > 0);
  const details = danglingByChallenge
    .map(({ id, paths }) => `${id}: ${paths.join(', ')}`)
    .join('\n');
  const total = danglingByChallenge.reduce((sum, entry) => sum + entry.paths.length, 0);

  assert.equal(total, 0, `found ${total} dangling CTF VFS references:\n${details}`);
});

test('content validation reports dangling CTF VFS references by challenge', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'linuxpath-ctf-validation-'));
  try {
    await cp('data', path.join(root, 'data'), { recursive: true });
    const fixturePath = path.join(root, 'data/ctf.json');
    const fixture = JSON.parse(await readFile(fixturePath, 'utf8'));
    delete fixture.challenges[0].vfs['/bin/bash'];
    await writeFile(fixturePath, `${JSON.stringify(fixture, null, 2)}\n`);

    const result = await validateContent(root);
    assert.deepEqual(
      result.errors.filter((entry) => entry.code === 'dangling-ctf-vfs'),
      [{
        severity: 'error',
        code: 'dangling-ctf-vfs',
        location: 'data/ctf.json#ctf-01',
        message: 'ctf-01 has dangling VFS references: /bin/bash',
      }],
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('the ten published flags hash to the catalogue and never appear in the validator', async () => {
  assert.equal(catalogue.challenges.length, 10);
  for (const challenge of catalogue.challenges) {
    const flag = flags[challenge.id];
    assert.equal(typeof flag, 'string', challenge.id);
    assert.equal(sha256Hex(normalizeFlag(flag)), challenge.flagHash, challenge.id);
    assert.equal(sha256Hex(normalizeFlag(`  ${flag.toUpperCase()}  `)), challenge.flagHash, challenge.id);
  }
  const validator = await readFile('assets/ctf.js', 'utf8');
  assert.equal(validator.includes('function submitCTFFlag'), true);
  assert.equal(validator.includes('function resetCTFTerminal'), true);
  assert.equal(/crypto\.subtle\.digest\(\s*['"]SHA-256['"]/.test(validator), true);
  assert.equal(/flagHash\s*===|expectedFlags|FLAG_BY_ID/.test(validator), false);
});

test('official last-hint commands are rewritten into quote-free executable forms', () => {
  assert.equal(rewriteCtfCommand('find / -name "*flag*"'), 'find / -name *flag*');
  assert.equal(rewriteCtfCommand("grep 'DATA' /var/log/auth.log"), 'grep DATA /var/log/auth.log');
  assert.equal(rewriteCtfCommand("grep '#' /opt/maintenance/cleanup.sh"), 'grep # /opt/maintenance/cleanup.sh');
  assert.equal(
    rewriteCtfCommand("echo 'ZmxhZ3tiYXNlNjRfaXNfbm90X2VuY3J5cHRpb259' | base64 -d"),
    'base64 -d ZmxhZ3tiYXNlNjRfaXNfbm90X2VuY3J5cHRpb259',
  );
  assert.equal(rewriteCtfCommand('find / -name "id_*"'), 'find / -name id_*');
  assert.equal(rewriteCtfCommand('ps aux'), 'ps aux');
});

test('a solve is autonomous only when no hint was revealed', () => {
  assert.equal(solveKind(0), 'autonomous');
  assert.equal(solveKind(1), 'with_help');
  assert.equal(solveKind(3), 'with_help');
});
