import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access, cp, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';

const npmCli = process.platform === 'win32'
  ? path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js')
  : null;
const npmCommand = npmCli ? process.execPath : 'npm';
const npmArgs = (args) => npmCli ? [npmCli, ...args] : args;

async function exists(path) {
  try { await access(path, constants.F_OK); return true; }
  catch { return false; }
}

test('README does not instruct the dead local minify workflow', async () => {
  const readme = await readFile('README.md', 'utf8');
  assert.equal(/bash minify\.sh/.test(readme), false, 'README still tells contributors to run minify.sh');
  assert.equal(/validation de minification/.test(readme), false, 'README still describes a minification-validation workflow');
  // the modern build path is documented instead
  assert.match(readme, /npm run build/);
});

test('the dead pre-commit hook script is removed', async () => {
  assert.equal(await exists('scripts/git-hooks/pre-commit'), false, 'scripts/git-hooks/pre-commit still exists');
});

test('known-failures.json no longer lists resolved defects as expected failures', async () => {
  const data = JSON.parse(await readFile('tests/known-failures.json', 'utf8'));
  assert.ok(Array.isArray(data.source), 'known-failures must keep a source array');
  assert.equal(data.source.length, 0, `expected failures remain: ${data.source.join(', ')}`);
});

test('generated minified bundles are never hidden from a fresh commit', async () => {
  const gitignore = await readFile('.gitignore', 'utf8');
  const rules = gitignore.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  assert.equal(rules.includes('assets/*.min.js'), false, 'new generated bundles would be silently omitted from git');
});

async function copyReleaseFixture() {
  const temporaryRoot = await mkdtemp(path.join(tmpdir(), 'linuxpath-release-fixture-'));
  const projectRoot = path.join(temporaryRoot, 'project');
  const excluded = new Set(['.git', 'dist', 'node_modules', 'test-results']);
  await cp(process.cwd(), projectRoot, {
    recursive: true,
    filter(source) {
      const relative = path.relative(process.cwd(), source);
      return !relative || !excluded.has(relative.split(path.sep)[0]);
    },
  });
  await symlink(path.resolve('node_modules'), path.join(projectRoot, 'node_modules'), 'dir');
  return { temporaryRoot, projectRoot };
}

