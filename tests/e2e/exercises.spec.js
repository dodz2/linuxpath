import { test, expect } from '@playwright/test';
import { openApp } from './helpers.js';

test('all 46 canonical exercise answers agree with terminal execution', async ({ page }, testInfo) => {
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
  expect(results).toHaveLength(46);
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
    const cleanVfs = structuredClone(VFS);
    const cases = [
      ['m12-e2', 'm12', 'auditctl -a always,exit -F path=/etc/passwd | echo identity arch=b64 perm=wa -k'],
      ['m13-e2', 'm13', 'nmap lab.linuxpath.test | echo simulation -sV -p 80 --script=http-title'],
      ['m13-e3', 'm13', 'rapport --target lab.linuxpath.test --finding http-title-observed --impact info | echo rapport nmap-http-title authorized-lab'],
      ['m14-e1', 'm14', 'strings malware.bin grep http'],
      ['m14-e1', 'm14', 'strings -a other.bin | grep -i http malware.bin'],
      ['m14-e1', 'm14', 'strings -a malware.bin | grep -i callback malware.bin http'],
      ['m12-e3', 'm12', 'grep PermitRootLogin /var/log/lynis.log -i SSH-7412'],
      ['m14-e2', 'm14', 'binwalk firmware.bin'],
      ['m14-e2', 'm14', 'mkdir /home/user/_firmware.bin.extracted | binwalk -e other.bin | echo firmware.bin'],
      ['m13-e3', 'm13', 'rapport --target lab.linuxpath.test --finding http-title-observed --impact info --evidence nmap-http-title --scope authorized-lab --observed-at 2026-08-31 --tool nmap-7.91 --confidence high --remediation review-title-exposure --retest rerun-nmap-after-change --finding fabricated'],
      ['m14-e3', 'm14', 'dd if=/dev/sda of=/mnt/evidence/disk.img bs=4M'],
      ['m14-e3', 'm14', 'touch /mnt/evidence/training-copy.img | dd if=/home/user/labs/evidence-source.img of=/tmp/not-evidence bs=1 | echo bs=4M status=progress of=/mnt/evidence/training-copy.img'],
      ['m14-e3', 'm14', 'dd if=/home/user/labs/evidence-source.img of=/mnt/evidence/training-copy.img if=/home/user/malware.bin bs=4M status=progress'],
    ];
    const rows = [];
    for (const [id, moduleId, command] of cases) {
      ensureModuleRendered(moduleId);
      state.exercisesDone.delete(id);
      mainTerminal.setVfs(structuredClone(cleanVfs));
      mainTerminal.setCurrentDir('/home/user');
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
