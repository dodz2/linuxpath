function cloneVariantValue(value) { return JSON.parse(JSON.stringify(value)); }
function variantParentPath(path) { var index = path.lastIndexOf('/'); return index <= 0 ? '/' : path.slice(0, index); }
function variantBasename(path) { return path.slice(path.lastIndexOf('/') + 1); }

function applyVfsOverlay(baseVfs, overlay) {
  overlay = overlay || {};
  var vfs = cloneVariantValue(baseVfs || {});
  (overlay.remove || []).forEach(function (path) { delete vfs[path]; });
  Object.keys(overlay.paths || {}).forEach(function (path) { vfs[path] = cloneVariantValue(overlay.paths[path]); });
  Object.keys(vfs).forEach(function (path) {
    var node = vfs[path];
    if (!node || node.type !== 'dir') return;
    node.children = (node.children || []).filter(function (child) {
      var childPath = path === '/' ? '/' + child : path + '/' + child;
      return Object.prototype.hasOwnProperty.call(vfs, childPath);
    });
  });
  Object.keys(vfs).forEach(function (path) {
    if (path === '/') return;
    var parent = variantParentPath(path);
    if (!vfs[parent] || vfs[parent].type !== 'dir') throw new Error('Overlay VFS sans parent valide : ' + path);
    var name = variantBasename(path);
    if (vfs[parent].children.indexOf(name) < 0) vfs[parent].children.push(name);
  });
  return vfs;
}

function normalizedReportArray(value) {
  return Array.isArray(value) ? Array.from(new Set(value.filter(function (item) { return typeof item === 'string'; }))).sort() : [];
}

function evaluateReport(fields, expected, actual) {
  var incorrectFields = [];
  expected = expected || {}; actual = actual || {};
  (fields || []).forEach(function (field) {
    var value = actual[field.id];
    if (field.type === 'textarea' && field.semantic === false) {
      if (typeof value !== 'string' || value.trim().length < (field.minLength || 1)) incorrectFields.push(field.id);
    } else if (field.type === 'checkboxes') {
      if (JSON.stringify(normalizedReportArray(value)) !== JSON.stringify(normalizedReportArray(expected[field.id]))) incorrectFields.push(field.id);
    } else if (String(value || '').trim() !== String(expected[field.id] || '').trim()) {
      incorrectFields.push(field.id);
    }
  });
  return { ok: incorrectFields.length === 0, incorrectFields: incorrectFields };
}

function dossierIsComplete(group, variantId, results) {
  results = results || {};
  return (group.exerciseIds || []).every(function (exerciseId) {
    var solved = results[exerciseId] && results[exerciseId].solvedVariants || [];
    return solved.indexOf(variantId) >= 0;
  });
}

function masteredDossierCount(group, results) {
  return (group.variants || []).filter(function (variant) { return dossierIsComplete(group, variant.id, results); }).length;
}

function nextVariantId(group, currentId, results) {
  var variants = group.variants || [];
  if (!variants.length) return null;
  var currentIndex = variants.findIndex(function (variant) { return variant.id === currentId; });
  if (currentIndex < 0) currentIndex = 0;
  for (var offset = 1; offset <= variants.length; offset += 1) {
    var candidate = variants[(currentIndex + offset) % variants.length];
    if (!dossierIsComplete(group, candidate.id, results || {})) return candidate.id;
  }
  return variants[(currentIndex + 1) % variants.length].id;
}

