import { test, expect } from '@playwright/test';
import { openApp } from './helpers.js';

test('all 49 canonical exercise answers agree with terminal execution', async ({ page }, testInfo) => {
  await openApp(page);
  const results = await page.evaluate(async () => {
    const rows = [];
    for (const moduleId of Object.keys(EXERCISES)) {
      ensureModuleRendered(moduleId);
      for (const baseExercise of EXERCISES[moduleId]) {
        const variant = getActiveVariant(moduleId);
        const exercise = variant ? getEffectiveExercise(baseExercise, moduleId) : baseExercise;
        const terminal = document.querySelector('#terminal-output');
        if (variant) activateVariantForModule(moduleId);
        else { mainTerminal.setVfs(structuredClone(BASE_VFS)); mainTerminal.setCurrentDir('/home/user'); }
        terminal.innerHTML = '';
        if (exercise.mode === 'investigation') {
          for (const field of exercise.reportFields) {
            const nodes = [...document.querySelectorAll(`[data-investigation="${exercise.id}"] [data-report-field="${field.id}"]`)];
            if (field.type === 'checkboxes') nodes.forEach((node) => { node.checked = exercise.answer[field.id].includes(node.value); });
            else nodes[0].value = exercise.answer[field.id];
          }
        } else {
          document.querySelector(`#ex-input-${exercise.id}`).value = exercise.accepted[0];
        }
        await checkExercise(exercise.id, moduleId);
        rows.push({
          id: exercise.id,
          moduleId,
          command: exercise.accepted?.[0] || '[structured report]',
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
  expect(results).toHaveLength(49);
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

test('strict cyber exercises reject incomplete commands in the browser', async ({ page }) => {
  await openApp(page);
  const result = await page.evaluate(async () => {
    const cases = [
      ['m12-e2', 'm12', 'auditctl -w /etc/passwd -p wa -k identity'],
      ['m13-e2', 'm13', 'nmap -sV -p 22 --script=http-title wrong.linuxpath.test'],
      ['m14-e2', 'm14', 'binwalk -e firmware.bin'],
      ['m14-e3', 'm14', 'dd if=/dev/sda of=/mnt/evidence/disk.img bs=4M'],
    ];
    const rows = [];
    for (const [id, moduleId, command] of cases) {
      ensureModuleRendered(moduleId);
      const variant = getActiveVariant(moduleId);
      if (state.variantResults[id]) state.variantResults[id].solvedVariants = state.variantResults[id].solvedVariants.filter((variantId) => variantId !== variant.id);
      activateVariantForModule(moduleId);
      document.querySelector('#terminal-output').innerHTML = '';
      const input = document.querySelector(`#ex-input-${id}`);
      input.disabled = false;
      input.value = command;
      await checkExercise(id, moduleId);
      rows.push({ id, solved: state.exercisesDone.has(id), feedback: document.querySelector(`#feedback-${id}`)?.textContent.trim() });
    }
    return rows;
  });
  expect(result.every((entry) => !entry.solved && entry.feedback.startsWith('✗'))).toBe(true);
});

test('structured investigation reveals the correction only on the third failure', async ({ page }) => {
  await openApp(page);
  const result = await page.evaluate(async () => {
    ensureModuleRendered('m14');
    const messages = [];
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await checkExercise('m14-e1', 'm14');
      messages.push(document.querySelector('#feedback-m14-e1').textContent.trim());
    }
    return messages;
  });
  expect(result[0]).not.toContain('Correction :');
  expect(result[1]).not.toContain('Correction :');
  expect(result[2]).toContain('Correction :');
});

test('a dossier assignment survives reload and rotates only after all group exercises', async ({ page }) => {
  await openApp(page);
  const before = await page.evaluate(async () => {
    ensureModuleRendered('m12');
    const group = getVariantGroupByModule('m12');
    const variant = getActiveVariant('m12');
    await saveState();
    return { id: variant.id, disabled: document.querySelector('#dossier-panel-m12 .btn-new-dossier').disabled, exerciseIds: group.exerciseIds };
  });
  expect(before.disabled).toBe(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof APP_READY !== 'undefined' && APP_READY);
  const after = await page.evaluate(async () => {
    ensureModuleRendered('m12');
    const group = getVariantGroupByModule('m12');
    const current = getActiveVariant('m12');
    group.exerciseIds.forEach((id) => { recordVariantSolved(id, current.id); state.exercisesDone.add(id); });
    renderExercises('m12');
    const enabled = !document.querySelector('#dossier-panel-m12 .btn-new-dossier').disabled;
    await switchVariant('m12');
    return { original: current.id, next: getActiveVariant('m12').id, enabled, done: group.exerciseIds.every((id) => state.exercisesDone.has(id)) };
  });
  expect(after.original).toBe(before.id);
  expect(after.enabled).toBe(true);
  expect(after.next).not.toBe(after.original);
  expect(after.done).toBe(true);
});

test('the browser terminal returns the documented journal filters', async ({ page }) => {
  await openApp(page);
  const result = await page.evaluate(() => {
    document.querySelector('#terminal-output').innerHTML = '';
    const command = 'journalctl -u ssh.service --since "yesterday" --no-pager';
    const execution = mainTerminal.exec(command);
    const ioc = mainTerminal.exec("grep -E 'Failed password|Accepted (publickey|password)' /var/log/auth.log | tail -20");
    const firmwareMarker = mainTerminal.exec('strings -a firmware.bin');
    const firmwareScan = mainTerminal.exec('binwalk -e firmware.bin');
    return {
      exitCode: [execution.exitCode, ioc.exitCode, firmwareMarker.exitCode, firmwareScan.exitCode],
      output: document.querySelector('#terminal-output').textContent.replace(/\s+/g, ' ').trim(),
    };
  });
  expect(result.exitCode).toEqual([0, 0, 0, 0]);
  expect(result.output).toContain('Accepted publickey');
  expect(result.output).toContain('Failed password');
  expect(result.output).toContain('UBI# firmware blob');
  expect(result.output).toContain('UBI image header (LinuxPath simulated marker)');
});
