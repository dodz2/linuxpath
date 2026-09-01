import { createHash } from 'node:crypto';

const MANIFEST_SCHEMA_VERSION = 2;
const REQUIRED_CRITICAL_FILES = [
  'assets/app.min.js',
  'assets/pedagogical-commands.min.js',
  'assets/terminal-core.min.js',
  'data/modules.json',
  'index.html',
  'sw.js',
];
const SHA_PATTERN = /^[0-9a-f]{40}$/i;
const HASH_PATTERN = /^[0-9a-f]{64}$/;

function assertRecord(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
}

function isSafeManifestPath(file) {
  if (typeof file !== 'string' || !file || file.startsWith('/') || file.includes('\\')) return false;
  const segments = file.split('/');
  return segments.every((segment) => (
    segment
    && segment !== '.'
    && segment !== '..'
    && /^[A-Za-z0-9._-]+$/.test(segment)
  ));
}

function cacheBustedUrl(baseUrl, relativePath, expectedCommit, nonce) {
  if (!isSafeManifestPath(relativePath)) throw new Error(`Invalid manifest path: ${relativePath}`);
  const url = new URL(relativePath, baseUrl);
  if (url.origin !== baseUrl.origin || !url.pathname.startsWith(baseUrl.pathname)) {
    throw new Error(`Invalid manifest path: ${relativePath}`);
  }
  url.searchParams.set('commit', expectedCommit);
  url.searchParams.set('cacheBust', nonce);
  return url;
}

async function fetchBytes(url) {
  const response = await fetch(url, {
    cache: 'no-store',
    headers: { 'cache-control': 'no-cache' },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} while fetching ${url.pathname}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

function validateManifest(manifest, expectedCommit) {
  assertRecord(manifest, 'build manifest');
  if (manifest.schemaVersion !== MANIFEST_SCHEMA_VERSION) {
    throw new Error(`Schema version mismatch: expected ${MANIFEST_SCHEMA_VERSION}, got ${manifest.schemaVersion}`);
  }
  if (String(manifest.sourceCommit).toLowerCase() !== expectedCommit) {
    throw new Error(`Source commit mismatch: expected ${expectedCommit}, got ${manifest.sourceCommit || 'missing'}`);
  }

  assertRecord(manifest.files, 'manifest.files');
  const entries = Object.entries(manifest.files);
  if (!Number.isInteger(manifest.entryCount) || manifest.entryCount !== entries.length) {
    throw new Error(`Entry count mismatch: declared ${manifest.entryCount}, found ${entries.length}`);
  }
  for (const [file, hash] of entries) {
    if (!isSafeManifestPath(file)) {
      throw new Error(`Invalid manifest path: ${file}`);
    }
    if (!HASH_PATTERN.test(hash)) throw new Error(`Invalid SHA-256 for ${file}`);
  }

  assertRecord(manifest.criticalHashes, 'manifest.criticalHashes');
  for (const file of REQUIRED_CRITICAL_FILES) {
    if (!Object.hasOwn(manifest.criticalHashes, file)) {
      throw new Error(`Missing critical hash: ${file}`);
    }
  }
  for (const [file, hash] of Object.entries(manifest.criticalHashes)) {
    if (!HASH_PATTERN.test(hash)) throw new Error(`Invalid critical SHA-256 for ${file}`);
    if (manifest.files[file] !== hash) {
      throw new Error(`Critical hash disagrees with files entry: ${file}`);
    }
  }

  return Object.entries(manifest.criticalHashes);
}

export async function verifyLiveDeployment(baseUrlValue, expectedCommitValue) {
  if (!SHA_PATTERN.test(expectedCommitValue || '')) {
    throw new Error('Expected source commit must be a full 40-character Git SHA');
  }
  const expectedCommit = expectedCommitValue.toLowerCase();
  const baseUrl = new URL(baseUrlValue);
  if (!baseUrl.pathname.endsWith('/')) baseUrl.pathname += '/';
  baseUrl.search = '';
  baseUrl.hash = '';
  const nonce = `${Date.now()}-${process.pid}`;

  const manifestUrl = cacheBustedUrl(baseUrl, 'build-manifest.json', expectedCommit, nonce);
  const manifestBytes = await fetchBytes(manifestUrl);
  let manifest;
  try {
    manifest = JSON.parse(manifestBytes.toString('utf8'));
  } catch (error) {
    throw new Error(`Invalid live build manifest JSON: ${error.message}`, { cause: error });
  }

  const criticalEntries = validateManifest(manifest, expectedCommit);
  for (const [file, expectedHash] of criticalEntries) {
    const resourceUrl = cacheBustedUrl(baseUrl, file, expectedCommit, nonce);
    const actualHash = createHash('sha256').update(await fetchBytes(resourceUrl)).digest('hex');
    if (actualHash !== expectedHash) {
      throw new Error(`Hash mismatch for ${file}: expected ${expectedHash}, got ${actualHash}`);
    }
  }

  return {
    schemaVersion: manifest.schemaVersion,
    sourceCommit: manifest.sourceCommit,
    entryCount: manifest.entryCount,
    criticalHashesVerified: criticalEntries.length,
    manifestUrl: manifestUrl.href,
  };
}

const isMain = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isMain) {
  const [baseUrl, expectedCommit] = process.argv.slice(2);
  if (!baseUrl || !expectedCommit) {
    console.error('Usage: node scripts/verify-live-deployment.mjs <base-url> <expected-source-sha>');
    process.exitCode = 2;
  } else {
    try {
      console.log(JSON.stringify(await verifyLiveDeployment(baseUrl, expectedCommit), null, 2));
    } catch (error) {
      console.error(`Live deployment verification failed: ${error.message}`);
      process.exitCode = 1;
    }
  }
}
