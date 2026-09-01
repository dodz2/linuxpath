import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { findDanglingVfsReferences } from '../../scripts/lib/content-validation.mjs';
import { parseCommandLine, runShell, tokenize } from '../../scripts/lib/shell-exec.mjs';

const vfs = JSON.parse(await readFile('data/vfs.json', 'utf8'));
const ctfCatalogue = JSON.parse(await readFile('data/ctf.json', 'utf8'));

function cloneVfs() {
  return structuredClone(vfs);
}

function exec(command, options = {}) {
  return runShell({
    vfs: options.vfs || cloneVfs(),
    cwd: options.cwd || '/home/user',
    command,
    permCheck: options.permCheck === true,
    recursiveFind: options.recursiveFind !== false,
  });
}

async function loadBrowserTerminalEngine() {
  const [utils, core] = await Promise.all([
    readFile('assets/utils.js', 'utf8'),
    readFile('assets/terminal-core.js', 'utf8'),
  ]);
  const sandbox = { document: { getElementById: () => null } };
  vm.createContext(sandbox);
  vm.runInContext(utils, sandbox, { filename: 'assets/utils.js' });
  vm.runInContext(core, sandbox, { filename: 'assets/terminal-core.js' });
  return sandbox.createTerminalEngine;
}

test('browser extra-command dispatch ignores Object prototype names', async () => {
  const createTerminalEngine = await loadBrowserTerminalEngine();
  const inheritedRegistry = Object.create({ inherited: () => ({
    exitCode: 0,
    stdout: ['must not execute'],
    stderr: [],
    stateChanges: [],
  }) });
  const engine = createTerminalEngine({
    vfs: cloneVfs(),
    outputElId: 'terminal-output',
    inputElId: 'terminal-input',
    promptLabelElId: 'terminal-prompt',
    promptFn: () => '$',
    extraCommands: inheritedRegistry,
  });

  for (const command of ['__proto__', 'constructor', 'toString', 'inherited']) {
    let result;
    assert.doesNotThrow(() => { result = engine.runStructured(command); }, command);
    assert.equal(result.exitCode, 127, command);
    assert.match(result.stderr.join('\n'), /commande introuvable/, command);
  }
});

test('tokenize keeps quoted arguments and splits pipes', () => {
  assert.deepEqual(tokenize('grep "#" /tmp/a'), ['grep', '#', '/tmp/a']);
  assert.deepEqual(tokenize("echo 'abc' | base64 -d"), ['echo', 'abc', '|', 'base64', '-d']);
});

test('unsupported shell syntax is rejected with a structured error', () => {
  const result = parseCommandLine('ls && cat readme.txt');
  assert.equal(result.ok, false);
  assert.equal(result.exitCode > 0, true);
  assert.ok(result.stderr[0]);
});

test('exec returns the documented contract', () => {
  const result = exec('pwd');
  assert.equal(result.exitCode, 0);
  assert.ok(Array.isArray(result.stdout));
  assert.ok(Array.isArray(result.stderr));
  assert.equal(result.cwd, '/home/user');
  assert.ok(Array.isArray(result.stateChanges));
  assert.deepEqual(result.stdout, ['/home/user']);
});

test('ls and cat describe the same filesystem', () => {
  const listed = exec('ls /home/user/documents');
  assert.equal(listed.exitCode, 0);
  assert.ok(listed.stdout.includes('notes.txt'));
  const cat = exec('cat /home/user/documents/notes.txt');
  assert.equal(cat.exitCode, 0);
  assert.ok(cat.stdout.join('\n').includes('ls : lister'));
  const missing = exec('cat /home/user/documents/missing.txt');
  assert.notEqual(missing.exitCode, 0);
  assert.ok(missing.stderr.length > 0);
  assert.ok(missing.errorCode);
});

