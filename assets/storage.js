/* ============================================================
   DATA — chargées via fetch() depuis data/*.json
   ============================================================ */
let LESSONS   = {};
let EXERCISES = {};
let QUIZZES   = {};
let MODULES   = [];
let PASS_SCORE = 3;
let MODULE_META = {
  sandbox: { title: 'Sandbox Linux', desc: 'Terminal Linux réel (image de démonstration v86) via WebAssembly.' }
};

let TRACKS = [];
function applyModules(list, options) {
  if (options && Number.isFinite(options.passScore)) PASS_SCORE = options.passScore;
  TRACKS = options && Array.isArray(options.tracks) ? options.tracks : [];
  MODULES = Array.isArray(list) ? list.slice().sort((a, b) => a.displayOrder - b.displayOrder) : [];
  MODULE_META = {
    sandbox: { title: 'Sandbox Linux', desc: 'Terminal Linux réel (image de démonstration v86) via WebAssembly.' }
  };
  MODULES.forEach(function (entry) {
    MODULE_META[entry.id] = {
      title: entry.title,
      desc: entry.description,
      track: entry.track,
      icon: entry.icon || '',
      displayOrder: entry.displayOrder,
      prerequisites: entry.prerequisites || [],
      objectives: entry.objectives || [],
      estimatedMinutes: entry.estimatedMinutes,
      successCriteria: entry.successCriteria || '',
      chapters: entry.chapters || []
    };
  });
}

function getPublishedModuleIds() {
  return MODULES.filter(function (entry) { return entry.status === 'published'; }).map(function (entry) { return entry.id; });
}

function getTrackModuleIds(track) {
  return MODULES.filter(function (entry) { return entry.track === track && entry.status === 'published'; }).map(function (entry) { return entry.id; });
}

function getCurriculumStats() {
  function count(source) {
    return Object.keys(source).reduce(function (total, key) {
      return total + (Array.isArray(source[key]) ? source[key].length : 0);
    }, 0);
  }
  var quizzes = typeof QUIZZES !== 'undefined' ? QUIZZES : {};
  var challenges = typeof CTF_CHALLENGES !== 'undefined' && Array.isArray(CTF_CHALLENGES) ? CTF_CHALLENGES : [];
  var difficulty = { easy: 0, medium: 0, hard: 0 };
  challenges.forEach(function (challenge) {
    if (Object.prototype.hasOwnProperty.call(difficulty, challenge.difficulty)) difficulty[challenge.difficulty] += 1;
  });
  return {
    modules: Object.keys(typeof LESSONS !== 'undefined' ? LESSONS : {}).length,
    lessons: count(typeof LESSONS !== 'undefined' ? LESSONS : {}),
    exercises: count(typeof EXERCISES !== 'undefined' ? EXERCISES : {}),
    quizzes: Object.keys(quizzes).length,
    questions: Object.keys(quizzes).reduce(function (total, moduleId) {
      var quiz = quizzes[moduleId];
      return total + (quiz && Array.isArray(quiz.questions) ? quiz.questions.length : 0);
    }, 0),
    challenges: challenges.length,
    difficulty: difficulty
  };
}

function getModuleCounts(mod) {
  var quiz = typeof QUIZZES !== 'undefined' ? QUIZZES[mod] : null;
  return {
    lessons: (LESSONS[mod] || []).length,
    exercises: (EXERCISES[mod] || []).length,
    quizzes: quiz ? 1 : 0,
    questions: quiz && Array.isArray(quiz.questions) ? quiz.questions.length : 0
  };
}

/* ============================================================
   STATE & STORAGE
   ============================================================ */


let state = {
  lessonsDone:     new Set(),
  exercisesDone:   new Set(),
  quizScores:      {}, // { m1: 4, m2: 3, ... }
  unlockedModules: new Set(['m1', 'sandbox', 'm9', 'm12'])
};

/* ============================================================
   STORAGE — localStorage only (progress is tiny)
   ============================================================ */

const STORAGE_KEYS = {
  lessonsDone:     'lt_lessonsDone',
  exercisesDone:   'lt_exercisesDone',
  quizScores:      'lt_quizScores',
  unlockedModules: 'lt_unlockedModules'
};

const _lsStore  = {};
const _lsRaw    = (() => { try { return window.localStorage; } catch(_) { return null; } })();

