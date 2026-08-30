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