import test from 'node:test';
import assert from 'node:assert/strict';
import { loadJson } from '../../scripts/lib/content-validation.mjs';
import { evaluateValidator } from '../../scripts/lib/exercise-validators.mjs';
import { pedagogicalCommands } from '../../scripts/lib/pedagogical-commands.mjs';
import { runShell } from '../../scripts/lib/shell-exec.mjs';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function allExercises(exercises) {
  return Object.entries(exercises).flatMap(([moduleId, list]) => list.map((exercise) => ({ moduleId, exercise })));
}

test('every exercise has a declarative validator and a canonical answer', async () => {
  const exercises = await loadJson('data/exercises.json');
  const rows = allExercises(exercises);
  assert.equal(rows.length, 46);
  for (const { exercise } of rows) {
    assert.ok(exercise.validator && exercise.validator.type, `${exercise.id} missing validator`);
    assert.ok(Array.isArray(exercise.accepted) && exercise.accepted[0], `${exercise.id} missing accepted[0]`);
    assert.equal(exercise.accepted.includes("echo $USER"), false, `${exercise.id} still accepts echo $USER`);
    assert.equal(exercise.accepted.includes("echo $LOGNAME"), false, `${exercise.id} still accepts echo $LOGNAME`);
    assert.equal(exercise.accepted.includes("echo '$HOME'"), false, `${exercise.id} still accepts quoted $HOME`);
  }
});

test('every accepted answer produces exit 0 and satisfies its effect oracle', async () => {
  const [exercises, vfs] = await Promise.all([loadJson('data/exercises.json'), loadJson('data/vfs.json')]);
  const failures = [];
  for (const { exercise } of allExercises(exercises)) {
    for (const command of exercise.accepted) {
      const isolatedVfs = clone(vfs);
      const isolated = runShell({ vfs: isolatedVfs, cwd: '/home/user', command, extraCommands: pedagogicalCommands });
      const ok = evaluateValidator(exercise.validator, { ...isolated, vfs: isolatedVfs, raw: command });
      if (isolated.exitCode !== 0 || !ok.ok) {
        failures.push({
          id: exercise.id,
          command,
          exitCode: isolated.exitCode,
          stderr: isolated.stderr,
          reason: ok.reason,
          stdout: isolated.stdout,
        });
      }
    }
  }
  assert.deepEqual(failures, []);
});

test('no exercise can succeed when exitCode is not zero', async () => {
  const exercises = await loadJson('data/exercises.json');
  const vfs = await loadJson('data/vfs.json');
  const failures = [];
  for (const { exercise } of allExercises(exercises)) {
    const isolatedVfs = clone(vfs);
    const result = { exitCode: 1, stdout: ['fake success'], stderr: ['boom'], cwd: '/home/user', command: 'false', vfs: isolatedVfs };
    const verdict = evaluateValidator(exercise.validator, result);
    if (verdict.ok) failures.push(exercise.id);
  }
  assert.deepEqual(failures, []);
});

test('each exercise rejects a command that does not produce the required effect', async () => {
  const [exercises, vfs] = await Promise.all([loadJson('data/exercises.json'), loadJson('data/vfs.json')]);
  const failures = [];
  for (const { exercise } of allExercises(exercises)) {
    const isolatedVfs = clone(vfs);
    const isolated = runShell({ vfs: isolatedVfs, cwd: '/home/user', command: 'echo NOT_THE_EXERCISE', extraCommands: pedagogicalCommands });
    const verdict = evaluateValidator(exercise.validator, { ...isolated, vfs: isolatedVfs });
    if (verdict.ok) failures.push(exercise.id);
  }
  assert.deepEqual(failures, []);
});

test('mkdir -v projets satisfies the m1-e1 effect oracle', async () => {
  const [exercises, vfs] = await Promise.all([loadJson('data/exercises.json'), loadJson('data/vfs.json')]);
  const exercise = exercises.m1.find((entry) => entry.id === 'm1-e1');
  assert.ok(exercise.accepted.includes('mkdir -v projets'));
  const isolatedVfs = clone(vfs);
  assert.equal(Boolean(isolatedVfs['/home/user/projets']), false);
  const isolated = runShell({ vfs: isolatedVfs, cwd: '/home/user', command: 'mkdir -v projets', extraCommands: pedagogicalCommands });
  const verdict = evaluateValidator(exercise.validator, { ...isolated, vfs: isolatedVfs });
  assert.equal(isolated.exitCode, 0);
  assert.equal(verdict.ok, true, verdict.reason);
});