function _lsFallbackGet(key) {
  try { return _lsRaw ? _lsRaw.getItem(key) : (_lsStore[key] ?? null); }
  catch(_) { return _lsStore[key] ?? null; }
}
function _lsFallbackSet(key, value) {
  try { if (_lsRaw) _lsRaw.setItem(key, value); else _lsStore[key] = value; }
  catch(_) { _lsStore[key] = value; }
}

const storage = {
  get(key) {
    return Promise.resolve(_lsFallbackGet(key));
  },
  set(key, value) {
    _lsFallbackSet(key, value);
    return Promise.resolve();
  }
};

async function initStorage() {
  return undefined;
}

// --- Fonctions de persistance de l'état ---

async function saveState() {
  await Promise.all([
    storage.set(STORAGE_KEYS.lessonsDone,     JSON.stringify([...state.lessonsDone])),
    storage.set(STORAGE_KEYS.exercisesDone,   JSON.stringify([...state.exercisesDone])),
    storage.set(STORAGE_KEYS.quizScores,      JSON.stringify(state.quizScores)),
    storage.set(STORAGE_KEYS.unlockedModules, JSON.stringify([...state.unlockedModules]))
  ]);
}

async function loadState() {
  try {
    const [ld, ed, qs, um] = await Promise.all([
      storage.get(STORAGE_KEYS.lessonsDone),
      storage.get(STORAGE_KEYS.exercisesDone),
      storage.get(STORAGE_KEYS.quizScores),
      storage.get(STORAGE_KEYS.unlockedModules)
    ]);
    if (ld) state.lessonsDone     = new Set(JSON.parse(ld));
    if (ed) state.exercisesDone   = new Set(JSON.parse(ed));
    if (qs) state.quizScores = migrateProgress({ _format: 'linuxpath-progress-v2', quiz: JSON.parse(qs) }).quiz;
    if (um) state.unlockedModules = new Set(JSON.parse(um));
    refreshUnlocks();
  } catch(e) { /* état par défaut conservé */ }
}

async function resetState() {
  state.lessonsDone     = new Set();
  state.exercisesDone   = new Set();
  state.quizScores      = {};
  state.unlockedModules = new Set(['m1', 'sandbox', 'm9']);
  await saveState();
  // Réinitialiser aussi la progression CTF
  ctfState.solved = new Set();
  ctfState.hints  = {};
  await saveCTFState();
}

async function confirmReset() {
  if (confirm('Voulez-vous vraiment réinitialiser toute votre progression ? Cette action est irréversible.')) {
    await resetState();
    location.reload();
  }
}



function activityBelongsToModule(id, moduleId) {
  return typeof id === 'string' && typeof moduleId === 'string' && (id === moduleId || id.startsWith(moduleId + '-'));
}

function normalizeQuizRecord(value, passScore) {
  if (passScore === undefined) passScore = PASS_SCORE;
  if (typeof value === 'number' && Number.isFinite(value)) {
    const score = Math.max(0, Math.round(value));
    return { attempts: 1, bestScore: score, lastScore: score, passed: score >= passScore };
  }
  if (!value || typeof value !== 'object') return null;
  const lastScore = Number.isFinite(value.lastScore) ? Math.max(0, Math.round(value.lastScore)) : null;
  const bestScore = Number.isFinite(value.bestScore) ? Math.max(0, Math.round(value.bestScore)) : lastScore;
  const attempts = Number.isFinite(value.attempts) ? Math.max(1, Math.round(value.attempts)) : 1;
  if (lastScore === null && bestScore === null) return null;
  const last = lastScore === null ? bestScore : lastScore;
  const best = Math.max(bestScore || 0, last);
  return {
    attempts: attempts,
    bestScore: best,
    lastScore: last,
    passed: value.passed === true || best >= passScore
  };
}

function recordQuizAttempt(existing, score, passScore) {
  if (passScore === undefined) passScore = PASS_SCORE;
  const previous = normalizeQuizRecord(existing, passScore);
  const lastScore = Math.max(0, Math.round(score));
  const bestScore = Math.max(previous ? previous.bestScore : 0, lastScore);
  return {
    attempts: (previous ? previous.attempts : 0) + 1,
    bestScore: bestScore,
    lastScore: lastScore,
    passed: Boolean(previous && previous.passed) || lastScore >= passScore
  };
}

