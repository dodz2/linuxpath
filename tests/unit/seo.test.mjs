import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const BASE = 'https://dodz2.github.io/linuxpath/';

function sitemapUrls(xml) {
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
}

test('the sitemap never presents a fragment as a standalone document', async () => {
  const xml = await readFile('sitemap.xml', 'utf8');
  const urls = sitemapUrls(xml);
  assert.ok(urls.length >= 1, 'sitemap must list at least the real page');
  for (const url of urls) {
    assert.equal(url.includes('#'), false, `fragment in sitemap: ${url}`);
    assert.ok(url.startsWith(BASE), `off-base url: ${url}`);
  }
  // the only real HTTP document served is the root of the deployed path
  assert.equal(urls.filter((u) => u === BASE).length, 1, 'exactly one canonical root URL');
});

test('robots.txt targets only resources actually served and points to the real sitemap', async () => {
  const robots = await readFile('robots.txt', 'utf8');
  assert.match(robots, /User-agent: \*/);
  assert.match(robots, /Allow: \/$/m);
  assert.match(robots, /Disallow: \/v86\//);
  assert.match(robots, /Sitemap: https:\/\/dodz2\.github\.io\/linuxpath\/sitemap\.xml/);
  // no rule blocks the learning content path itself
  assert.equal(/Disallow: \//.test(robots.replace('Disallow: /v86/', '')), false);
});

test('the home page carries complete metadata without JS and no obsolete keywords', async () => {
  const html = await readFile('index.html', 'utf8');
  assert.equal(/<meta name="keywords"/.test(html), false);
  assert.match(html, /<title>[^<]+<\/title>/);
  assert.match(html, /<meta name="description" content="[^"]{20,}"/);
  assert.match(html, /<link rel="canonical" href="https:\/\/dodz2\.github\.io\/linuxpath\/">/);
  assert.match(html, /application\/ld\+json/);
  assert.match(html, /"@type": "Course"/);
  assert.match(html, /og:title/);
  assert.match(html, /twitter:card/);
});

test('the build copies sitemap and robots into dist unchanged', async () => {
  const { access } = await import('node:fs/promises');
  let distSitemap = null;
  let distRobots = null;
  try {
    await access('dist/sitemap.xml');
    await access('dist/robots.txt');
  } catch {
    // dist/ is a build artifact: `npm run test:unit` can run before `npm run build`
    // on a fresh checkout. The served-per-URL check is covered by tests/e2e/seo.spec.js
    // against both source and dist; skip the strict equality here when dist is absent.
    return;
  }
  [distSitemap, distRobots] = await Promise.all([
    readFile('dist/sitemap.xml', 'utf8'),
    readFile('dist/robots.txt', 'utf8'),
  ]);
  const [sourceSitemap, sourceRobots] = await Promise.all([
    readFile('sitemap.xml', 'utf8'),
    readFile('robots.txt', 'utf8'),
  ]);
  assert.equal(distSitemap, sourceSitemap);
  assert.equal(distRobots, sourceRobots);
});