import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { minify } from 'terser';

export const TERSER_OPTIONS = Object.freeze({ compress: true, mangle: true });

export async function generatedAssetPairs(root = process.cwd()) {
  const sourceNames = (await readdir(path.join(root, 'assets')))
    .filter((name) => name.endsWith('.js') && !name.endsWith('.min.js'))
    .sort();
  return sourceNames.map((sourceName) => ({
    sourceName,
    sourcePath: path.join(root, 'assets', sourceName),
    bundleName: sourceName.replace(/\.js$/, '.min.js'),
    bundlePath: path.join(root, 'assets', sourceName.replace(/\.js$/, '.min.js')),
  }));
}

export async function renderGeneratedAsset(sourcePath) {
  const source = await readFile(sourcePath, 'utf8');
  const result = await minify(source, TERSER_OPTIONS);
  if (!result.code) throw new Error(`Terser produced no output for ${sourcePath}`);
  return `${result.code}\n`;
}

export async function findDivergentGeneratedAssets(root = process.cwd()) {
  const divergent = [];
  for (const pair of await generatedAssetPairs(root)) {
    const expected = await renderGeneratedAsset(pair.sourcePath);
    let actual = null;
    try {
      actual = await readFile(pair.bundlePath, 'utf8');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    if (actual !== expected) divergent.push({ ...pair, expected, actual });
  }
  return divergent;
}

export async function assertGeneratedAssetsCurrent(root = process.cwd()) {
  const divergent = await findDivergentGeneratedAssets(root);
  if (divergent.length) {
    const names = divergent.map((entry) => `assets/${entry.bundleName}`).join(', ');
    throw new Error(`Bundle divergent : ${names}. Exécutez npm run generate:assets après qualification des sources, puis versionnez le résultat.`);
  }
  return (await generatedAssetPairs(root)).length;
}

export async function writeGeneratedAssets(root = process.cwd()) {
  const pairs = await generatedAssetPairs(root);
  for (const pair of pairs) {
    await writeFile(pair.bundlePath, await renderGeneratedAsset(pair.sourcePath));
  }
  return pairs.length;
}