function getQuizRecord(mod) {
  return normalizeQuizRecord(state.quizScores[mod]);
}

function isQuizPassed(mod) {
  const record = getQuizRecord(mod);
  return Boolean(record && record.passed);
}

function migrateProgress(data) {
  if (!data || typeof data !== 'object') return null;
  const format = data._format;
  if (format !== 'linuxpath-progress-v1' && format !== 'linuxpath-progress-v2') return null;
  const sourceQuiz = data.quiz && typeof data.quiz === 'object' ? data.quiz : data.quizScores;
  const quiz = {};
  if (sourceQuiz && typeof sourceQuiz === 'object') {
    Object.keys(sourceQuiz).forEach(function (moduleId) {
      const record = normalizeQuizRecord(sourceQuiz[moduleId]);
      if (record) quiz[moduleId] = record;
    });
  }
  return {
    _format: 'linuxpath-progress-v2',
    lessonsDone: Array.isArray(data.lessonsDone) ? data.lessonsDone.filter(function (id) { return typeof id === 'string'; }) : [],
    exercisesDone: Array.isArray(data.exercisesDone) ? data.exercisesDone.filter(function (id) { return typeof id === 'string'; }) : [],
    quiz: quiz,
    unlockedModules: Array.isArray(data.unlockedModules) ? data.unlockedModules.filter(function (id) { return typeof id === 'string'; }) : [],
    ctfSolved: Array.isArray(data.ctfSolved) ? data.ctfSolved.filter(function (id) { return typeof id === 'string'; }) : [],
    ctfHints: data.ctfHints && typeof data.ctfHints === 'object' ? data.ctfHints : {},
    ctfHow: data.ctfHow && typeof data.ctfHow === 'object' ? data.ctfHow : {}
  };
}

function countOwned(set, mod) {
  var n = 0;
  set.forEach(function (id) { if (activityBelongsToModule(id, mod)) n += 1; });
  return n;
}

function getModuleProgress(mod) {
  const lessons = LESSONS[mod] || [];
  const exercises = EXERCISES[mod] || [];
  const lessonsDone = lessons.filter(function (lesson) { return state.lessonsDone.has(lesson.id); }).length;
  const exercisesDone = exercises.filter(function (exercise) { return state.exercisesDone.has(exercise.id); }).length;
  const record = getQuizRecord(mod);
  const quizDone = record && record.passed ? 1 : 0;
  const total = lessons.length + exercises.length + 1;
  const done = lessonsDone + exercisesDone + quizDone;
  const questionCount = (QUIZZES[mod] && QUIZZES[mod].questions) ? QUIZZES[mod].questions.length : 5;
  let status = 'locked';
  if (state.unlockedModules.has(mod)) {
    if (quizDone && lessonsDone >= lessons.length && exercisesDone >= exercises.length) {
      status = record && record.bestScore >= questionCount ? 'mastered' : 'passed';
    } else if (lessonsDone + exercisesDone + (record ? 1 : 0) > 0) {
      status = 'in_progress';
    } else {
      status = 'available';
    }
  }
  return { done: done, total: total, pct: total ? Math.round(done / total * 100) : 0, state: status, quiz: record };
}

function getTrackProgress(track) {
  const mods = getTrackModuleIds(track);
  let done = 0;
  let total = 0;
  mods.forEach(function (mod) {
    const progress = getModuleProgress(mod);
    done += progress.done;
    total += progress.total;
  });
  return { done: done, total: total, pct: total ? Math.round(done / total * 100) : 0 };
}

function getProgress() {
  const stats = getCurriculumStats();
  let passedQuizzes = 0;
  Object.keys(state.quizScores).forEach(function (mod) {
    if (isQuizPassed(mod)) passedQuizzes += 1;
  });
  const done = state.lessonsDone.size + state.exercisesDone.size + passedQuizzes;
  const total = stats.lessons + stats.exercises + stats.quizzes;
  return { done: done, total: total, pct: total ? Math.round(done / total * 100) : 0 };
}

