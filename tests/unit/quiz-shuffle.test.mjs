import test from 'node:test';
import assert from 'node:assert/strict';
import { shuffleQuestion } from '../../scripts/lib/quiz-shuffle.mjs';

test('shuffling options remaps the correct index and freezes that order', () => {
  const question = {
    q: 'demo',
    options: ['A-text', 'B-text', 'C-text', 'D-text'],
    correct: 2,
    expl: 'C',
  };
  let calls = 0;
  const rng = () => {
    const sequence = [0.1, 0.8, 0.3, 0.9];
    const value = sequence[calls % sequence.length];
    calls += 1;
    return value;
  };
  const first = shuffleQuestion(question, rng);
  assert.deepEqual([...first.options].sort(), [...question.options].sort());
  assert.equal(first.options[first.correct], 'C-text');
  assert.notDeepEqual(first.options, question.options);
  const frozen = shuffleQuestion(question, () => 0.1);
  const again = shuffleQuestion(question, () => 0.1);
  assert.deepEqual(frozen.options, again.options);
  assert.equal(frozen.correct, again.correct);
});