test('ls -l prints VFS permission bits instead of bare names', () => {
  const listed = exec('ls -l /home/user/scripts/script.sh');
  assert.equal(listed.exitCode, 0);
  const text = listed.stdout.join('\n');
  assert.match(text, /-rw-r--r--/);
  assert.match(text, /script\.sh/);
  const longDir = exec('ls -l /home/user/scripts');
  assert.match(longDir.stdout.join('\n'), /-rwxr-xr-x/);
  assert.match(longDir.stdout.join('\n'), /backup\.sh/);
  const plain = exec('ls /home/user/scripts');
  assert.ok(plain.stdout.includes('script.sh'));
  assert.equal(plain.stdout.some((line) => line.includes('-rw')), false);
});

test('mkdir cd chmod find grep echo report structured errors', () => {
  const vfsCopy = cloneVfs();
  const made = runShell({ vfs: vfsCopy, cwd: '/home/user', command: 'mkdir -v tmpdir' });
  assert.equal(made.exitCode, 0);
  assert.ok(made.stdout.some((line) => line.includes('tmpdir')));
  const exists = runShell({ vfs: vfsCopy, cwd: '/home/user', command: 'mkdir tmpdir' });
  assert.notEqual(exists.exitCode, 0);
  const cd = exec('cd /no/such');
  assert.notEqual(cd.exitCode, 0);
  const chmod = exec('chmod +x missing.sh');
  assert.notEqual(chmod.exitCode, 0);
  const grep = exec('grep nowhere /home/user/readme.txt');
  assert.equal(grep.exitCode, 1);
  const echo = exec('echo hello');
  assert.deepEqual(echo.stdout, ['hello']);
  const find = exec('find /home/user/scripts -name script.sh', { recursiveFind: true });
  assert.ok(find.stdout.some((line) => line.endsWith('script.sh')));
});

test('echo pipes into base64 -d and grep pipes into cut and awk', () => {
  const decoded = exec("echo 'ZmxhZw==' | base64 -d");
  assert.equal(decoded.exitCode, 0);
  assert.equal(decoded.stdout.join(''), 'flag');
  const cut = exec('grep Session /var/log/syslog | cut -d " " -f 1');
  assert.equal(cut.exitCode, 0);
  assert.ok(cut.stdout.length > 0);
  const awk = exec('grep Session /var/log/syslog | awk \'{print $1}\'');
  assert.equal(awk.exitCode, 0);
  assert.ok(awk.stdout.length > 0);
});

test('ctf-06 cut accepts documented attached delimiter and field options', () => {
  const challenge = ctfCatalogue.challenges.find((entry) => entry.id === 'ctf-06');
  const result = exec("grep '203.0.113.99' /var/log/syslog | cut -d= -f2", {
    vfs: structuredClone(challenge.vfs),
  });
  assert.equal(result.exitCode, 0);
  assert.deepEqual(result.stdout, ['flag{', 'network_', 'exfiltration_', 'trace}']);
});

test('grep reads multiple log files and prefixes their names', () => {
  const result = exec("grep -E 'Failed password|Accepted publickey' /var/log/auth.log /var/log/auth.log");
  assert.equal(result.exitCode, 0);
  assert.match(result.stdout.join('\n'), /\/var\/log\/auth\.log:/);
  assert.match(result.stdout.join('\n'), /Failed password/);
});

test('an unknown command returns a non-zero exit code', () => {
  const result = exec('definitely-not-a-command');
  assert.notEqual(result.exitCode, 0);
  assert.equal(result.exitCode, 127);
  assert.match(result.stderr.join('\n'), /commande introuvable/);
});

test('the published VFS graph is closed', () => {
  assert.equal(findDanglingVfsReferences(vfs).length, 0);
});

test('pedagogical usage errors use the same structured non-zero contract', () => {
  for (const command of ['cp', 'mv', 'chown', 'head', 'service ssh start', 'systemctl status']) {
    const result = exec(command);
    assert.notEqual(result.exitCode, 0, command);
    assert.deepEqual(result.stdout, [], command);
    assert.ok(result.stderr.length > 0, command);
    assert.ok(Array.isArray(result.stateChanges), command);
  }
});

test('Node shell execution delegates to the shipped browser terminal runtime', async () => {
  const source = await readFile('scripts/lib/shell-exec.mjs', 'utf8');
  assert.match(source, /browser-terminal-runtime\.mjs/);
  assert.doesNotMatch(source, /function runCommand\s*\(/);
});