function refreshUnlocks() {
  state.unlockedModules.add('m1');
  state.unlockedModules.add('sandbox');
  MODULES.forEach(function (entry) {
    const prereqs = entry.prerequisites || [];
    if (prereqs.every(function (id) { return isQuizPassed(id); })) {
      state.unlockedModules.add(entry.id);
    }
  });
}

function nextModuleId(mod) {
  const mods = getPublishedModuleIds();
  const idx = mods.indexOf(mod);
  if (idx < 0 || idx === mods.length - 1) return null;
  const next = mods[idx + 1];
  const trackOf = function (id) {
    for (const track of TRACKS) if (track.modules.includes(id)) return track.id;
    return null;
  };
  const modTrack = trackOf(mod);
  const nextTrack = trackOf(next);
  // La chaîne principale (linux → network → offsec) se termine à m14 : on ne
  // propose jamais un module de la track hardware comme « suivant » depuis
  // la chaîne principale (la section Lab & Tinker a sa propre entrée).
  if (modTrack && modTrack !== 'hardware' && nextTrack === 'hardware') return null;
  return next;
}

function applyImportedProgress(data) {
  const migrated = data && data._format === 'linuxpath-progress-v2' && Array.isArray(data.lessonsDone)
    ? {
        _format: 'linuxpath-progress-v2',
        lessonsDone: data.lessonsDone.slice(),
        exercisesDone: Array.isArray(data.exercisesDone) ? data.exercisesDone.slice() : [],
        quiz: data.quiz && typeof data.quiz === 'object' ? Object.assign({}, data.quiz) : {},
        unlockedModules: Array.isArray(data.unlockedModules) ? data.unlockedModules.slice() : [],
        ctfSolved: Array.isArray(data.ctfSolved) ? data.ctfSolved.slice() : [],
        ctfHints: data.ctfHints && typeof data.ctfHints === 'object' ? Object.assign({}, data.ctfHints) : {},
        ctfHow: data.ctfHow && typeof data.ctfHow === 'object' ? Object.assign({}, data.ctfHow) : {}
      }
    : migrateProgress(data);
  if (!migrated) throw new Error('invalid-progress-format');
  state.lessonsDone = new Set(migrated.lessonsDone);
  state.exercisesDone = new Set(migrated.exercisesDone);
  state.quizScores = migrated.quiz;
  state.unlockedModules = new Set(migrated.unlockedModules);
  refreshUnlocks();
  if (typeof ctfState !== 'undefined') {
    ctfState.solved = new Set(migrated.ctfSolved);
    ctfState.hints = migrated.ctfHints;
    ctfState.how = migrated.ctfHow && typeof migrated.ctfHow === 'object' ? migrated.ctfHow : {};
  }
  return migrated;
}

function exportProgressData() {
  return {
    _format: 'linuxpath-progress-v2',
    exportDate: new Date().toISOString(),
    lessonsDone: Array.from(state.lessonsDone),
    exercisesDone: Array.from(state.exercisesDone),
    quiz: state.quizScores,
    unlockedModules: Array.from(state.unlockedModules),
    ctfSolved: typeof ctfState !== 'undefined' ? Array.from(ctfState.solved) : [],
    ctfHints: typeof ctfState !== 'undefined' ? ctfState.hints : {},
    ctfHow: typeof ctfState !== 'undefined' ? (ctfState.how || {}) : {}
  };
}

function resetModuleProgress(mod) {
  (LESSONS[mod] || []).forEach(function (lesson) { state.lessonsDone.delete(lesson.id); });
  (EXERCISES[mod] || []).forEach(function (exercise) { state.exercisesDone.delete(exercise.id); });
  delete state.quizScores[mod];
}

/* ============================================================
   EXPORT / IMPORT de la progression
   ============================================================ */

/**
 * Exporte toute la progression (état + CTF) dans un fichier JSON.
 */
