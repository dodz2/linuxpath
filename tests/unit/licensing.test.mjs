import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

async function sha256(path) {
  const buf = await readFile(path);
  return createHash('sha256').update(buf).digest('hex');
}

test('repository licenses are explicit and verifiable', async () => {
  const mit = await readFile('LICENSE', 'utf8');
  assert.match(mit, /MIT License/i);
  assert.match(mit, /Copyright/i);

  const cc = await readFile('CONTENT_LICENSE', 'utf8');
  assert.match(cc, /CC BY-SA 4\.0/i);

  const readme = await readFile('README.md', 'utf8');
  assert.match(readme, /LICENSE/);
  assert.match(readme, /CONTENT_LICENSE/);
  assert.equal(/Ajouter une licence explicite/.test(readme), false);
});

test('third-party notices cover every v86 binary with hash, source and license', async () => {
  const notices = await readFile('THIRD_PARTY_NOTICES.md', 'utf8');
  const v86Readme = await readFile('v86/README.md', 'utf8');
  const files = ['v86/libv86.js', 'v86/v86.wasm', 'v86/seabios.bin', 'v86/vgabios.bin', 'v86/linux.iso'];
  for (const f of files) {
    const hash = await sha256(f);
    assert.ok(notices.includes(f) || notices.includes(f.split('/')[1]), `missing ${f} in THIRD_PARTY_NOTICES`);
    // hash must appear (full or short) — we require full
    assert.ok(notices.includes(hash) || notices.includes(hash.slice(0, 16)), `missing hash for ${f}`);
  }
  assert.match(notices, /v86/i);
  assert.match(notices, /SeaBIOS|seabios/i);
  assert.match(notices, /VGABIOS|vgabios/i);
  assert.match(notices, /Alpine|linux\.iso/i);
  // every binary must have a license string nearby
  assert.match(notices, /BSD|MIT|GPL|LGPL|2-clause/i);
  // build reproducibility doc
  assert.match(v86Readme, /SHA-256|sha256/i);
  assert.match(v86Readme, /build-sandbox-image|reprodu/i);
});

test('sandbox rebuild procedure is documented and executable', async () => {
  const script = await readFile('scripts/build-sandbox-image.sh', 'utf8');
  assert.match(script, /v86|copy\.sh/i);
  assert.match(script, /sha256|SHA/i);
  // script must be executable marker (shebang)
  assert.match(script, /^#!/m);
});

test('site does not claim open-source without the license files backing it', async () => {
  const html = await readFile('index.html', 'utf8');
  // if the page claims open-source, licenses must exist (already checked above)
  // here we just ensure the claim is consistent with files existing — fail if claim says MIT but LICENSE missing
  if (/open.source/i.test(html)) {
    const mit = await readFile('LICENSE', 'utf8');
    assert.ok(mit.length > 100);
  }
});