function sanitizeVariantProgress(progress, catalogue) {
  progress = progress || {}; catalogue = catalogue || { groups: {} };
  var assignments = {}; var results = {}; var allowedByExercise = {};
  Object.keys(catalogue.groups || {}).forEach(function (groupId) {
    var group = catalogue.groups[groupId];
    var variantIds = (group.variants || []).map(function (variant) { return variant.id; });
    if (variantIds.indexOf(progress.assignments && progress.assignments[groupId]) >= 0) assignments[groupId] = progress.assignments[groupId];
    (group.exerciseIds || []).forEach(function (exerciseId) { allowedByExercise[exerciseId] = variantIds; });
  });
  Object.keys(progress.results || {}).forEach(function (exerciseId) {
    var allowed = allowedByExercise[exerciseId]; var value = progress.results[exerciseId];
    if (!allowed || !value || typeof value !== 'object') return;
    var solvedVariants = normalizedReportArray(value.solvedVariants).filter(function (variantId) { return allowed.indexOf(variantId) >= 0; });
    var attemptsByVariant = {};
    Object.keys(value.attemptsByVariant || {}).forEach(function (variantId) {
      var count = value.attemptsByVariant[variantId];
      if (allowed.indexOf(variantId) >= 0 && Number.isFinite(count) && count >= 0) attemptsByVariant[variantId] = Math.min(50, Math.round(count));
    });
    if (solvedVariants.length || Object.keys(attemptsByVariant).length) results[exerciseId] = { solvedVariants: solvedVariants, attemptsByVariant: attemptsByVariant };
  });
  return { assignments: assignments, results: results };
}

function getVariantGroupByModule(mod) {
  var groups = EXERCISE_VARIANTS && EXERCISE_VARIANTS.groups || {};
  return Object.keys(groups).map(function (id) { return groups[id]; }).find(function (group) { return group.moduleId === mod; }) || null;
}

function randomVariantIndex(length) {
  if (window.crypto && window.crypto.getRandomValues) {
    var values = new Uint32Array(1); window.crypto.getRandomValues(values); return values[0] % length;
  }
  return Math.floor(Math.random() * length);
}

function ensureVariantAssignment(group) {
  if (!state.variantAssignments) state.variantAssignments = {};
  var known = (group.variants || []).some(function (variant) { return variant.id === state.variantAssignments[group.id]; });
  if (!known) {
    state.variantAssignments[group.id] = group.variants[randomVariantIndex(group.variants.length)].id;
    if (typeof saveState === 'function') saveState();
  }
  return state.variantAssignments[group.id];
}

function getActiveVariant(mod) {
  var group = getVariantGroupByModule(mod);
  if (!group) return null;
  var id = ensureVariantAssignment(group);
  return group.variants.find(function (variant) { return variant.id === id; }) || group.variants[0];
}

function getEffectiveExercise(exercise, mod) {
  var variant = getActiveVariant(mod);
  var override = variant && variant.exercises && variant.exercises[exercise.id];
  return override ? Object.assign({}, exercise, override) : exercise;
}

function activateVariantForModule(mod) {
  var variant = getActiveVariant(mod);
  if (variant && typeof activateMainTerminalScenario === 'function') activateMainTerminalScenario(variant.vfsOverlay || {}, variant.id);
  return variant;
}

function variantResult(exerciseId) {
  if (!state.variantResults) state.variantResults = {};
  if (!state.variantResults[exerciseId]) state.variantResults[exerciseId] = { solvedVariants: [], attemptsByVariant: {} };
  return state.variantResults[exerciseId];
}

function recordVariantAttempt(exerciseId, variantId) {
  var result = variantResult(exerciseId);
  result.attemptsByVariant[variantId] = Math.min(50, (result.attemptsByVariant[variantId] || 0) + 1);
  return result.attemptsByVariant[variantId];
}

function recordVariantSolved(exerciseId, variantId) {
  var result = variantResult(exerciseId);
  if (result.solvedVariants.indexOf(variantId) < 0) result.solvedVariants.push(variantId);
}

async function switchVariant(mod) {
  var group = getVariantGroupByModule(mod);
  if (!group) return;
  var currentId = ensureVariantAssignment(group);
  if (!dossierIsComplete(group, currentId, state.variantResults || {})) return;
  state.variantAssignments[group.id] = nextVariantId(group, currentId, state.variantResults || {});
  activateVariantForModule(mod);
  await saveState();
  renderExercises(mod);
}
