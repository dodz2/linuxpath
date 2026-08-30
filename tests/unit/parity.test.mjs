import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { loadJson } from '../../scripts/lib/content-validation.mjs';
import { evaluateValidator as libEvaluate } from '../../scripts/lib/exercise-validators.mjs';

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