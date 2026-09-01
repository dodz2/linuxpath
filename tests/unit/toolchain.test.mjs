import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { validateToolchain } from '../../scripts/lib/toolchain.mjs';

const NODE_VERSION = '24.20.0';
const NPM_VERSION = '11.19.0';
const PYTHON_VERSION = '3.13.5';
const UV_VERSION = '0.11.6';

function actionPin(workflow, action) {
  return workflow.match(new RegExp(`uses:\\s*${action.replace('/', '\\/')}@([0-9a-f]{40})`))?.[1] || null;
}

test('qualified Node and npm versions are exact and enforced consistently', async () => {
  const [nodeVersion, npmrc, pkg, lock, ci, deploy, suite] = await Promise.all([
    readFile('.node-version', 'utf8'),
    readFile('.npmrc', 'utf8'),
    readFile('package.json', 'utf8').then(JSON.parse),
    readFile('package-lock.json', 'utf8').then(JSON.parse),
    readFile('.github/workflows/ci.yml', 'utf8'),
    readFile('.github/workflows/deploy-pages.yml', 'utf8'),
    readFile('scripts/run-suite.mjs', 'utf8'),
  ]);

  assert.equal(nodeVersion.trim(), NODE_VERSION);
  assert.match(npmrc, /^engine-strict=true\s*$/m);
  assert.equal(pkg.engines.node, NODE_VERSION);
  assert.equal(pkg.engines.npm, NPM_VERSION);
  assert.equal(pkg.packageManager, `npm@${NPM_VERSION}`);
  assert.deepEqual(pkg.toolchain, { python: PYTHON_VERSION, uv: UV_VERSION });
  assert.equal(lock.packages[''].engines.node, NODE_VERSION);
  assert.equal(lock.packages[''].engines.npm, NPM_VERSION);

  for (const [name, workflow] of [['ci', ci], ['deploy', deploy]]) {
    const setupCount = [...workflow.matchAll(/node-version:\s*['"]([^'"]+)['"]/g)];
    assert.ok(setupCount.length >= 1, `${name} setup-node missing`);
    assert.ok(setupCount.every((match) => match[1] === NODE_VERSION), `${name} Node drift`);
    assert.doesNotMatch(workflow, /npm install --global npm@/, `${name} must use Node's pinned bundled npm`);

    const pythonVersions = [...workflow.matchAll(/python-version:\s*['"]([^'"]+)['"]/g)];
    assert.ok(pythonVersions.length >= 1, `${name} setup-python missing`);
    assert.ok(pythonVersions.every((match) => match[1] === PYTHON_VERSION), `${name} Python drift`);
    const uvVersions = [...workflow.matchAll(/\n\s+version:\s*['"]([^'"]+)['"]/g)];
    assert.ok(uvVersions.some((match) => match[1] === UV_VERSION), `${name} uv ${UV_VERSION} setup missing`);
  }
  assert.ok(actionPin(ci, 'actions/setup-python'), 'CI setup-python action pin missing');
  assert.equal(actionPin(deploy, 'actions/setup-python'), actionPin(ci, 'actions/setup-python'));
  assert.ok(actionPin(ci, 'astral-sh/setup-uv'), 'CI setup-uv action pin missing');
  assert.equal(actionPin(deploy, 'astral-sh/setup-uv'), actionPin(ci, 'astral-sh/setup-uv'));
  assert.match(suite, /check-toolchain\.mjs/);
  const checker = await readFile('scripts/check-toolchain.mjs', 'utf8');
  assert.match(checker, /npm_execpath|npm-cli\.js/);
  assert.match(checker, /pkg\.toolchain/);
  assert.match(checker, /selectPythonInterpreter/);
  assert.match(checker, /['"]uv['"][\s\S]*['"]--version['"]/);
});

test('toolchain validator rejects any Node, npm, Python, or uv drift', () => {
  const expected = {
    node: '24.20.0',
    npm: '11.19.0',
    python: '3.13.5',
    uv: '0.11.6',
  };
  const actual = {
    node: 'v24.20.0',
    npm: '11.19.0',
    python: 'Python 3.13.5',
    uv: 'uv 0.11.6 (x86_64-unknown-linux-musl)',
  };
  assert.deepEqual(validateToolchain(actual, expected), { ok: true, errors: [] });
  assert.equal(validateToolchain({ ...actual, node: 'v24.19.0' }, expected).ok, false);
  assert.equal(validateToolchain({ ...actual, npm: '11.18.0' }, expected).ok, false);
  assert.equal(validateToolchain({ ...actual, python: 'Python 3.13.4' }, expected).ok, false);
  assert.equal(validateToolchain({ ...actual, uv: 'uv 0.11.5' }, expected).ok, false);
});

test('portable Python launcher selects the interpreter, passes literal unittest args, and preserves status', async () => {
  const {
    PYTHON_TEST_ARGS,
    runPythonTests,
    selectPythonInterpreter,
  } = await import('../../scripts/run-python-tests.mjs');

  assert.equal(selectPythonInterpreter({}, 'win32'), 'python');
  assert.equal(selectPythonInterpreter({}, 'linux'), 'python3');
  assert.equal(selectPythonInterpreter({ PYTHON: '/custom/python' }, 'win32'), '/custom/python');

  let invocation;
  const status = runPythonTests({
    env: { PYTHON: '/custom/python' },
    platform: 'win32',
    spawn(command, args, options) {
      invocation = { command, args, options };
      return { status: 23, signal: null };
    },
  });
  assert.equal(status, 23);
  assert.equal(invocation.command, '/custom/python');
  assert.deepEqual(invocation.args, ['-m', 'unittest', 'discover', '-s', 'tests/python', '-p', 'test_*.py']);
  assert.deepEqual(PYTHON_TEST_ARGS, invocation.args);
  assert.equal(invocation.options.stdio, 'inherit');
});

test('the Linux /proc fallback regression is explicitly skipped elsewhere', async () => {
  const auditTests = await readFile('tests/unit/audit-cleanup.test.mjs', 'utf8');
  assert.match(
    auditTests,
    /test\('the harness writes a complete fallback report for an unusable TMPDIR',\s*\{\s*skip:\s*process\.platform !== 'linux'/,
  );
});

test('obsolete minify shell path is removed rather than documented as supported', async () => {
  await assert.rejects(access('minify.sh', constants.F_OK));
  const readme = await readFile('README.md', 'utf8');
  assert.equal(readme.includes('minify.sh'), false);
  assert.equal(/npm run build[^\n]*régénère[^\n]*bundles/i.test(readme), false);
  assert.match(readme, /npm run generate:assets/);
});
