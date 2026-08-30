import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('the document does not load third-party webfonts', async () => {
  const html = await readFile('index.html', 'utf8');
  assert.equal(/fonts\.googleapis\.com|fonts\.gstatic\.com/.test(html), false);
  const css = await readFile('assets/base.css', 'utf8');
  assert.match(css, /system-ui/);
  assert.equal(/JetBrains Mono|Plus Jakarta Sans/.test(css), false);
});

test('no workflow pretends to run Lighthouse budgets', async () => {
  const pkg = await readFile('package.json', 'utf8');
  const ci = await readFile('.github/workflows/ci.yml', 'utf8');
  const deploy = await readFile('.github/workflows/deploy-pages.yml', 'utf8');
  assert.equal(/lighthouse/i.test(pkg + ci + deploy), false);
});
