import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  normalizeFlag,
  rewriteCtfCommand,
  sha256Hex,
  solveKind,
} from '../../scripts/lib/ctf-model.mjs';

const flags = JSON.parse(await readFile('tests/fixtures/ctf-flags.json', 'utf8'));
const catalogue = JSON.parse(await readFile('data/ctf.json', 'utf8'));

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
