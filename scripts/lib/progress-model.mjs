export const PASS_SCORE = 3;
export const PROGRESS_FORMAT_V1 = 'linuxpath-progress-v1';
export const PROGRESS_FORMAT_V2 = 'linuxpath-progress-v2';

export function activityBelongsToModule(id, moduleId) {
  return typeof id === 'string' && typeof moduleId === 'string' && (id === moduleId || id.startsWith(`${moduleId}-`));
}

export function normalizeQuizRecord(value, passScore = PASS_SCORE) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const score = Math.max(0, Math.round(value));
    return { attempts: 1, bestScore: score, lastScore: score, passed: score >= passScore };
  }
  if (!value || typeof value !== 'object') return null;
  const lastScore = Number.isFinite(value.lastScore) ? Math.max(0, Math.round(value.lastScore)) : null;
  const bestScore = Number.isFinite(value.bestScore) ? Math.max(0, Math.round(value.bestScore)) : lastScore;
  const attempts = Number.isFinite(value.attempts) ? Math.max(1, Math.round(value.attempts)) : 1;
  if (lastScore === null && bestScore === null) return null;
  const last = lastScore ?? bestScore ?? 0;
  const best = Math.max(bestScore ?? 0, last);
  return {
    attempts,
    bestScore: best,
    lastScore: last,
    passed: value.passed === true || best >= passScore,
  };
}

export function recordQuizAttempt(existing, score, passScore = PASS_SCORE) {
  const previous = normalizeQuizRecord(existing, passScore);
  const lastScore = Math.max(0, Math.round(score));
  const bestScore = Math.max(previous ? previous.bestScore : 0, lastScore);
  return {
    attempts: (previous ? previous.attempts : 0) + 1,
    bestScore,
    lastScore,
    passed: Boolean(previous && previous.passed) || lastScore >= passScore,
  };
}

export function isQuizPassed(value, passScore = PASS_SCORE) {
  const record = normalizeQuizRecord(value, passScore);
  return Boolean(record && record.passed);
}

export function masteryLabel({ passed, bestScore, withHelp, questionCount = 5 }) {
  if (!passed) return 'attempted';
  if (bestScore >= questionCount && !withHelp) return 'mastered';
  if (withHelp) return 'helped';
  return 'autonomous';
}

export function migrateProgress(data, passScore = PASS_SCORE) {
  if (!data || typeof data !== 'object') return null;
  const format = data._format;
  if (format !== PROGRESS_FORMAT_V1 && format !== PROGRESS_FORMAT_V2) return null;
  const sourceQuiz = data.quiz && typeof data.quiz === 'object' ? data.quiz : data.quizScores;
  const quiz = {};
  if (sourceQuiz && typeof sourceQuiz === 'object') {
    for (const [moduleId, value] of Object.entries(sourceQuiz)) {
      const record = normalizeQuizRecord(value, passScore);
      if (record) quiz[moduleId] = record;
    }
  }
  return {
    _format: PROGRESS_FORMAT_V2,
    lessonsDone: Array.isArray(data.lessonsDone) ? data.lessonsDone.filter((id) => typeof id === 'string') : [],
    exercisesDone: Array.isArray(data.exercisesDone) ? data.exercisesDone.filter((id) => typeof id === 'string') : [],
    quiz,
    unlockedModules: Array.isArray(data.unlockedModules) ? data.unlockedModules.filter((id) => typeof id === 'string') : [],
    ctfSolved: Array.isArray(data.ctfSolved) ? data.ctfSolved.filter((id) => typeof id === 'string') : [],
    ctfHints: data.ctfHints && typeof data.ctfHints === 'object' ? data.ctfHints : {},
    ctfHow: data.ctfHow && typeof data.ctfHow === 'object' ? data.ctfHow : {},
  };
}

export function computeModuleProgress({
  lessonTotal,
  exerciseTotal,
  lessonsDone,
  exercisesDone,
  quizValue,
  unlocked,
  passScore = PASS_SCORE,
  questionCount = 5,
}) {
  const record = normalizeQuizRecord(quizValue, passScore);
  const quizDone = record && record.passed ? 1 : 0;
  const total = lessonTotal + exerciseTotal + 1;
  const done = lessonsDone + exercisesDone + quizDone;
  const pct = total ? Math.round(done / total * 100) : 0;
  let state = 'locked';
  if (unlocked) {
    if (quizDone && lessonsDone >= lessonTotal && exercisesDone >= exerciseTotal) {
      state = record && record.bestScore >= questionCount ? 'mastered' : 'passed';
    } else if (lessonsDone + exercisesDone + (record ? 1 : 0) > 0) {
      state = 'in_progress';
    } else {
      state = 'available';
    }
  }
  return { done, total, pct, state, quiz: record };
}