function exportProgress() {
  var data = exportProgressData();

  var json = JSON.stringify(data, null, 2);
  var blob = new Blob([json], { type: 'application/json' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = 'linuxpath-progress-' + new Date().toISOString().slice(0, 10) + '.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Importe la progression depuis un fichier JSON sélectionné par l'utilisateur.
 */
function importCatalog() {
  return {
    lessonIds: Object.values(LESSONS || {}).flat().map(function (entry) { return entry.id; }),
    exerciseIds: Object.values(EXERCISES || {}).flat().map(function (entry) { return entry.id; }),
    moduleIds: (typeof getPublishedModuleIds === 'function' ? getPublishedModuleIds() : Object.keys(LESSONS || {})).concat(['sandbox']),
    ctfIds: (typeof CTF_CHALLENGES !== 'undefined' ? CTF_CHALLENGES : []).map(function (entry) { return entry.id; })
  };
}

function hasDangerousKey(value) {
  if (!value || typeof value !== 'object') return false;
  if (Object.prototype.hasOwnProperty.call(value, '__proto__') || Object.prototype.hasOwnProperty.call(value, 'constructor') || Object.prototype.hasOwnProperty.call(value, 'prototype')) return true;
  for (const key of Object.keys(value)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') return true;
    if (hasDangerousKey(value[key])) return true;
  }
  return false;
}

function validateProgressImport(raw, catalog) {
  if (typeof raw !== 'string') return { ok: false, reason: 'payload' };
  if (new TextEncoder().encode(raw).length > 100000) return { ok: false, reason: 'oversized' };
  let parsed;
  try { parsed = JSON.parse(raw); } catch (err) { return { ok: false, reason: 'json' }; }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || hasDangerousKey(parsed)) return { ok: false, reason: 'prototype' };
  const sourceQuiz = parsed.quiz && typeof parsed.quiz === 'object' ? parsed.quiz : parsed.quizScores;
  if (sourceQuiz && typeof sourceQuiz === 'object') {
    if (hasDangerousKey(sourceQuiz)) return { ok: false, reason: 'prototype' };
    for (const moduleId of Object.keys(sourceQuiz)) {
      if (catalog.moduleIds.indexOf(moduleId) < 0) return { ok: false, reason: 'unknown-id' };
      const value = sourceQuiz[moduleId];
      if (typeof value === 'number') {
        if (!Number.isInteger(value) || value < 0 || value > 5) return { ok: false, reason: 'score' };
      } else if (!value || typeof value !== 'object') {
        return { ok: false, reason: 'score' };
      } else {
        for (const field of ['lastScore', 'bestScore']) {
          if (value[field] !== undefined && (!Number.isInteger(value[field]) || value[field] < 0 || value[field] > 5)) return { ok: false, reason: 'score' };
        }
      }
    }
  }
  const migrated = migrateProgress(parsed);
  if (!migrated) return { ok: false, reason: 'format' };
  const unknown = migrated.lessonsDone.some(function (id) { return catalog.lessonIds.indexOf(id) < 0; })
    || migrated.exercisesDone.some(function (id) { return catalog.exerciseIds.indexOf(id) < 0; })
    || migrated.unlockedModules.some(function (id) { return id !== 'sandbox' && catalog.moduleIds.indexOf(id) < 0; })
    || migrated.ctfSolved.some(function (id) { return catalog.ctfIds.indexOf(id) < 0; });
  if (unknown) return { ok: false, reason: 'unknown-id' };
  const preview = [
    migrated.lessonsDone.length + ' leçon' + (migrated.lessonsDone.length === 1 ? '' : 's'),
    migrated.exercisesDone.length + ' exercice' + (migrated.exercisesDone.length === 1 ? '' : 's'),
    Object.keys(migrated.quiz).length + ' quiz',
    migrated.ctfSolved.length + ' CTF'
  ].join(', ');
  return { ok: true, data: migrated, preview: preview };
}

function importProgress() {
  var input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = async function(e) {
    var file = e.target.files[0];
    if (!file) return;
    try {
      if (file.size > 100000) {
        alert('Fichier trop volumineux.');
        return;
      }
      var text = await file.text();
      var result = validateProgressImport(text, importCatalog());
      if (!result.ok) {
        alert('Import refusé (' + result.reason + '). Aucune donnée n\'a été appliquée.');
        return;
      }
      if (!confirm('Importer cette sauvegarde (' + result.preview + ') remplacera votre progression actuelle. Continuer ?')) {
        return;
      }
      applyImportedProgress(result.data);
      await saveState();
      if (typeof saveCTFState === 'function') await saveCTFState();
      alert('Progression importée avec succès !');
      location.reload();
    } catch (err) {
      alert('Erreur lors de l\'import : ' + err.message);
    }
  };
  input.click();
}

