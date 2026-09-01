import { access, mkdir, rm, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { selectPythonInterpreter } from './run-python-tests.mjs';

const requestedMode = process.argv[2] || 'all';
const validModes = new Set(['harness', 'static', 'all']);
const mode = validModes.has(requestedMode) ? requestedMode : 'invalid';
const results = [];
const suiteStarted = performance.now();
const npmCli = process.platform === 'win32'
  ? path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js')
  : null;
const npmCommand = npmCli ? process.execPath : 'npm';
const npmArgs = (args) => npmCli ? [npmCli, ...args] : args;
const e2eTimeoutMs = 600_000;
const npmVersionResult = spawnSync(npmCommand, npmArgs(['--version']), {
  encoding: 'utf8',
  timeout: 2_000,
  maxBuffer: 1024 * 1024,
});
const declaredNpmVersion = (() => {
  try {
    const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    return String(packageJson.packageManager || '').match(/^npm@(.+)$/)?.[1] || 'unavailable';
  } catch {
    return 'unavailable';
  }
})();
const npmVersion = npmVersionResult.status === 0 ? npmVersionResult.stdout.trim() : declaredNpmVersion;
function commandVersion(command, args) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    timeout: 2_000,
    maxBuffer: 1024 * 1024,
  });
  return result.status === 0 ? `${result.stdout || ''}${result.stderr || ''}`.trim() : 'unavailable';
}
const pythonVersion = commandVersion(selectPythonInterpreter(), ['--version'])
  .replace(/^Python\s+/i, '').split(/\s+/)[0];
const uvVersion = commandVersion('uv', ['--version'])
  .replace(/^uv\s+/i, '').split(/\s+/)[0];
let finalizationPromise = null;
let receivedSignal = null;

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
  const stdout = result.stdout || '';
  const stderr = [result.stderr || '', result.error ? String(result.error.stack || result.error) : '']
    .filter(Boolean)
    .join('\n');
  if (stdout) process.stdout.write(stdout);
  if (stderr) process.stderr.write(stderr.endsWith('\n') ? stderr : `${stderr}\n`);
  const exitCode = result.status;
  const signal = result.signal;
  let status = 'pass';
  if (signal || result.error) status = 'infra_error';
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
    stdout,
    stderr,
  };
  results.push(entry);
  return entry;
}

function recordInfrastructureError(name, error, command = '') {
  const stderr = String(error?.stack || error || 'Unknown infrastructure error');
  console.error(stderr);
  const entry = {
    name,
    command,
    exitCode: 2,
    signal: receivedSignal,
    status: 'infra_error',
    durationMs: 0,
    stdout: '',
    stderr,
  };
  results.push(entry);
  return entry;
}

function primaryReportRoot() {
  return path.resolve(process.env.LINUXPATH_REPORT_DIR || path.join(process.cwd(), 'test-results'));
}

function fallbackReportRoot() {
  if (process.env.LINUXPATH_REPORT_FALLBACK_DIR) {
    return path.resolve(process.env.LINUXPATH_REPORT_FALLBACK_DIR);
  }
  if (process.env.RUNNER_TEMP) {
    return path.resolve(process.env.RUNNER_TEMP, 'linuxpath-test-results');
  }
  if (process.platform === 'win32') {
    return path.resolve(process.env.TEMP || 'C:\\Temp', 'linuxpath-test-results');
  }
  // Ne jamais réutiliser os.tmpdir() ici : TMPDIR peut être précisément la
  // cause de l'erreur d'infrastructure que la finalisation doit documenter.
  return '/tmp/linuxpath-test-results';
}

function buildReport(code) {
  const passed = results.filter((entry) => entry.status === 'pass').length;
  const failed = results.filter((entry) => entry.status === 'fail').length;
  const infra = results.filter((entry) => ['infra_error', 'timeout', 'blocked'].includes(entry.status)).length;
  return {
    schemaVersion: 3,
    mode,
    status: infra > 0 || code === 2 ? 'infra_error' : failed > 0 || code !== 0 ? 'fail' : 'pass',
    runtime: { node: process.version, npm: npmVersion, python: pythonVersion, uv: uvVersion },
    durationMs: Math.round(performance.now() - suiteStarted),
    exitCode: code,
    signal: receivedSignal,
    artifactPath: null,
    passed,
    failed,
    infra,
    results,
  };
}