test('exercises reject incomplete, obsolete or unsafe command forms', async () => {
  const [exercises, vfs] = await Promise.all([loadJson('data/exercises.json'), loadJson('data/vfs.json')]);
  const cases = [
    ['hw1-e2', 'ls /tmp'],
    ['m13-e1', 'nmap'],
    ['m12-e1', 'lynis'],
    ['m13-e3', 'gobuster'],
    ['m12-e2', 'auditctl -w /etc/passwd -p wa -k passwd_changes'],
    ['m13-e2', 'nmap'],
    ['m13-e3', 'rapport --target lab.linuxpath.test --finding http-title-observed --impact info --evidence nmap-http-title'],
    ['m14-e1', 'strings malware.bin grep http'],
    ['m14-e2', 'binwalk'],
    ['m14-e2', 'binwalk firmware.bin'],
    ['m14-e3', 'dd'],
    ['m14-e3', 'dd if=/dev/sda of=/mnt/evidence/disk.img bs=4M'],
    ['m10-e2', 'certbot'],
    ['m4-e2', 'ip'],
    ['m6-e1', 'systemctl'],
    ['m6-e2', 'crontab'],
    ['m11-e2', 'ss'],
  ];
  const byId = Object.fromEntries(allExercises(exercises).map(({ exercise }) => [exercise.id, exercise]));
  const failures = [];
  for (const [id, wrong] of cases) {
    const exercise = byId[id];
    const isolatedVfs = clone(vfs);
    const isolated = runShell({ vfs: isolatedVfs, cwd: '/home/user', command: wrong, extraCommands: pedagogicalCommands });
    const verdict = evaluateValidator(exercise.validator, { ...isolated, vfs: isolatedVfs, raw: wrong });
    if (verdict.ok) failures.push({ id, wrong, reason: 'accepted a stub' });
  }
  assert.deepEqual(failures, []);
});

test('strict cyber validators bind arguments and effects to their own command stage', async () => {
  const [exercises, vfs] = await Promise.all([loadJson('data/exercises.json'), loadJson('data/vfs.json')]);
  const cases = [
    ['m12-e2', 'auditctl -a always,exit -F path=/etc/passwd | echo identity arch=b64 perm=wa -k'],
    ['m13-e2', 'nmap lab.linuxpath.test | echo simulation -sV -p 80 --script=http-title'],
    ['m13-e3', 'rapport --target lab.linuxpath.test --finding http-title-observed --impact info | echo rapport nmap-http-title authorized-lab'],
    ['m14-e1', 'strings -i malware.bin | grep -a http'],
    ['m14-e1', 'strings -a other.bin | grep -i http malware.bin'],
    ['m14-e1', 'strings -a malware.bin | grep -i callback malware.bin http'],
    ['m12-e3', 'grep PermitRootLogin /var/log/lynis.log -i SSH-7412'],
    ['m14-e2', 'mkdir /home/user/_firmware.bin.extracted | binwalk -e other.bin | echo firmware.bin'],
    ['m13-e3', 'rapport --target lab.linuxpath.test --finding http-title-observed --impact info --evidence nmap-http-title --scope authorized-lab --observed-at 2026-08-31 --tool nmap-7.91 --confidence high --remediation review-title-exposure --retest rerun-nmap-after-change --finding fabricated'],
    ['m14-e3', 'touch /mnt/evidence/training-copy.img | dd if=/home/user/labs/evidence-source.img of=/tmp/not-evidence bs=1 | echo bs=4M status=progress of=/mnt/evidence/training-copy.img'],
    ['m14-e3', 'dd if=/home/user/labs/evidence-source.img of=/mnt/evidence/training-copy.img if=/home/user/malware.bin bs=4M status=progress'],
  ];
  const byId = Object.fromEntries(allExercises(exercises).map(({ exercise }) => [exercise.id, exercise]));
  const failures = [];
  for (const [id, command] of cases) {
    const isolatedVfs = clone(vfs);
    const result = runShell({ vfs: isolatedVfs, cwd: '/home/user', command, extraCommands: pedagogicalCommands });
    const verdict = evaluateValidator(byId[id].validator, { ...result, vfs: isolatedVfs, raw: command });
    if (verdict.ok) failures.push({ id, command });
  }
  assert.deepEqual(failures, []);
});

