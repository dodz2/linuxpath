import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const ALLOWED_SEVERITY = new Set(['critical', 'high', 'medium', 'info', 'unevaluated']);

test('news items use HTTPS and do not invent a severity without CVSS', async () => {
  const data = JSON.parse(await readFile('data/news.json', 'utf8'));
  assert.ok(Array.isArray(data.news) && data.news.length > 0);
  for (const item of data.news) {
    assert.match(item.source_url, /^https:\/\//, item.id);
    assert.equal(item.source_url.startsWith('http://'), false, item.id);
    assert.ok(ALLOWED_SEVERITY.has(item.severity), `${item.id} ${item.severity}`);
    if (item.cvss == null) {
      assert.equal(item.severity, 'unevaluated', item.id);
    }
  }
});

test('the news collector does not guess severity from keywords or keep a dead NVD parser', async () => {
  const source = await readFile('.github/scripts/fetch_news.py', 'utf8');
  assert.equal(/def parse_nvd_xml/.test(source), false);
  assert.match(source, /unevaluated/);
  assert.match(source, /startswith\("https:\/\/"\)|source_url\.startswith\('https:\/\/'\)|not url\.startswith\("https:\/\/"\)/);
  assert.match(source, /cert\.ssi\.gouv\.fr/);
  assert.equal(/git push/.test(await readFile('.github/workflows/update-news.yml', 'utf8')) && !/create-pull-request/.test(await readFile('.github/workflows/update-news.yml', 'utf8')), false);
});

test('the learning chrome does not advertise a manual verified news desk', async () => {
  const html = await readFile('index.html', 'utf8');
  assert.equal(/Mis à jour manuellement/.test(html), false);
  assert.equal(/module-nav-badge[^>]*>NEW</.test(html), false);
  const newsIdx = html.indexOf('id="nav-news"');
  const cheatIdx = html.indexOf('id="nav-cheatsheet"');
  const glossIdx = html.indexOf('id="nav-glossary"');
  const groupIdx = html.indexOf('id="group-resources"');
  assert.ok(groupIdx > 0 && cheatIdx > groupIdx && glossIdx > groupIdx && newsIdx > groupIdx);
  assert.ok(newsIdx > cheatIdx && newsIdx > glossIdx);
});
