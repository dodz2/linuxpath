import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const PYTHON_TEST_ARGS = Object.freeze([
  '-m',
  'unittest',
  'discover',
  '-s',
  'tests/python',
  '-p',
  'test_*.py',
]);

export function selectPythonInterpreter(env = process.env, platform = process.platform) {
  return env.PYTHON || (platform === 'win32' ? 'python' : 'python3');
}

export function runPythonTests({
  env = process.env,
  platform = process.platform,
  spawn = spawnSync,
} = {}) {
  const interpreter = selectPythonInterpreter(env, platform);
  const result = spawn(interpreter, PYTHON_TEST_ARGS, {
    env,
    shell: false,
    stdio: 'inherit',
  });
  if (result.error) {
    console.error(`Impossible d'exécuter ${interpreter}: ${result.error.message}`);
  }
  return Number.isInteger(result.status) ? result.status : 1;
}

const isMain = process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) process.exitCode = runPythonTests();
