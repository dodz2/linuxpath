import { expect } from '@playwright/test';

export async function openApp(page) {
  const response = await page.goto('./', { waitUntil: 'domcontentloaded' });
  expect(response?.status()).toBe(200);
  await page.waitForFunction(() => (
    typeof navigateTo === 'function'
    && typeof state === 'object'
    && typeof CTF_CHALLENGES !== 'undefined'
    && CTF_CHALLENGES.length === 10
    && Boolean(mainTerminal)
    && typeof APP_READY !== 'undefined'
    && APP_READY
    && Boolean(document.querySelector('#home-hero .lp-hero, #home-hero > *'))
  ));
}

export async function answerQuiz(page, moduleId, answerMode) {
  await page.evaluate((mod) => startQuiz(mod), moduleId);
  const questionCount = await page.evaluate((mod) => QUIZZES[mod].questions.length, moduleId);
  for (let index = 0; index < questionCount; index += 1) {
    await page.evaluate(({ mod, mode, answerIndex }) => {
      const current = quizState[mod];
      const question = (current.questions || QUIZZES[mod].questions)[current.currentQ];
      const shouldBeCorrect = mode === 'correct' || (Number.isInteger(mode) && answerIndex < mode);
      const answer = shouldBeCorrect ? question.correct : (question.correct + 1) % question.options.length;
      selectOption(mod, answer);
      nextQuestion(mod);
    }, { mod: moduleId, mode: answerMode, answerIndex: index });
  }
  await page.waitForFunction((mod) => Object.hasOwn(state.quizScores, mod), moduleId);
}

export function sameOriginHttpFailures(page, origin) {
  const failures = [];
  page.on('response', (response) => {
    if (response.status() >= 400 && response.url().startsWith(origin)) {
      failures.push({ status: response.status(), url: response.url() });
    }
  });
  return failures;
}
