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

export async function collectExerciseCommandMatrix(page) {
  return page.evaluate(() => {
    function executeCase(exercise, command, vfs, metadata) {
      const terminal = document.querySelector('#terminal-output');
      mainTerminal.setVfs(vfs);
      mainTerminal.setCurrentDir('/home/user');
      terminal.innerHTML = '';
      const execution = mainTerminal.exec(command);
      const verdict = evaluateValidator(exercise.validator, {
        ...execution,
        raw: command,
        vfs: mainTerminal.getVfs(),
      });
      const terminalErrors = [...terminal.querySelectorAll('.t-err')]
        .map((element) => element.textContent.trim());
      return {
        ...metadata,
        command,
        exitCode: execution.exitCode,
        stderr: execution.stderr || [],
        validatorOk: verdict.ok,
        reason: verdict.reason || null,
        terminalErrors,
        accepted: execution.exitCode === 0 && verdict.ok && terminalErrors.length === 0,
      };
    }

    const accepted = [];
    for (const [moduleId, exercises] of Object.entries(EXERCISES)) {
      for (const exercise of exercises) {
        if (exercise.mode === 'investigation') continue;
        for (const command of exercise.accepted || []) {
          accepted.push(executeCase(exercise, command, structuredClone(BASE_VFS), {
            kind: 'accepted', moduleId, exerciseId: exercise.id,
          }));
        }
      }
    }

    const variants = [];
    for (const group of Object.values(EXERCISE_VARIANTS.groups || {})) {
      for (const variant of group.variants || []) {
        for (const exerciseId of group.exerciseIds || []) {
          const base = EXERCISES[group.moduleId].find((entry) => entry.id === exerciseId);
          const exercise = Object.assign({}, base, variant.exercises[exerciseId] || {});
          if (exercise.mode === 'investigation') continue;
          for (const command of exercise.accepted || []) {
            variants.push(executeCase(
              exercise,
              command,
              applyVfsOverlay(BASE_VFS, variant.vfsOverlay || {}),
              {
                kind: 'variant',
                groupId: group.id,
                variantId: variant.id,
                moduleId: group.moduleId,
                exerciseId,
              },
            ));
          }
        }
      }
    }
    return { accepted, variants };
  });
}

export async function collectAdversarialExerciseMatrix(page, probes) {
  return page.evaluate((cases) => cases.map((probe) => {
    const exercise = Object.values(EXERCISES).flat().find((entry) => entry.id === probe.exerciseId);
    const terminal = document.querySelector('#terminal-output');
    mainTerminal.setVfs(structuredClone(BASE_VFS));
    mainTerminal.setCurrentDir('/home/user');
    terminal.innerHTML = '';
    const execution = mainTerminal.exec(probe.command);
    const verdict = evaluateValidator(exercise.validator, {
      ...execution,
      raw: probe.command,
      vfs: mainTerminal.getVfs(),
    });
    const accepted = execution.exitCode === 0 && verdict.ok;
    return {
      id: probe.id,
      exerciseId: probe.exerciseId,
      command: probe.command,
      accepted,
      evaluationExitCode: accepted ? 0 : 1,
      commandExitCode: execution.exitCode,
      reason: accepted ? null : verdict.reason,
      terminalErrors: [...terminal.querySelectorAll('.t-err')]
        .map((element) => element.textContent.trim()),
    };
  }), probes);
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
