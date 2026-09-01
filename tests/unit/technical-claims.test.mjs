import test from 'node:test';
import assert from 'node:assert/strict';
import { loadJson } from '../../scripts/lib/content-validation.mjs';

test('chmod lesson distinguishes omitted who from explicit a+x', async () => {
  const lessons = await loadJson('data/lessons.json');
  const lesson = lessons.m2.find((entry) => entry.id === 'm2-l2');
  assert.doesNotMatch(lesson.content, /chmod \+x script\.sh[\s\S]{0,100}ajoute l'exécution à tous/i);
  assert.match(lesson.content, /chmod a\+x script\.sh/);
});

test('Git quiz states that merge may create a commit instead of claiming it always does', async () => {
  const quizzes = await loadJson('data/quizzes.json');
  const question = quizzes.m8.questions.find((entry) => /différence principale entre git merge et git rebase/i.test(entry.q));
  assert.ok(question, 'missing Git merge/rebase question');
  const keyedAnswer = question.options[question.correct];
  assert.match(`${keyedAnswer} ${question.expl}`, /peut créer un commit de fusion/i);
  assert.doesNotMatch(`${keyedAnswer} ${question.expl}`, /merge crée un commit de fusion/i);
});
