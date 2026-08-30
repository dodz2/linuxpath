import { mkdir, writeFile, rm, access } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { tmpdir } from 'node:os';
import path from 'node:path';

const mode = process.argv[2] || 'all';
if (!['harness', 'static', 'all'].includes(mode)) {
  console.error('Usage: node scripts/run-suite.mjs [harness|static|all]');
  process.exit(2);
}

const results = [];
let interrupted = false;
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    interrupted = true;
    finalize(signal === 'SIGINT' ? 130 : 143);
  });
}

function run(name, command, args, options = {}) {
  console.log(`\n${'='.repeat(72)}\nPHASE 0 SUITE: ${name}\n${'='.repeat(72)}`);
  const started = performance.now();
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: { ...process.env, ...options.env },
    maxBuffer: 50 * 1024 * 1024,
    timeout: options.timeoutMs || 180_000,
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  const exitCode = result.status;
  const signal = result.signal;
  let status = 'pass';
  if (signal) status = 'infra_error';
  else if (result.error) status = 'infra_error';
  else if (exitCode === null) status = 'timeout';
  else if (options.expectFail) status = exitCode === 0 ? 'fail' : 'pass';
  else if (exitCode === 0) status = 'pass';
  else if (exitCode === 2) status = 'infra_error';
  else status = 'fail';
  const entry = {
    name,
    command: `${command} ${args.join(' ')}`.trim(),
    exitCode: exitCode ?? 1,
    signal,
    status,
    durationMs: Math.round(performance.now() - started),
  };
  results.push(entry);
  return entry;
}

async function finalize(code) {
  const report = {
    schemaVersion: 2,
    mode,
    node: process.version,
    passed: results.filter((entry) => entry.status === 'pass').length,
    failed: results.filter((entry) => entry.status === 'fail').length,
    infra: results.filter((entry) => ['infra_error', 'timeout', 'blocked'].includes(entry.status)).length,
    results,
  };
  await mkdir('test-results', { recursive: true });
  await writeFile(`test-results/phase0-${mode}-suite.json`, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`\n${'='.repeat(72)}\nPHASE 0 AGGREGATE\n${JSON.stringify(report, null, 2)}`);
  process.exit(code);
}

const marker = path.join(tmpdir(), `linuxpath-harness-marker-${process.pid}`);
await rm(marker, { force: true });
run('harness-self-fail', process.execPath, ['-e', 'process.exit(1)'], { expectFail: true, timeoutMs: 10_000 });
run('harness-self-marker', process.execPath, ['-e', `require('fs').writeFileSync(${JSON.stringify(marker)}, 'ok')` ], { timeoutMs: 10_000 });
// Le harnais doit prouver que le marker a réellement été écrit, puis le nettoyer
// (sinon les runs successifs laissent des fichiers dans tmpdir).
try {
  await access(marker);
  await rm(marker, { force: true });
} catch (error) {
  console.error(`\nPHASE 0 SUITE: harness-self-marker n'a pas créé ${marker} (${error.code || error}) — suite interrompue.`);
  process.exit(2);
}
run('syntax', 'npm', ['run', 'validate:syntax']);
run('engines', process.execPath, ['-e', 'const major=+process.versions.node.split(".")[0]; if (major<22) { console.error("Node >=22 required"); process.exit(2); }']);
run('e2e-list', 'npm', ['run', 'test:e2e:list']);

if (mode !== 'harness') {
  run('html', 'npm', ['run', 'validate:html']);
  run('data', 'npm', ['run', 'validate:data']);
  run('references', 'npm', ['run', 'validate:references']);
  run('unit', 'npm', ['run', 'test:unit']);
  run('build', 'npm', ['run', 'build']);
}
if (mode === 'all') {
  run('e2e-source', 'npm', ['run', 'test:e2e']);
  run('e2e-dist', 'npm', ['run', 'test:e2e:dist']);
  run('e2e-offline', 'npm', ['run', 'test:e2e:offline']);
}

if (interrupted) await finalize(130);
const infra = results.some((entry) => ['infra_error', 'timeout', 'blocked'].includes(entry.status));
const failed = results.some((entry) => entry.status === 'fail');
await finalize(infra ? 2 : failed ? 1 : 0);