test('the build rejects a divergent tracked bundle before writing it', async () => {
  const { temporaryRoot, projectRoot } = await copyReleaseFixture();
  const bundle = path.join(projectRoot, 'assets', 'app.min.js');
  const sentinel = 'window.__STALE_BUNDLE__=true;\n';
  try {
    await writeFile(bundle, sentinel);
    const result = spawnSync(npmCommand, npmArgs(['run', 'build']), {
      cwd: projectRoot,
      encoding: 'utf8',
      timeout: 120_000,
      maxBuffer: 50 * 1024 * 1024,
    });
    const output = `${result.stdout || ''}\n${result.stderr || ''}`;
    assert.notEqual(result.status, 0, `build repaired a divergent bundle instead of rejecting it:\n${output}`);
    assert.match(output, /bundle divergent/i);
    assert.equal(await readFile(bundle, 'utf8'), sentinel, 'build wrote the bundle before rejecting it');
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test('the generated asset repair command is explicit and separate from the strict build', async () => {
  const { temporaryRoot, projectRoot } = await copyReleaseFixture();
  const bundle = path.join(projectRoot, 'assets', 'app.min.js');
  try {
    await writeFile(bundle, 'window.__STALE_BUNDLE__=true;\n');
    const result = spawnSync(npmCommand, npmArgs(['run', 'generate:assets']), {
      cwd: projectRoot,
      encoding: 'utf8',
      timeout: 120_000,
      maxBuffer: 50 * 1024 * 1024,
    });
    assert.equal(result.status, 0, `asset generator failed:\n${result.stdout}\n${result.stderr}`);
    const { renderGeneratedAsset } = await import('../../scripts/lib/generated-assets.mjs');
    assert.equal(await readFile(bundle, 'utf8'), await renderGeneratedAsset(path.join(projectRoot, 'assets', 'app.js')));
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test('the full suite qualifies generated assets and source E2E before build', async () => {
  const source = await readFile('scripts/run-suite.mjs', 'utf8');
  const phaseIndex = (name) => source.indexOf(`run('${name}'`);
  assert.ok(phaseIndex('generated-assets') >= 0, 'generated asset qualification phase is missing');
  assert.ok(phaseIndex('e2e-source') >= 0, 'source E2E phase is missing');
  assert.ok(phaseIndex('build') >= 0, 'build phase is missing');
  assert.ok(phaseIndex('generated-assets') < phaseIndex('e2e-source'), 'bundles are not qualified before source E2E');
  assert.ok(phaseIndex('e2e-source') < phaseIndex('build'), 'source E2E does not precede the mutating build');
});

test('the full suite gives exhaustive E2E phases a ten-minute budget', async () => {
  const source = await readFile('scripts/run-suite.mjs', 'utf8');
  assert.match(source, /const e2eTimeoutMs = 600_000;/);
  for (const phase of ['e2e-source', 'e2e-dist', 'e2e-offline']) {
    const escaped = phase.replace('-', '\\-');
    assert.match(source, new RegExp(`run\\('${escaped}'[^;]+\\{ timeoutMs: e2eTimeoutMs \\}\\);`), `${phase} still uses the three-minute default timeout`);
  }
});

test('the build synchronizes served minified bundles and drops sources from dist', async () => {
  const { readdir } = await import('node:fs/promises');
  const { renderGeneratedAsset } = await import('../../scripts/lib/generated-assets.mjs');
  const { temporaryRoot, projectRoot } = await copyReleaseFixture();
  try {
    const result = spawnSync(npmCommand, npmArgs(['run', 'build']), {
      cwd: projectRoot,
      env: { ...process.env, SOURCE_COMMIT: '1'.repeat(40), GITHUB_SHA: '' },
      encoding: 'utf8',
      timeout: 120_000,
      maxBuffer: 50 * 1024 * 1024,
    });
    assert.equal(result.status, 0, `build failed:\n${result.stdout}\n${result.stderr}`);
    const files = await readdir(path.join(projectRoot, 'dist', 'assets'));
    const unminified = files.filter((name) => name.endsWith('.js') && !name.endsWith('.min.js'));
    assert.deepEqual(unminified, [], `dist/assets still ships unminified sources: ${unminified.join(', ')}`);
    const sources = (await readdir(path.join(projectRoot, 'assets')))
      .filter((name) => name.endsWith('.js') && !name.endsWith('.min.js'));
    for (const sourceName of sources) {
      const expected = await renderGeneratedAsset(path.join(projectRoot, 'assets', sourceName));
      const minifiedName = sourceName.replace(/\.js$/, '.min.js');
      assert.equal(await readFile(path.join(projectRoot, 'assets', minifiedName), 'utf8'), expected, `${minifiedName} is stale at the project root`);
      assert.equal(await readFile(path.join(projectRoot, 'dist', 'assets', minifiedName), 'utf8'), expected, `${minifiedName} differs between root and dist`);
    }
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test('the build rejects a stale README without changing a single byte', async () => {
  const { temporaryRoot, projectRoot } = await copyReleaseFixture();
  try {
    assert.equal(spawnSync('git', ['init', '-q'], { cwd: projectRoot }).status, 0);
    assert.equal(spawnSync('git', ['add', '-f', '.'], { cwd: projectRoot }).status, 0);
    const readmePath = path.join(projectRoot, 'README.md');
    const currentReadme = await readFile(readmePath, 'utf8');
    const staleReadme = currentReadme.replace('- 19 modules', '- 18 modules');
    assert.notEqual(staleReadme, currentReadme, 'README fixture did not become stale');
    const staleBytes = Buffer.from(staleReadme, 'utf8');
    await writeFile(readmePath, staleBytes);
    const result = spawnSync(npmCommand, npmArgs(['run', 'build']), {
      cwd: projectRoot,
      env: { ...process.env, SOURCE_COMMIT: '2'.repeat(40), GITHUB_SHA: '' },
      encoding: 'utf8',
      timeout: 120_000,
      maxBuffer: 50 * 1024 * 1024,
    });
    const output = `${result.stdout || ''}\n${result.stderr || ''}`;
    assert.notEqual(result.status, 0, `build silently accepted a stale README:\n${output}`);
    assert.match(output, /README\.md/i);
    assert.deepEqual(await readFile(readmePath), staleBytes, 'failed build rewrote README.md');
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test('README regeneration remains an explicit command separate from build', async () => {
  const { temporaryRoot, projectRoot } = await copyReleaseFixture();
  try {
    const readmePath = path.join(projectRoot, 'README.md');
    const currentReadme = await readFile(readmePath, 'utf8');
    await writeFile(readmePath, currentReadme.replace('- 19 modules', '- 18 modules'));
    const result = spawnSync(npmCommand, npmArgs(['run', 'generate:readme']), {
      cwd: projectRoot,
      encoding: 'utf8',
      timeout: 120_000,
      maxBuffer: 50 * 1024 * 1024,
    });
    assert.equal(result.status, 0, `README generator failed:\n${result.stdout}\n${result.stderr}`);
    assert.equal(await readFile(readmePath, 'utf8'), currentReadme);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test('the harness suite verifies and cleans up its self-marker', async () => {
  const { rm, readdir } = await import('node:fs/promises');
  // clean any leftover marker from previous runs
  for (const entry of await readdir(tmpdir())) {
    if (entry.startsWith('linuxpath-harness-marker-')) await rm(`${tmpdir()}/${entry}`, { force: true });
  }
  const result = spawnSync(process.execPath, ['scripts/run-suite.mjs', 'harness'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    timeout: 120_000,
    maxBuffer: 50 * 1024 * 1024,
  });
  assert.equal(result.status, 0, `harness suite failed:\n${result.stdout}\n${result.stderr}`);
  // the marker must be gone after the run (cleaned up, not leaked in tmpdir)
  const leftovers = (await readdir(tmpdir())).filter((entry) => entry.startsWith('linuxpath-harness-marker-'));
  assert.deepEqual(leftovers, [], `harness-self-marker leaked marker(s) in tmpdir: ${leftovers.join(', ')}`);
});

test('the harness writes a complete fallback report for an unusable TMPDIR', {
  skip: process.platform !== 'linux' ? 'requires Linux /proc semantics' : false,
}, async () => {
  const { readdir } = await import('node:fs/promises');
  const fallbackRoot = await mkdtemp('/tmp/linuxpath-report-fallback-test-');
  try {
    const result = spawnSync(process.execPath, ['scripts/run-suite.mjs', 'harness'], {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: {
        ...process.env,
        TMPDIR: '/proc',
        LINUXPATH_REPORT_FALLBACK_DIR: fallbackRoot,
      },
      timeout: 120_000,
      maxBuffer: 50 * 1024 * 1024,
    });
    assert.equal(result.status, 2, `expected infrastructure exit 2:\n${result.stdout}\n${result.stderr}`);
    const reports = (await readdir(fallbackRoot)).filter((name) => name.endsWith('.json'));
    assert.equal(reports.length, 1, `expected one fallback report, got: ${reports.join(', ')}`);
    const artifactPath = path.join(fallbackRoot, reports[0]);
    const report = JSON.parse(await readFile(artifactPath, 'utf8'));
    assert.equal(report.status, 'infra_error');
    assert.equal(report.artifactPath, artifactPath);
    assert.equal(report.runtime.node, process.version);
    assert.match(report.runtime.npm, /^\d+\.\d+\.\d+/);
    assert.equal(report.runtime.python, '3.13.5');
    assert.equal(report.runtime.uv, '0.11.6');
    assert.ok(report.results.some((entry) => entry.status === 'infra_error'));
    for (const entry of report.results) {
      assert.deepEqual(Object.keys(entry).sort(), [
        'command', 'durationMs', 'exitCode', 'name', 'signal', 'status', 'stderr', 'stdout',
      ]);
    }
    assert.match(report.results.map((entry) => entry.stderr).join('\n'), /\/proc/);
  } finally {
    await rm(fallbackRoot, { recursive: true, force: true });
  }
});
