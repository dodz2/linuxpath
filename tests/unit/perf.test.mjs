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

test('Lighthouse CI budgets encode the phase 12 thresholds', async () => {
  const config = JSON.parse(await readFile('lighthouserc.json', 'utf8'));
  const assertions = config.ci.assert.assertions;
  assert.equal(assertions['categories:performance'][1].minScore, 0.85);
  assert.equal(assertions['categories:accessibility'][1].minScore, 1);
  assert.equal(assertions['categories:best-practices'][1].minScore, 1);
  assert.equal(assertions['categories:seo'][1].minScore, 0.95);
  assert.equal(assertions['largest-contentful-paint'][1].maxNumericValue, 2500);
  assert.equal(assertions['cumulative-layout-shift'][1].maxNumericValue, 0.1);
});
