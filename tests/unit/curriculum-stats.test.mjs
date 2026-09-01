import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { getCurriculumStats } from '../../scripts/lib/curriculum-stats.mjs';
import { loadJson } from '../../scripts/lib/content-validation.mjs';

test('curriculum stats derive total and per-track durations from published module minutes', async () => {
  const [stats, catalogue] = await Promise.all([
    getCurriculumStats(),
    loadJson('data/modules.json'),
  ]);
  const published = catalogue.modules.filter((entry) => entry.status === 'published');
  const expectedMinutes = published.reduce((sum, entry) => sum + entry.estimatedMinutes, 0);

  assert.equal(stats.estimatedMinutes, expectedMinutes);
  assert.equal(stats.estimatedHours, Math.ceil(expectedMinutes / 60));
  assert.deepEqual(
    stats.tracks,
    catalogue.tracks.map((track) => {
      const modules = published.filter((entry) => track.modules.includes(entry.id));
      const estimatedMinutes = modules.reduce((sum, entry) => sum + entry.estimatedMinutes, 0);
      return {
        id: track.id,
        modules: modules.length,
        estimatedMinutes,
        estimatedHours: Math.ceil(estimatedMinutes / 60),
      };
    }),
  );
});

test('no-JS curriculum totals and track durations match published data', async () => {
  const [html, stats] = await Promise.all([
    readFile('index.html', 'utf8'),
    getCurriculumStats(),
  ]);

  assert.match(html, new RegExp(`Les ${stats.modules} modules`));
  assert.match(html, new RegExp(`"description": "${stats.modules} modules progressifs`));
  for (const track of stats.tracks) {
    const article = html.match(new RegExp(`<article class="track-card" data-track="${track.id}">([\\s\\S]*?)</article>`));
    assert.ok(article, `missing no-JS card for ${track.id}`);
    assert.match(article[1], new RegExp(`~${track.estimatedHours} h`), `stale duration for ${track.id}`);
  }
  const offsec = html.match(/<article class="track-card" data-track="offsec">([\s\S]*?)<\/article>/);
  assert.match(offsec[1], /CS1/);
  assert.match(offsec[1], /M12 à M14/);
});

test('README catalogue count and security path match published modules', async () => {
  const [readme, stats] = await Promise.all([
    readFile('README.md', 'utf8'),
    getCurriculumStats(),
  ]);
  assert.match(readme, new RegExp(`- ${stats.modules} modules publiés`));
  assert.match(readme, /Sécurité, Pentest & DFIR \(CS1 \+ M12–M14\)/);
});

test('stored track estimates cannot diverge from published module minutes', async () => {
  const catalogue = await loadJson('data/modules.json');
  const published = catalogue.modules.filter((entry) => entry.status === 'published');
  for (const track of catalogue.tracks) {
    const minutes = published
      .filter((entry) => track.modules.includes(entry.id))
      .reduce((sum, entry) => sum + entry.estimatedMinutes, 0);
    assert.equal(track.estimatedHours, Math.ceil(minutes / 60), track.id);
  }
});