async function persistReport(report, forceFallback) {
  const primary = primaryReportRoot();
  const fallback = fallbackReportRoot();
  const roots = forceFallback || primary === fallback ? [fallback] : [primary, fallback];
  const failures = [];
  for (const root of roots) {
    const artifactPath = path.join(root, `phase0-${mode}-suite.json`);
    try {
      await mkdir(root, { recursive: true });
      report.artifactPath = artifactPath;
      await writeFile(artifactPath, `${JSON.stringify(report, null, 2)}\n`);
      return artifactPath;
    } catch (error) {
      failures.push(`${artifactPath}: ${error.code || error.message || error}`);
    }
  }
  report.artifactPath = null;
  console.error(`Impossible d'écrire le rapport d'agrégation : ${failures.join('; ')}`);
  return null;
}

async function finalize(code, options = {}) {
  if (finalizationPromise) return finalizationPromise;
  if (options.signal) receivedSignal = options.signal;
  finalizationPromise = (async () => {
    const report = buildReport(code);
    const artifactPath = await persistReport(report, options.forceFallback === true);
    console.log(`\n${'='.repeat(72)}\nPHASE 0 AGGREGATE\n${JSON.stringify(report, null, 2)}`);
    if (artifactPath) console.log(`PHASE 0 REPORT: ${artifactPath}`);
    process.exitCode = code;
    return report;
  })();
  return finalizationPromise;
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    if (finalizationPromise) return;
    receivedSignal = signal;
    recordInfrastructureError('suite-signal', new Error(`Suite interrompue par ${signal}`));
    const code = signal === 'SIGINT' ? 130 : 143;
    void finalize(code, { signal }).finally(() => process.exit(code));
  });
}

async function main() {
  if (!validModes.has(requestedMode)) {
    console.error('Usage: node scripts/run-suite.mjs [harness|static|all]');
    recordInfrastructureError('suite-arguments', new Error(`Mode de suite inconnu : ${requestedMode}`));
    await finalize(2);
    return;
  }

  const marker = path.join(tmpdir(), `linuxpath-harness-marker-${process.pid}`);
  let forceFallback = false;
  try {
    try {
      await rm(marker, { force: true });
    } catch (error) {
      forceFallback = true;
      throw error;
    }
    run('harness-self-fail', process.execPath, ['-e', 'process.exit(1)'], { expectFail: true, timeoutMs: 10_000 });
    run('harness-self-marker', process.execPath, ['-e', `require('fs').writeFileSync(${JSON.stringify(marker)}, 'ok')`], { timeoutMs: 10_000 });
    try {
      await access(marker);
      await rm(marker, { force: true });
    } catch (error) {
      forceFallback = true;
      throw new Error(`harness-self-marker n'a pas créé ${marker} (${error.code || error})`, { cause: error });
    }

    run('syntax', npmCommand, npmArgs(['run', 'validate:syntax']));
    run('engines', process.execPath, ['scripts/check-toolchain.mjs']);
    run('e2e-list', npmCommand, npmArgs(['run', 'test:e2e:list']));

    if (mode !== 'harness') {
      run('generated-assets', npmCommand, npmArgs(['run', 'check:generated-assets']));
      run('html', npmCommand, npmArgs(['run', 'validate:html']));
      run('data', npmCommand, npmArgs(['run', 'validate:data']));
      run('references', npmCommand, npmArgs(['run', 'validate:references']));
      run('unit', npmCommand, npmArgs(['run', 'test:unit']));
      run('python-unit', npmCommand, npmArgs(['run', 'test:python']));
      run('python-lint', npmCommand, npmArgs(['run', 'lint:python']));
      if (mode === 'all') {
        run('e2e-source', npmCommand, npmArgs(['run', 'test:e2e']), { timeoutMs: e2eTimeoutMs });
      }
      run('build', npmCommand, npmArgs(['run', 'build']));
    }
    if (mode === 'all') {
      run('e2e-dist', npmCommand, npmArgs(['run', 'test:e2e:dist']), { timeoutMs: e2eTimeoutMs });
      run('e2e-offline', npmCommand, npmArgs(['run', 'test:e2e:offline']), { timeoutMs: e2eTimeoutMs });
    }
  } catch (error) {
    recordInfrastructureError('suite-infrastructure', error, `${process.execPath} scripts/run-suite.mjs ${mode}`);
    await finalize(2, { forceFallback });
    return;
  }

  const infra = results.some((entry) => ['infra_error', 'timeout', 'blocked'].includes(entry.status));
  const failed = results.some((entry) => entry.status === 'fail');
  await finalize(infra ? 2 : failed ? 1 : 0);
}

await main();
