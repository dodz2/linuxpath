import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const TEXT_EXTENSIONS = new Set(['.html', '.css', '.js', '.json']);
const SKIP_SCHEMES = /^(?:https?:|data:|mailto:|tel:|javascript:|#|\/\/)/i;

async function exists(target) {
  try { await stat(target); return true; }
  catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walk(full));
    else files.push(full);
  }
  return files;
}

function cleanReference(raw) {
  return raw.trim().replace(/^['"]|['"]$/g, '').split('#')[0].split('?')[0];
}

function addReference(target, raw, source, baseDirectory, kind) {
  const cleaned = cleanReference(raw);
  if (!cleaned || SKIP_SCHEMES.test(cleaned) || cleaned.includes('${')) return;
  if (cleaned === '.' || cleaned === './') return;
  const relative = cleaned.startsWith('/') ? cleaned.slice(1) : path.posix.normalize(path.posix.join(baseDirectory, cleaned));
  if (relative.startsWith('../')) return;
  target.push({ source, reference: raw, resolved: relative, kind });
}

function extractHtml(text, source) {
  const refs = [];
  for (const match of text.matchAll(/\b(?:src|href)\s*=\s*["']([^"']+)["']/gi)) addReference(refs, match[1], source, '', 'html-attribute');
  return refs;
}

function extractCss(text, source) {
  const refs = [];
  const base = path.posix.dirname(source);
  for (const match of text.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)) addReference(refs, match[1], source, base, 'css-url');
  return refs;
}

function extractJavaScript(text, source) {
  const refs = [];
  const patterns = [
    /\bfetch\(\s*["']([^"']+)["']/g,
    /\bserviceWorker\.register\(\s*["']([^"']+)["']/g,
    /\b(?:script\.src|wasm_path)\s*[:=]\s*["']([^"']+)["']/g,
    /\b(?:bios|vga_bios|cdrom)\s*:\s*\{\s*url\s*:\s*["']([^"']+)["']/g,
  ];
  for (const pattern of patterns) for (const match of text.matchAll(pattern)) addReference(refs, match[1], source, '', 'javascript-resource');
  if (source === 'sw.js') {
    const block = text.match(/const\s+PRECACHE_URLS\s*=\s*\[([\s\S]*?)\]/);
    if (block) for (const match of block[1].matchAll(/["']([^"']+)["']/g)) addReference(refs, match[1], source, '', 'service-worker-precache');
  }
  return refs;
}

function extractManifest(text, source) {
  const refs = [];
  const manifest = JSON.parse(text);
  for (const icon of manifest.icons || []) if (icon.src) addReference(refs, icon.src, source, '', 'manifest-icon');
  return refs;
}

export async function checkReferences(root = process.cwd()) {
  const scanTargets = [
    'index.html', 'manifest.json', 'sw.js',
    ...((await exists(path.join(root, 'assets'))) ? (await walk(path.join(root, 'assets'))).map((file) => path.relative(root, file).split(path.sep).join('/')) : []),
  ];
  const references = [];
  for (const source of [...new Set(scanTargets)].sort()) {
    const extension = path.extname(source);
    if (!TEXT_EXTENSIONS.has(extension) || !(await exists(path.join(root, source)))) continue;
    const text = await readFile(path.join(root, source), 'utf8');
    if (extension === '.html') references.push(...extractHtml(text, source), ...extractJavaScript(text, source));
    else if (extension === '.css') references.push(...extractCss(text, source));
    else if (source === 'manifest.json') references.push(...extractManifest(text, source));
    else if (extension === '.js') references.push(...extractJavaScript(text, source));
  }
  const unique = [...new Map(references.map((entry) => [`${entry.source}\0${entry.resolved}`, entry])).values()]
    .sort((a, b) => `${a.resolved}:${a.source}`.localeCompare(`${b.resolved}:${b.source}`));
  const missing = [];
  for (const entry of unique) if (!(await exists(path.join(root, entry.resolved)))) missing.push(entry);
  return { root: path.resolve(root), checked: unique.length, references: unique, missing };
}
