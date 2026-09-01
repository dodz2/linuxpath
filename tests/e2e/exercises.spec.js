import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { collectAdversarialExerciseMatrix, collectExerciseCommandMatrix, openApp } from './helpers.js';

const adversarialFixture = JSON.parse(await readFile('tests/fixtures/audit-v2-adversarial-commands.json', 'utf8'));

test('all 164 accepted commands and 24 variant commands pass in the shipped browser runtime', async ({ page }, testInfo) => {
  await openApp(page);
  const results = await collectExerciseCommandMatrix(page);

  await testInfo.attach('exercise-matrix', { body: JSON.stringify(results, null, 2), contentType: 'application/json' });
  expect(results.accepted).toHaveLength(164);
  expect(results.variants).toHaveLength(24);
  const failures = [...results.accepted, ...results.variants].filter((entry) => !entry.accepted);
  expect(failures, `accepted answers rejected by browser runtime:\n${JSON.stringify(failures, null, 2)}`).toEqual([]);
});

test('all ten audit-v2 adversarial probes are rejected with deterministic reasons', async ({ page }, testInfo) => {
  await openApp(page);
  const results = await collectAdversarialExerciseMatrix(page, adversarialFixture.probes);
  await testInfo.attach('adversarial-exercise-matrix', { body: JSON.stringify(results, null, 2), contentType: 'application/json' });
  expect(results).toHaveLength(10);
  for (const [index, result] of results.entries()) {
    const expected = adversarialFixture.probes[index];
    expect(result.id).toBe(expected.id);
    expect(result.accepted, JSON.stringify(result, null, 2)).toBe(false);
    expect(result.evaluationExitCode, JSON.stringify(result, null, 2)).not.toBe(0);
    expect(result.reason).toBe(expected.rejectionReason);
  }
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

test('journalctl pipeline renders only the final Failed line once', async ({ page }) => {
  await openApp(page);
  const result = await page.evaluate(() => {
    document.querySelector('#terminal-output').innerHTML = '';
    const execution = mainTerminal.exec('journalctl -u ssh.service | grep Failed');
    return {
      execution,
      outputLines: [...document.querySelectorAll('#terminal-output .term-output')]
        .map((line) => line.textContent.trim())
        .filter(Boolean),
    };
  });
  expect(result.execution.exitCode).toBe(0);
  expect(result.execution.stdout).toHaveLength(1);
  expect(result.execution.stdout[0]).toContain('Failed password');
  expect(result.outputLines).toEqual(result.execution.stdout);
});
