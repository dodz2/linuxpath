function clone(value) {
  return structuredClone(value);
}

function parentPath(path) {
  const index = path.lastIndexOf('/');
  return index <= 0 ? '/' : path.slice(0, index);
}

function basename(path) {
  return path.slice(path.lastIndexOf('/') + 1);
}

export function applyVfsOverlay(baseVfs, overlay = {}) {
  const vfs = clone(baseVfs || {});
  for (const path of overlay.remove || []) delete vfs[path];
  for (const [path, node] of Object.entries(overlay.paths || {})) vfs[path] = clone(node);

  for (const [path, node] of Object.entries(vfs)) {
    if (!node || node.type !== 'dir') continue;
    node.children = (node.children || []).filter((child) => {
      const childPath = path === '/' ? `/${child}` : `${path}/${child}`;
      return Object.hasOwn(vfs, childPath);
    });
  }
  for (const path of Object.keys(vfs)) {
    if (path === '/') continue;
    const parent = parentPath(path);
    if (!vfs[parent] || vfs[parent].type !== 'dir') throw new Error(`Overlay VFS sans parent valide : ${path}`);
    const name = basename(path);
    if (!vfs[parent].children.includes(name)) vfs[parent].children.push(name);
  }
  return vfs;
}

function normalizedArray(value) {
  return Array.isArray(value) ? [...new Set(value.filter((item) => typeof item === 'string'))].sort() : [];
}

export function evaluateReport(fields = [], expected = {}, actual = {}) {
  const incorrectFields = [];
  for (const field of fields) {
    const value = actual[field.id];
    if (field.type === 'textarea' && field.semantic === false) {
      if (typeof value !== 'string' || value.trim().length < (field.minLength || 1)) incorrectFields.push(field.id);
      continue;
    }
    if (field.type === 'checkboxes') {
      if (JSON.stringify(normalizedArray(value)) !== JSON.stringify(normalizedArray(expected[field.id]))) incorrectFields.push(field.id);
      continue;
    }
    if (String(value || '').trim() !== String(expected[field.id] || '').trim()) incorrectFields.push(field.id);
  }
  return { ok: incorrectFields.length === 0, incorrectFields };
}

export function dossierIsComplete(group, variantId, results = {}) {
  return (group.exerciseIds || []).every((exerciseId) => {
    const solved = results[exerciseId]?.solvedVariants || [];
    return solved.includes(variantId);
  });
}

export function masteredDossierCount(group, results = {}) {
  return (group.variants || []).filter((variant) => dossierIsComplete(group, variant.id, results)).length;
}

export function nextVariantId(group, currentId, results = {}) {
  const variants = group.variants || [];
  if (!variants.length) return null;
  const currentIndex = Math.max(0, variants.findIndex((variant) => variant.id === currentId));
  for (let offset = 1; offset <= variants.length; offset += 1) {
    const candidate = variants[(currentIndex + offset) % variants.length];
    if (!dossierIsComplete(group, candidate.id, results)) return candidate.id;
  }
  return variants[(currentIndex + 1) % variants.length].id;
}

export function sanitizeVariantProgress(progress = {}, catalogue = { groups: {} }) {
  const assignments = {};
  const results = {};
  const allowedByExercise = new Map();
  for (const [groupId, group] of Object.entries(catalogue.groups || {})) {
    const variantIds = new Set((group.variants || []).map((variant) => variant.id));
    if (variantIds.has(progress.assignments?.[groupId])) assignments[groupId] = progress.assignments[groupId];
    for (const exerciseId of group.exerciseIds || []) allowedByExercise.set(exerciseId, variantIds);
  }
  for (const [exerciseId, value] of Object.entries(progress.results || {})) {
    const allowed = allowedByExercise.get(exerciseId);
    if (!allowed || !value || typeof value !== 'object') continue;
    const solvedVariants = normalizedArray(value.solvedVariants).filter((id) => allowed.has(id));
    const attemptsByVariant = {};
    for (const [variantId, count] of Object.entries(value.attemptsByVariant || {})) {
      if (allowed.has(variantId) && Number.isFinite(count) && count >= 0) attemptsByVariant[variantId] = Math.min(50, Math.round(count));
    }
    if (solvedVariants.length || Object.keys(attemptsByVariant).length) results[exerciseId] = { solvedVariants, attemptsByVariant };
  }
  return { assignments, results };
}