test('cyber simulator distinguishes valid lab inputs from missing files and connection states', async () => {
  const vfs = await loadJson('data/vfs.json');
  const missingBinwalk = runShell({ vfs: clone(vfs), cwd: '/home/user', command: 'binwalk -e absent.bin', extraCommands: pedagogicalCommands });
  const firmwareMarker = runShell({ vfs: clone(vfs), cwd: '/home/user', command: 'strings -a firmware.bin', extraCommands: pedagogicalCommands });
  const firmwareScan = runShell({ vfs: clone(vfs), cwd: '/home/user', command: 'binwalk -e firmware.bin', extraCommands: pedagogicalCommands });
  const established = runShell({ vfs: clone(vfs), cwd: '/home/user', command: 'ss -tpn', extraCommands: pedagogicalCommands });
  const listeners = runShell({ vfs: clone(vfs), cwd: '/home/user', command: 'ss -ltnp', extraCommands: pedagogicalCommands });
  const iocLog = runShell({ vfs: clone(vfs), cwd: '/home/user', command: "grep -E 'Failed password|Accepted (publickey|password)' /var/log/auth.log | tail -20", extraCommands: pedagogicalCommands });
  assert.equal(missingBinwalk.exitCode, 1);
  assert.match(missingBinwalk.stderr.join('\n'), /Aucun fichier/);
  assert.match(firmwareMarker.stdout.join('\n'), /^UBI#/);
  assert.match(firmwareScan.stdout.join('\n'), /UBI image header \(LinuxPath simulated marker\)/);
  assert.match(established.stdout.join('\n'), /ESTAB/);
  assert.doesNotMatch(established.stdout.join('\n'), /LISTEN/);
  assert.match(listeners.stdout.join('\n'), /LISTEN/);
  assert.equal(iocLog.exitCode, 0);
  assert.match(iocLog.stdout.join('\n'), /Accepted publickey/);
  assert.match(iocLog.stdout.join('\n'), /Failed password/);
});

test('exercises reject an unrelated command that happens to carry the expected token', async () => {
  // Régression de c55b0cb : remplacer la contrainte `command` par un `any` de
  // `args_include` laissait passer n'importe quelle commande portant le bon
  // token (« ls -l » validait l'exercice sur `ss`). Les stubs nus ci-dessus ne
  // couvrent pas ce cas : ils testent la bonne commande sans ses arguments.
  const [exercises, vfs] = await Promise.all([loadJson('data/exercises.json'), loadJson('data/vfs.json')]);
  const cases = [
    ['m11-e2', 'ls -l'],
    ['m6-e2', 'ls -l'],
    ['m4-e2', 'echo addr'],
    ['m4-e2', 'echo a'],
    ['m6-e1', 'echo ssh'],
    ['m6-e1', 'echo status'],
    ['m11-e2', 'echo -tlnp'],
    ['m6-e2', 'echo -l'],
    ['m5-e2', 'echo /home/user'],
  ];
  const byId = Object.fromEntries(allExercises(exercises).map(({ exercise }) => [exercise.id, exercise]));
  const failures = [];
  for (const [id, wrong] of cases) {
    const exercise = byId[id];
    const isolatedVfs = clone(vfs);
    const isolated = runShell({ vfs: isolatedVfs, cwd: '/home/user', command: wrong, extraCommands: pedagogicalCommands });
    const verdict = evaluateValidator(exercise.validator, { ...isolated, vfs: isolatedVfs, raw: wrong });
    if (verdict.ok) failures.push({ id, wrong, reason: 'accepted an unrelated command' });
  }
  assert.deepEqual(failures, []);
});
