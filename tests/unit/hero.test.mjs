import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Le hero terminal vit dans assets/render.js (logique script + runtime).
// Tests de contraintes sur la source : le script de démo doit rester bénin,
// borné, sans dépendance externe — même esprit que content-safety.

const FORBIDDEN_CMDS = ['sudo', 'rm ', 'rm -rf', 'apt', 'dd ', 'mkfs', 'shutdown', 'reboot', 'chmod 777', 'passwd', ':(){', '> /dev/' ];

test('render.js defines a non-empty HERO_SCRIPT with cmd + out for every entry', async () => {
  const src = await readFile('assets/render.js', 'utf8');
  const block = src.match(/const HERO_SCRIPT\s*=\s*(\[[\s\S]*?\]);/);
  assert.ok(block, 'HERO_SCRIPT is missing from render.js');
  const entries = [...block[1].matchAll(/\{ cmd: '([^']+)', out: \[([\s\S]*?)\] \}/g)];
  assert.ok(entries.length > 0, 'HERO_SCRIPT must have at least one command');
  for (const match of entries) {
    assert.ok(match[1].length > 0, 'entry lacks a cmd');
    const outs = [...match[2].matchAll(/'([^']+)'/g)].map((m) => m[1]);
    assert.ok(outs.length > 0, `${match[1]} lacks out[]`);
  }
  assert.equal(entries.length, src.match(/const HERO_SCRIPT[\s\S]*?\];/)[0].split(/\{ cmd: /).length - 1, 'parsed count mismatch');
});

test('the hero demo script only runs benign, honest commands', async () => {
  const src = await readFile('assets/render.js', 'utf8');
  const block = src.match(/const HERO_SCRIPT\s*=\s*(\[[\s\S]*?\]);/);
  assert.ok(block, 'HERO_SCRIPT is missing');
  const cmds = [...block[1].matchAll(/\{ cmd: '([^']+)'/g)].map((m) => m[1]);
  assert.ok(cmds.length > 0, 'no commands found');
  for (const cmd of cmds) {
    for (const forbidden of FORBIDDEN_CMDS) {
      assert.equal(cmd.includes(forbidden), false, `HERO_SCRIPT uses forbidden "${forbidden}" in "${cmd}"`);
    }
    const base = cmd.split(/\s+/)[0];
    assert.ok(['whoami', 'pwd', 'ls', 'cat', 'echo'].includes(base), `unexpected demo command: ${cmd}`);
  }
});

test('the demo timing constants are bounded and a cleanup hook exists', async () => {
  const src = await readFile('assets/render.js', 'utf8');
  const typing = src.match(/const HERO_TYPING_MS\s*=\s*(\d+)/);
  const pause = src.match(/const HERO_PAUSE_MS\s*=\s*(\d+)/);
  const batch = src.match(/const HERO_BATCH_MS\s*=\s*(\d+)/);
  assert.ok(typing && pause && batch, 'timing constants missing (HERO_TYPING_MS/HERO_PAUSE_MS/HERO_BATCH_MS)');
  // Bornes hautes : la démo ne doit jamais devenir pénible.
  assert.ok(Number(typing[1]) <= 1000, 'typing per char must stay ≤ 1000ms');
  assert.ok(Number(pause[1]) <= 3000, 'pause must stay ≤ 3000ms');
  assert.ok(Number(batch[1]) <= 3000, 'batch pause must stay ≤ 3000ms');
  // Bornes basses : le texte doit rester lisible (pas de défilement trop rapide).
  assert.ok(Number(typing[1]) >= 60, `typing per char must be ≥ 60ms for readability (got ${typing[1]})`);
  assert.ok(Number(pause[1]) >= 800, `pause after output must be ≥ 800ms (got ${pause[1]})`);
  assert.ok(Number(batch[1]) >= 1200, `batch gap must be ≥ 1200ms (got ${batch[1]})`);
  assert.match(src, /function cleanHeroTimers\(\)/, 'cleanHeroTimers() hook is missing');
});

test('the hero terminal never loads external fonts or assets', async () => {
  const src = await readFile('assets/render.js', 'utf8');
  const heroBlock = src.slice(src.indexOf('HERO_SCRIPT'), src.indexOf('/* ============================================================\n   QUIZ'));
  assert.equal(/fonts\.googleapis|fonts\.gstatic|https?:\/\//.test(heroBlock), false, 'hero demo must not reference external URLs');
});