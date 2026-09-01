import test from 'node:test';
import assert from 'node:assert/strict';
import { loadJson } from '../../scripts/lib/content-validation.mjs';

test('the cheatsheet ships 118 commands across 10 categories', async () => {
  const data = await loadJson('data/cheatsheet.json');
  const categories = data.categories;
  assert.equal(categories.length, 10);
  const commands = categories.reduce((total, cat) => total + cat.commands.length, 0);
  assert.equal(commands, 118);
  for (const cat of categories) {
    assert.ok(cat.id && cat.label && cat.icon);
    assert.ok(Array.isArray(cat.commands) && cat.commands.length > 0);
    for (const command of cat.commands) {
      assert.ok(command.cmd && command.desc && command.example, `${cat.id}: malformed command`);
    }
  }
});

test('the glossary ships 74 terms with definition and example', async () => {
  const data = await loadJson('data/glossary.json');
  const terms = data.terms;
  assert.equal(terms.length, 74);
  for (const term of terms) {
    assert.ok(term.term && term.definition, `${term.term || '(missing term)'}`);
  }
});

test('every published lesson exposes only structured HTTPS references', async () => {
  const lessons = Object.values(await loadJson('data/lessons.json')).flat();
  const absent = lessons.filter((lesson) => !Array.isArray(lesson.sources));
  const opaque = lessons.filter((lesson) => Array.isArray(lesson.sources)
    && lesson.sources.some((source) => !source || typeof source !== 'object' || Array.isArray(source)));
  const unstructured = new Set([...absent, ...opaque]);

  assert.equal(lessons.length, 99);
  assert.equal(
    unstructured.size,
    0,
    `${unstructured.size} lessons are not structured: ${absent.length} absent, ${opaque.length} opaque`,
  );

  const references = lessons.flatMap((lesson) => lesson.sources.map((source) => ({ lesson, source })));
  assert.equal(references.length, 129);
  for (const { lesson, source } of references) {
    assert.deepEqual(Object.keys(source), ['title', 'url', 'scope', 'checkedAt'], `${lesson.id}: unexpected source fields`);
    assert.equal(typeof source.title, 'string', `${lesson.id}: title`);
    assert.ok(source.title.trim(), `${lesson.id}: empty title`);
    assert.equal(typeof source.scope, 'string', `${lesson.id}: scope`);
    assert.ok(source.scope.trim(), `${lesson.id}: empty scope`);
    assert.equal(new URL(source.url).protocol, 'https:', `${lesson.id}: ${source.url}`);
    assert.match(source.checkedAt, /^\d{4}-\d{2}-\d{2}$/, `${lesson.id}: checkedAt`);
    assert.equal(
      new Date(`${source.checkedAt}T00:00:00Z`).toISOString().slice(0, 10),
      source.checkedAt,
      `${lesson.id}: invalid checkedAt`,
    );
  }
});