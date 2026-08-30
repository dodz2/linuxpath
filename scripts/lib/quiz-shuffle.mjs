export function shuffleQuestion(question, rng = Math.random) {
  const indexes = question.options.map((_, index) => index);
  for (let i = indexes.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [indexes[i], indexes[j]] = [indexes[j], indexes[i]];
  }
  return {
    ...question,
    options: indexes.map((index) => question.options[index]),
    correct: indexes.indexOf(question.correct),
  };
}

export function shuffleQuiz(quiz, rng = Math.random) {
  return {
    ...quiz,
    questions: quiz.questions.map((question) => shuffleQuestion(question, rng)),
  };
}
