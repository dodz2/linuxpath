export function normalizeNodeVersion(value) {
  return String(value || '').trim().replace(/^v/, '');
}

export function normalizePythonVersion(value) {
  return String(value || '').trim().replace(/^Python\s+/i, '').split(/\s+/)[0];
}

export function normalizeUvVersion(value) {
  return String(value || '').trim().replace(/^uv\s+/i, '').split(/\s+/)[0];
}

export function validateToolchain(actual, expected) {
  const node = normalizeNodeVersion(actual?.node);
  const npm = String(actual?.npm || '').trim();
  const python = normalizePythonVersion(actual?.python);
  const uv = normalizeUvVersion(actual?.uv);
  const expectedNode = normalizeNodeVersion(expected?.node);
  const expectedNpm = String(expected?.npm || '').trim();
  const expectedPython = normalizePythonVersion(expected?.python);
  const expectedUv = normalizeUvVersion(expected?.uv);
  const errors = [];
  if (node !== expectedNode) errors.push(`Node ${expectedNode} requis, version active ${node || 'indisponible'}`);
  if (npm !== expectedNpm) errors.push(`npm ${expectedNpm} requis, version active ${npm || 'indisponible'}`);
  if (python !== expectedPython) errors.push(`Python ${expectedPython} requis, version active ${python || 'indisponible'}`);
  if (uv !== expectedUv) errors.push(`uv ${expectedUv} requis, version active ${uv || 'indisponible'}`);
  return { ok: errors.length === 0, errors };
}
