import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { minify } from 'terser';
import { checkReferences } from './lib/reference-check.mjs';
import { syncReadme } from './lib/sync-readme.mjs';

const root = process.cwd();
const dist = path.join(root, 'dist');
const rootFiles = ['index.html', 'manifest.json', 'robots.txt', 'sitemap.xml', 'sw.js'];
const directories = ['assets', 'data', 'v86'];

// `index.html` charge les bundles minifiés aussi bien à la racine que dans
// l'artefact Pages. Les régénérer d'abord évite qu'un test local ou un aperçu
// serve une version différente de celle placée dans dist/.
const sourceScripts = (await readdir(path.join(root, 'assets')))
  .filter((name) => name.endsWith('.js') && !name.endsWith('.min.js'))
  .sort();
for (const name of sourceScripts) {
  const source = await readFile(path.join(root, 'assets', name), 'utf8');
  const result = await minify(source, { compress: true, mangle: true });
  if (!result.code) throw new Error(`Terser produced no output for assets/${name}`);
  await writeFile(path.join(root, 'assets', name.replace(/\.js$/, '.min.js')), `${result.code}\n`);
}

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
await writeFile(path.join(dist, 'build-manifest.json'), `${JSON.stringify({ schemaVersion: 1, files: manifest }, null, 2)}\n`);

await syncReadme(root);

const references = await checkReferences(dist);
console.log(JSON.stringify({ copiedFiles: Object.keys(manifest).length, manifest: 'dist/build-manifest.json', missingReferences: references.missing }, null, 2));
if (references.missing.length) {
  console.error('Build artifact is incomplete: local references are missing.');
  process.exit(1);
}
