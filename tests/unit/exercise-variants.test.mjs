import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  applyVfsOverlay,
  dossierIsComplete,
  evaluateReport,
  nextVariantId,
  sanitizeVariantProgress,
} from '../../scripts/lib/exercise-variants.mjs';

const variants = JSON.parse(await readFile('data/exercise-variants.json', 'utf8'));
const exercises = JSON.parse(await readFile('data/exercises.json', 'utf8'));
const baseVfs = JSON.parse(await readFile('data/vfs.json', 'utf8'));

test('cyber catalogue defines four coherent dossiers for M12 through M14', () => {
  assert.deepEqual(Object.keys(variants.groups), ['m12-audit', 'm13-pentest', 'm14-dfir']);
  for (const [groupId, group] of Object.entries(variants.groups)) {
    assert.equal(group.variants.length, 4, groupId);
    assert.equal(new Set(group.variants.map((variant) => variant.id)).size, 4, groupId);
    assert.deepEqual(group.exerciseIds, exercises[group.moduleId].map((exercise) => exercise.id));
    for (const variant of group.variants) {
      assert.ok(variant.title && variant.brief && variant.correction, `${groupId}/${variant.id}`);
      assert.deepEqual(Object.keys(variant.exercises).sort(), group.exerciseIds.slice().sort());
    }
  }
});

test('VFS overlays are isolated, add parent children and never mutate the base', () => {
  const before = structuredClone(baseVfs);
  const variant = variants.groups['m14-dfir'].variants[0];
  const overlaid = applyVfsOverlay(baseVfs, variant.vfsOverlay);
  assert.deepEqual(baseVfs, before);
  assert.match(overlaid['/var/log/auth.log.1'].content, /Failed password/);
  assert.ok(overlaid['/var/log'].children.includes('auth.log.1'));
  assert.ok(overlaid['/etc/linuxpath-scenario.json']);
});

test('structured reports identify incorrect fields without exposing answers', () => {
  const exercise = exercises.m14.find((entry) => entry.id === 'm14-e1');
  const answer = variants.groups['m14-dfir'].variants[0].exercises['m14-e1'].answer;
  assert.deepEqual(evaluateReport(exercise.reportFields, answer, answer), { ok: true, incorrectFields: [] });
  const wrong = { ...answer, verdict: 'legitimate', justification: '' };
  assert.deepEqual(evaluateReport(exercise.reportFields, answer, wrong), {
    ok: false,
    incorrectFields: ['verdict', 'justification'],
  });
});

test('dossier rotation stays locked until every exercise is solved for that variant', () => {
  const group = variants.groups['m12-audit'];
  const current = group.variants[0].id;
  const partial = { 'm12-e1': { solvedVariants: [current], attemptsByVariant: {} } };
  assert.equal(dossierIsComplete(group, current, partial), false);
  const complete = Object.fromEntries(group.exerciseIds.map((id) => [id, { solvedVariants: [current], attemptsByVariant: {} }]));
  assert.equal(dossierIsComplete(group, current, complete), true);
  assert.equal(nextVariantId(group, current, complete), group.variants[1].id);
});

test('variant progress sanitizer drops unknown ids and clamps attempt counters', () => {
  const sanitized = sanitizeVariantProgress({
    assignments: { 'm12-audit': 'audit-ssh-root', bogus: 'x' },
    results: {
      'm12-e1': { solvedVariants: ['audit-ssh-root', 'bogus'], attemptsByVariant: { 'audit-ssh-root': 999, bogus: 2 } },
      bogus: { solvedVariants: ['x'], attemptsByVariant: { x: 1 } },
    },
  }, variants);
  assert.deepEqual(sanitized.assignments, { 'm12-audit': 'audit-ssh-root' });
  assert.deepEqual(sanitized.results, {
    'm12-e1': { solvedVariants: ['audit-ssh-root'], attemptsByVariant: { 'audit-ssh-root': 50 } },
  });
});
