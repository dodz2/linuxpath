import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { checkReferences } from './lib/reference-check.mjs';
import { assertGeneratedAssetsCurrent, writeGeneratedAssets } from './lib/generated-assets.mjs';
import { assertTrackedFilesUnchanged, captureTrackedFiles } from './lib/tracked-files.mjs';
import { assertReadmeCurrent } from './lib/sync-readme.mjs';

const root = process.cwd();
const dist = path.join(root, 'dist');
const rootFiles = ['index.html', 'manifest.json', 'robots.txt', 'sitemap.xml', 'sw.js'];
const directories = ['assets', 'data', 'v86'];
const criticalFileNames = [
  'assets/app.min.js',
  'assets/terminal-core.min.js',
  'assets/pedagogical-commands.min.js',
  'data/modules.json',
  'index.html',
  'sw.js',
];

function resolveSourceCommit() {
  const configured = process.env.SOURCE_COMMIT || process.env.GITHUB_SHA;
  const commit = configured || execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
  }).trim();
  if (!/^[0-9a-f]{40}$/i.test(commit)) {
    throw new Error('SOURCE_COMMIT/GITHUB_SHA must be a full 40-character Git SHA');
  }
  return commit.toLowerCase();
}

// Qualifier README et les bundles suivis avant la moindre écriture. Le build
// ne doit jamais réparer silencieusement une source de preuve divergente.
await assertReadmeCurrent(root);
await assertGeneratedAssetsCurrent(root);
const trackedBeforeBuild = await captureTrackedFiles(root);
await writeGeneratedAssets(root);

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
for (const file of rootFiles) await cp(path.join(root, file), path.join(dist, file));
for (const directory of directories) await cp(path.join(root, directory), path.join(dist, directory), { recursive: true });
// L'utilisateur final ne doit recevoir que les artéfacts minifiés : les sources
// .js copiées ci-dessus sont des entrées de build, pas des ressources servies.
const assetEntries = await readdir(path.join(dist, 'assets'));
for (const name of assetEntries) {
  if (name.endsWith('.js') && !name.endsWith('.min.js')) {
    await rm(path.join(dist, 'assets', name), { force: true });
  }
}

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walk(full)); else files.push(full);
  }
  return files;
}
const manifest = {};
for (const file of await walk(dist)) {
  const relative = path.relative(dist, file).split(path.sep).join('/');
  if (relative === 'build-manifest.json') continue;
  manifest[relative] = createHash('sha256').update(await readFile(file)).digest('hex');
}
const criticalHashes = Object.fromEntries(criticalFileNames.map((file) => {
  if (!manifest[file]) throw new Error(`Critical build resource is missing: ${file}`);
  return [file, manifest[file]];
}));
const buildManifest = {
  schemaVersion: 2,
  sourceCommit: resolveSourceCommit(),
  entryCount: Object.keys(manifest).length,
  criticalHashes,
  files: manifest,
};
await writeFile(path.join(dist, 'build-manifest.json'), `${JSON.stringify(buildManifest, null, 2)}\n`);

const references = await checkReferences(dist);
await assertTrackedFilesUnchanged(trackedBeforeBuild, root);
console.log(JSON.stringify({ copiedFiles: Object.keys(manifest).length, manifest: 'dist/build-manifest.json', missingReferences: references.missing }, null, 2));
if (references.missing.length) {
  console.error('Build artifact is incomplete: local references are missing.');
  process.exit(1);
}
