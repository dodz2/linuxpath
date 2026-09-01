import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { validateToolchain } from './lib/toolchain.mjs';
import { selectPythonInterpreter } from './run-python-tests.mjs';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const expected = {
  node: pkg.engines?.node,
  npm: pkg.engines?.npm,
  python: pkg.toolchain?.python,
  uv: pkg.toolchain?.uv,
};
const npmCli = process.env.npm_execpath || (process.platform === 'win32'
  ? path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js')
  : null);
const npmCommand = npmCli ? process.execPath : 'npm';
const npmArgs = npmCli ? [npmCli, '--version'] : ['--version'];

function commandVersion(command, args) {
  const commandResult = spawnSync(command, args, {
    encoding: 'utf8',
    timeout: 2_000,
    maxBuffer: 1024 * 1024,
  });
  return commandResult.status === 0
    ? `${commandResult.stdout || ''}${commandResult.stderr || ''}`.trim()
    : '';
}

const result = validateToolchain({
  node: process.version,
  npm: commandVersion(npmCommand, npmArgs),
  python: commandVersion(selectPythonInterpreter(), ['--version']),
  uv: commandVersion('uv', ['--version']),
}, expected);

if (!result.ok) {
  for (const error of result.errors) console.error(error);
  process.exitCode = 1;
} else {
  console.log(`Toolchain qualifié : Node ${expected.node}, npm ${expected.npm}, Python ${expected.python}, uv ${expected.uv}`);
}
