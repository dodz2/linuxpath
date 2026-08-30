import { test, expect } from '@playwright/test';
import { openApp } from './helpers.js';

test('all 38 canonical exercise answers agree with terminal execution', async ({ page }, testInfo) => {
  await openApp(page);
  const results = await page.evaluate(async () => {
    const rows = [];
    const cleanVfs = structuredClone(VFS);
    for (const moduleId of Object.keys(EXERCISES)) {
      ensureModuleRendered(moduleId);
      for (const exercise of EXERCISES[moduleId]) {
        const input = document.querySelector(`#ex-input-${exercise.id}`);
        const terminal = document.querySelector('#terminal-output');
        mainTerminal.setVfs(structuredClone(cleanVfs));
        mainTerminal.setCurrentDir('/home/user');
        terminal.innerHTML = '';
        input.value = exercise.accepted[0];
        await checkExercise(exercise.id, moduleId);
        rows.push({
          id: exercise.id,
          moduleId,
          command: exercise.accepted[0],
          solved: state.exercisesDone.has(exercise.id),
          feedback: document.querySelector(`#feedback-${exercise.id}`)?.textContent.trim(),
          terminal: terminal.textContent.replace(/\s+/g, ' ').trim(),
          terminalErrors: [...terminal.querySelectorAll('.t-err')].map((element) => element.textContent.trim()),
        });
      }
    }
    return rows;
  });

  await testInfo.attach('exercise-matrix', { body: JSON.stringify(results, null, 2), contentType: 'application/json' });
  expect(results).toHaveLength(38);
  expect(results.filter((entry) => !entry.solved || !entry.feedback.startsWith('✓'))).toEqual([]);

  const contradictions = results.filter((entry) => entry.terminalErrors.length > 0);
  expect(contradictions, `accepted answers contradicted by terminal:\n${JSON.stringify(contradictions, null, 2)}`).toEqual([]);
});

test('GNU mkdir -v is accepted as an equivalent of m1-e1', async ({ page }) => {
  await openApp(page);
  const result = await page.evaluate(async () => {
    const cleanVfs = structuredClone(VFS);
    ensureModuleRendered('m1');
    mainTerminal.setVfs(structuredClone(cleanVfs));
    mainTerminal.setCurrentDir('/home/user');
    document.querySelector('#terminal-output').innerHTML = '';
    document.querySelector('#ex-input-m1-e1').value = 'mkdir -v projets';
    await checkExercise('m1-e1', 'm1');
    return {
      accepted: EXERCISES.m1.find((exercise) => exercise.id === 'm1-e1').accepted,
      solved: state.exercisesDone.has('m1-e1'),
      feedback: document.querySelector('#feedback-m1-e1')?.textContent.trim(),
      terminalErrors: [...document.querySelectorAll('#terminal-output .t-err')].map((element) => element.textContent.trim()),
    };
  });
  expect(result.accepted).toContain('mkdir -v projets');
  expect(result.solved).toBe(true);
  expect(result.feedback.startsWith('✓')).toBe(true);
  expect(result.terminalErrors).toEqual([]);
});

test('a command with a non-zero exit code cannot validate an exercise', async ({ page }) => {
  await openApp(page);
  const result = await page.evaluate(async () => {
    const cleanVfs = structuredClone(VFS);
    ensureModuleRendered('m1');
    mainTerminal.setVfs(structuredClone(cleanVfs));
    mainTerminal.setCurrentDir('/home/user');
    document.querySelector('#terminal-output').innerHTML = '';
    document.querySelector('#ex-input-m1-e1').value = 'mkdir /no/such/parent/projets';
    await checkExercise('m1-e1', 'm1');
    return {
      solved: state.exercisesDone.has('m1-e1'),
      feedback: document.querySelector('#feedback-m1-e1')?.textContent.trim(),
    };
  });
  expect(result.solved).toBe(false);
  expect(result.feedback.startsWith('✗')).toBe(true);
});