export const PROGRESS_IMPORT_MAX_BYTES = 100000;

function hasDangerousKey(value) {
  if (!value || typeof value !== 'object') return false;
  if (Object.prototype.hasOwnProperty.call(value, '__proto__') || Object.prototype.hasOwnProperty.call(value, 'constructor') || Object.prototype.hasOwnProperty.call(value, 'prototype')) return true;
  for (const key of Object.keys(value)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') return true;
    if (hasDangerousKey(value[key])) return true;
  }
  return false;
}

function invalidScore(value) {
  if (typeof value === 'number') return !Number.isInteger(value) || value < 0 || value > 5;
  if (!value || typeof value !== 'object') return true;
  for (const field of ['lastScore', 'bestScore']) {
    if (value[field] !== undefined && (!Number.isInteger(value[field]) || value[field] < 0 || value[field] > 5)) return true;
  }
  return false;
}

export function validateProgressImport(raw, catalog, maxBytes = PROGRESS_IMPORT_MAX_BYTES) {
  if (typeof raw !== 'string') return { ok: false, reason: 'payload' };
  if (new TextEncoder().encode(raw).length > maxBytes) return { ok: false, reason: 'oversized' };
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, reason: 'json' };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || hasDangerousKey(parsed)) {
    return { ok: false, reason: 'prototype' };
  }
  const sourceQuiz = parsed.quiz && typeof parsed.quiz === 'object' ? parsed.quiz : parsed.quizScores;
  if (sourceQuiz && typeof sourceQuiz === 'object') {
    if (hasDangerousKey(sourceQuiz)) return { ok: false, reason: 'prototype' };
    for (const [moduleId, value] of Object.entries(sourceQuiz)) {
      if (!catalog.moduleIds.includes(moduleId)) return { ok: false, reason: 'unknown-id' };
      if (invalidScore(value)) return { ok: false, reason: 'score' };
    }
  }
  const migrated = migrateProgress(parsed);
  if (!migrated) return { ok: false, reason: 'format' };
  const unknown = [
    ...migrated.lessonsDone.filter((id) => !catalog.lessonIds.includes(id)),
    ...migrated.exercisesDone.filter((id) => !catalog.exerciseIds.includes(id)),
    ...migrated.unlockedModules.filter((id) => id !== 'sandbox' && !catalog.moduleIds.includes(id)),
    ...migrated.ctfSolved.filter((id) => !catalog.ctfIds.includes(id)),
  ];
  if (unknown.length) return { ok: false, reason: 'unknown-id' };
  const data = {
    _format: PROGRESS_FORMAT_V2,
    lessonsDone: migrated.lessonsDone.slice(),
    exercisesDone: migrated.exercisesDone.slice(),
    quiz: { ...migrated.quiz },
    unlockedModules: migrated.unlockedModules.slice(),
    ctfSolved: migrated.ctfSolved.slice(),
    ctfHints: { ...migrated.ctfHints },
    ctfHow: { ...migrated.ctfHow },
  };
  const preview = [
    `${data.lessonsDone.length} leçon${data.lessonsDone.length === 1 ? '' : 's'}`,
    `${data.exercisesDone.length} exercice${data.exercisesDone.length === 1 ? '' : 's'}`,
    `${Object.keys(data.quiz).length} quiz`,
    `${data.ctfSolved.length} CTF`,
  ].join(', ');
  return { ok: true, data, preview };
}

export function nextModuleId(moduleId, modules) {
  const published = modules.filter((entry) => entry.status === 'published').sort((a, b) => a.displayOrder - b.displayOrder);
  const index = published.findIndex((entry) => entry.id === moduleId);
  if (index < 0 || index === published.length - 1) return null;
  const current = published[index];
  const next = published[index + 1];
  // La chaîne principale (linux → network → offsec) se termine à m14 : on ne
  // propose jamais un module de la track hardware comme « suivant » depuis
  // la chaîne principale (la section Lab & Tinker a sa propre entrée).
  if (current.track !== 'hardware' && next.track === 'hardware') return null;
  return next.id;
}
