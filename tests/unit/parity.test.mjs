import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { loadJson } from '../../scripts/lib/content-validation.mjs';
import { evaluateValidator as libEvaluate } from '../../scripts/lib/exercise-validators.mjs';
import { runShell } from '../../scripts/lib/shell-exec.mjs';
import { applyVfsOverlay as libOverlay, evaluateReport as libReport, sanitizeVariantProgress as libSanitize } from '../../scripts/lib/exercise-variants.mjs';

const clone = (value) => JSON.parse(JSON.stringify(value));

test('browser and Node variant helpers agree on overlays and report verdicts', async () => {
  const [source, variants, exercises, vfs] = await Promise.all([
    readFile('assets/exercise-variants.js', 'utf8'),
    loadJson('data/exercise-variants.json'),
    loadJson('data/exercises.json'),
    loadJson('data/vfs.json'),
  ]);
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: 'assets/exercise-variants.js' });
  const variant = variants.groups['m14-dfir'].variants[0];
  const fields = exercises.m14.find((entry) => entry.id === 'm14-e1').reportFields;
  const answer = variant.exercises['m14-e1'].answer;
  assert.deepEqual(clone(sandbox.applyVfsOverlay(vfs, variant.vfsOverlay)), libOverlay(vfs, variant.vfsOverlay));
  assert.deepEqual(clone(sandbox.evaluateReport(fields, answer, answer)), libReport(fields, answer, answer));
  const progress = { assignments: { 'm14-dfir': variant.id }, results: { 'm14-e1': { solvedVariants: [variant.id, 'bogus'], attemptsByVariant: { [variant.id]: 2 } } } };
  assert.deepEqual(clone(sandbox.sanitizeVariantProgress(progress, variants)), libSanitize(progress, variants));
});

// Charge l'implémentation navigateur (assets/exercise-validators.js) dans un
// contexte vm : elle expose `evaluateValidator` en fonction globale.
async function loadAssetEvaluate() {
  const source = await readFile('assets/exercise-validators.js', 'utf8');
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: 'assets/exercise-validators.js' });
  return sandbox.evaluateValidator;
}

test('the browser exercise validator agrees with the library validator on every validator and context', async () => {
  const [exercises, vfs, assetEvaluate] = await Promise.all([
    loadJson('data/exercises.json'),
    loadJson('data/vfs.json'),
    loadAssetEvaluate(),
  ]);
  const validators = Object.values(exercises).flat().map((exercise) => exercise.validator);
  assert.ok(validators.length >= 46);

  // corpus de contextes : exit 0/1/2, stdout variés, raw présent/absent, vfs réel ou minime
  const contexts = [
    { exitCode: 0, stdout: ['notes.txt', 'script.sh'], stderr: [], cwd: '/home/user', vfs, raw: 'ls /home/user/scripts' },
    { exitCode: 0, stdout: ['PING google.com (142.250.74.46)', '64 bytes'], stderr: [], cwd: '/home/user', vfs, raw: 'ping -c 4 google.com' },
    { exitCode: 1, stdout: [], stderr: ['La commande a échoué'], cwd: '/home/user', vfs, raw: 'ls' },
    { exitCode: 2, stdout: [], stderr: ['bash: syntaxe non supportée'], cwd: '/home/user', vfs, raw: 'ls && cat x' },
    { exitCode: 0, stdout: ['/home/user'], stderr: [], cwd: '/home/user', vfs, raw: '' }, // raw absent
    { exitCode: 0, stdout: ['crwd'], stderr: [], cwd: '/tmp', vfs: {}, raw: 'cd /tmp' },
    { exitCode: 0, stdout: ['https://c2.training.invalid/callback'], stderr: [], cwd: '/home/user', vfs, raw: 'strings -a malware.bin | grep -i http', commands: ['strings', 'grep'] },
    { exitCode: 0, stdout: ['https://c2.training.invalid/callback'], stderr: [], cwd: '/home/user', vfs, raw: 'strings -a malware.bin', commands: ['strings'] },
  ];

  const disagreements = [];
  for (let vi = 0; vi < validators.length; vi += 1) {
    const validator = validators[vi];
    for (let ci = 0; ci < contexts.length; ci += 1) {
      const ctx = contexts[ci];
      const lib = libEvaluate(validator, ctx);
      const asset = assetEvaluate(validator, ctx);
      if (lib.ok !== asset.ok || lib.reason !== asset.reason) {
        disagreements.push({ validatorIndex: vi, contextIndex: ci, lib, asset });
      }
    }
  }
  assert.deepEqual(disagreements, []);
});
// Charge le moteur de terminal navigateur (assets/terminal-core.js) dans un
// contexte vm. `print`/`cmdEcho`/`updatePromptLabel` sortent tôt quand l'élément
// DOM est absent, donc un `document` qui renvoie toujours null suffit : aucune
// sortie n'est écrite, mais `exec()` retourne bien le résultat structuré.
async function loadTerminalEngine() {
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

test('the browser terminal engine agrees with the shell-exec library on the core command set', async () => {
  const [vfs, createTerminalEngine] = await Promise.all([
    loadJson('data/vfs.json'),
    loadTerminalEngine(),
  ]);

  // Corpus : commandes de base, cas d'erreur structurés, pipes, et surtout les
  // formes réparées par les passes récentes (ls -l, cd ~/, --ignore-case,
  // redirection d'entrée) — celles qui ont été portées deux fois à la main.
  const commands = [
    'ls', 'ls -a', 'ls -l', 'ls -la', 'ls -l /home/user/scripts', 'ls /nope', 'ls -la /home/user/scripts/script.sh',
    'pwd', 'cd /tmp', 'cd ~', 'cd ~/', 'cd ..', 'cd /nope', 'cd -',
    'cat readme.txt', 'cat /nope', 'cat /home/user', 'cat readme.txt </dev/null',
    'grep -i error /var/log/syslog', 'grep --ignore-case error /var/log/syslog', 'grep zzz readme.txt',
    "grep -E 'Failed password|Accepted (publickey|password)' /var/log/auth.log | tail -20",
    "grep -E 'Failed password|Accepted publickey' /var/log/auth.log /var/log/auth.log",
    'mkdir -v projets', 'mkdir', 'chmod 644 readme.txt', 'chmod 755 scripts/script.sh',
    'find /home/user -name "*.txt"', 'echo bonjour', 'whoami',
    'ls | grep e', 'cat readme.txt | grep -i linux',
    'echo hi > fichier', 'ls && pwd', 'ls; pwd', 'cat `ls`',
    'nosuchcommand', '', '   ', 'ls "non fermé',
  ];

  const normalize = (result) => ({
    exitCode: result.exitCode,
    stdout: result.stdout || [],
    stderr: result.stderr || [],
    cwd: result.cwd,
    errorCode: result.errorCode ?? null,
  });

  const disagreements = [];
  for (const command of commands) {
    const libResult = runShell({ vfs: clone(vfs), cwd: '/home/user', command });
    const engine = createTerminalEngine({
      vfs: clone(vfs),
      outputElId: 'terminal-output',
      inputElId: 'terminal-input',
      promptLabelElId: 'terminal-prompt',
      promptFn: () => '$',
    });
    const engineResult = engine.exec(command);
    const lib = normalize(libResult);
    const asset = normalize(engineResult);
    if (JSON.stringify(lib) !== JSON.stringify(asset)) {
      disagreements.push({ command, lib, asset });
    }
  }
  assert.deepEqual(disagreements, []);
});
