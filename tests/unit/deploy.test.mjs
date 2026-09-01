import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access, cp, mkdtemp, rm, symlink } from 'node:fs/promises';
import { constants } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';

const criticalDeploymentFiles = [
  'assets/app.min.js',
  'assets/pedagogical-commands.min.js',
  'assets/terminal-core.min.js',
  'data/modules.json',
  'index.html',
  'sw.js',
];

function sha256(content) {
  return createHash('sha256').update(content).digest('hex');
}

function deploymentFixture(sourceCommit) {
  const resources = Object.fromEntries(criticalDeploymentFiles.map((file) => [
    file,
    Buffer.from(`current:${file}:${sourceCommit}`),
  ]));
  const files = Object.fromEntries(Object.entries(resources).map(([file, content]) => [file, sha256(content)]));
  return {
    resources,
    manifest: {
      schemaVersion: 2,
      sourceCommit,
      entryCount: Object.keys(files).length,
      criticalHashes: { ...files },
      files,
    },
  };
}

async function serveDeployment({ manifest, resources }) {
  const requests = [];
  const server = createServer((request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    requests.push(`${url.pathname}${url.search}`);
    let relative = url.pathname.replace(/^\/linuxpath\//, '');
    if (relative === '' || relative === '/') relative = 'index.html';
    if (relative === 'build-manifest.json') {
      response.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'public, max-age=3600' });
      response.end(JSON.stringify(manifest));
      return;
    }
    const content = resources[relative];
    if (content === undefined) {
      response.writeHead(404);
      response.end('missing');
      return;
    }
    response.writeHead(200, { 'cache-control': 'public, max-age=3600' });
    response.end(content);
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  return {
    requests,
    url: `http://127.0.0.1:${address.port}/linuxpath/`,
    close: async () => {
      server.close();
      await once(server, 'close');
    },
  };
}

async function runLiveVerifier(url, sourceCommit) {
  const child = spawn(process.execPath, ['scripts/verify-live-deployment.mjs', url, sourceCommit], {
    cwd: process.cwd(),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  const [code, signal] = await once(child, 'close');
  return { code, signal, stdout, stderr };
}

async function exists(path) {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function unpinnedUses(yaml) {
  return [...yaml.matchAll(/^\s*uses:\s*([^\s#]+)/gm)]
    .map((match) => match[1])
    .filter((value) => !/@[0-9a-f]{40}$/.test(value));
}

test('GitHub Pages deploys a single tested dist artifact with pinned local Terser', async () => {
  const deploy = await readFile('.github/workflows/deploy-pages.yml', 'utf8');
  const ci = await readFile('.github/workflows/ci.yml', 'utf8');
  const news = await readFile('.github/workflows/update-news.yml', 'utf8');
  const issues = [];

  if (await exists('.github/workflows/verify-minification.yml')) {
    issues.push('verify-minification.yml still exists as a second publication strategy');
  }
  if (/npm install -g terser/.test(deploy) || /npm install -g terser/.test(ci)) {
    issues.push('a workflow installs a global unpinned Terser');
  }
  if (!/node-version:\s*'24\.20\.0'/.test(deploy) || !/node-version:\s*'24\.20\.0'/.test(ci)) {
    issues.push('CI/deploy must pin the qualified Node 24.20.0 LTS toolchain');
  }
  if (/path:\s*'\.'/.test(deploy) || /path:\s*"\."/.test(deploy)) {
    issues.push('deploy uploads the whole repository instead of dist/');
  }
  if (!/path:\s*['"]dist['"]/.test(deploy)) issues.push('deploy must upload dist/');
  if (!/npm ci/.test(deploy) || !/npm ci/.test(ci)) issues.push('workflows must install from the lockfile via npm ci');
  if (!/npm run verify/.test(deploy)) issues.push('Pages deploy must run npm run verify before upload');
  if (!/npm run verify/.test(ci) || /verify:static/.test(ci)) {
    issues.push('CI must run npm run verify on pull requests, not verify:static only');
  }
  if (/sudo apt-get install -y node-terser/.test(ci + deploy)) {
    issues.push('a workflow uses distro Terser instead of the lockfile');
  }
  if (/bash minify.sh/.test(ci) || /bash minify.sh/.test(deploy)) {
    issues.push('CI/deploy still publish via minify.sh');
  }
  const unpinned = [...unpinnedUses(deploy), ...unpinnedUses(ci), ...unpinnedUses(news)];
  if (unpinned.length) issues.push(`unpinned actions: ${unpinned.join(', ')}`);
  if (/git push/.test(news) && !/pull-request|create-pull-request|gh pr create/.test(news)) {
    issues.push('news bot pushes to the default branch and bypasses CI');
  }
  if (!/steps\.deployment\.outputs\.page_url/.test(deploy)) {
    issues.push('deploy is missing a post-deploy smoke against the deployed Pages URL');
  }
  if (await exists('minify.sh')) issues.push('obsolete minify.sh still exists beside the canonical asset generator');
  assert.deepEqual(issues, [], issues.join('; '));
});

test('CI preserves diagnostic artifacts even when verification fails', async () => {
  const ci = await readFile('.github/workflows/ci.yml', 'utf8');
  const upload = ci.match(/- name: Upload verification artifacts[\s\S]*?(?=\n\s{6}- name:|$)/)?.[0] || '';
  assert.match(upload, /if:\s*\$\{\{\s*always\(\)\s*\}\}/);
  assert.match(upload, /actions\/upload-artifact@[0-9a-f]{40}/);
  assert.match(upload, /github\.run_attempt/, 'artifact name must remain unique across workflow reruns');
  for (const artifact of ['test-results', 'playwright-report']) {
    assert.match(upload, new RegExp(artifact));
  }
});

test('archive build binds the artifact to an explicit source commit and critical hashes without Git metadata', async () => {
  const sourceCommit = 'a'.repeat(40);
  const archive = await mkdtemp(path.join(tmpdir(), 'linuxpath-archive-build-'));
  try {
    for (const entry of ['README.md', 'index.html', 'manifest.json', 'robots.txt', 'sitemap.xml', 'sw.js']) {
      await cp(entry, path.join(archive, entry));
    }
    for (const directory of ['assets', 'data', 'scripts', 'v86']) {
      await cp(directory, path.join(archive, directory), { recursive: true });
    }
    await symlink(path.join(process.cwd(), 'node_modules'), path.join(archive, 'node_modules'), 'dir');

    const build = spawnSync(process.execPath, ['scripts/build.mjs'], {
      cwd: archive,
      env: { ...process.env, SOURCE_COMMIT: sourceCommit, GITHUB_SHA: '' },
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
    });
    assert.equal(build.status, 0, build.stderr || build.stdout);

    const manifest = JSON.parse(await readFile(path.join(archive, 'dist/build-manifest.json'), 'utf8'));
    assert.equal(manifest.schemaVersion, 2);
    assert.equal(manifest.sourceCommit, sourceCommit);
    assert.equal(manifest.entryCount, Object.keys(manifest.files).length);

    const expectedCriticalFiles = [...criticalDeploymentFiles].sort();
    assert.deepEqual(Object.keys(manifest.criticalHashes).sort(), expectedCriticalFiles);
    for (const file of expectedCriticalFiles) {
      assert.match(manifest.criticalHashes[file], /^[0-9a-f]{64}$/);
      assert.equal(manifest.criticalHashes[file], manifest.files[file]);
    }
  } finally {
    await rm(archive, { recursive: true, force: true });
  }
});

test('live verifier accepts only a complete current deployment and cache-busts every fetch', async () => {
  const sourceCommit = 'b'.repeat(40);
  const fixture = deploymentFixture(sourceCommit);
  const deployment = await serveDeployment(fixture);
  try {
    const result = await runLiveVerifier(deployment.url, sourceCommit);
    assert.equal(result.code, 0, result.stderr || result.stdout);
    assert.equal(result.signal, null);

    const expectedRequests = ['build-manifest.json', ...criticalDeploymentFiles];
    for (const file of expectedRequests) {
      const request = deployment.requests.find((candidate) => new URL(candidate, deployment.url).pathname.endsWith(file));
      assert.ok(request, `missing live request for ${file}`);
      assert.equal(new URL(request, deployment.url).searchParams.get('commit'), sourceCommit);
    }
  } finally {
    await deployment.close();
  }
});

test('live verifier rejects a manifest that omits the pedagogical command bundle from critical hashes', async () => {
  const sourceCommit = 'f'.repeat(40);
  const fixture = deploymentFixture(sourceCommit);
  delete fixture.manifest.criticalHashes['assets/pedagogical-commands.min.js'];
  const deployment = await serveDeployment(fixture);
  try {
    const result = await runLiveVerifier(deployment.url, sourceCommit);
    assert.notEqual(result.code, 0, result.stdout);
    assert.match(result.stderr, /missing critical hash.*pedagogical-commands\.min\.js/i);
  } finally {
    await deployment.close();
  }
});

test('live verifier refuses an old manifest and a mismatched critical resource', async () => {
  const expectedCommit = 'c'.repeat(40);
  const oldFixture = deploymentFixture('d'.repeat(40));
  const oldDeployment = await serveDeployment(oldFixture);
  try {
    const stale = await runLiveVerifier(oldDeployment.url, expectedCommit);
    assert.notEqual(stale.code, 0);
    assert.match(stale.stderr, /source commit/i);
  } finally {
    await oldDeployment.close();
  }

  const mixedFixture = deploymentFixture(expectedCommit);
  mixedFixture.resources['index.html'] = Buffer.from('<html>stale deployment</html>');
  const mixedDeployment = await serveDeployment(mixedFixture);
  try {
    const mixed = await runLiveVerifier(mixedDeployment.url, expectedCommit);
    assert.notEqual(mixed.code, 0);
    assert.match(mixed.stderr, /hash mismatch.*index\.html/i);
  } finally {
    await mixedDeployment.close();
  }
});

test('live verifier rejects absolute critical URLs without contacting them', async () => {
  const sourceCommit = 'e'.repeat(40);
  const sinkBody = Buffer.from('private runner endpoint');
  let sinkRequests = 0;
  const sink = createServer((_request, response) => {
    sinkRequests += 1;
    response.writeHead(200);
    response.end(sinkBody);
  });
  sink.listen(0, '127.0.0.1');
  await once(sink, 'listening');
  const sinkAddress = sink.address();
  const absoluteUrl = `http://127.0.0.1:${sinkAddress.port}/probe`;

  const fixture = deploymentFixture(sourceCommit);
  const sinkHash = sha256(sinkBody);
  fixture.manifest.files[absoluteUrl] = sinkHash;
  fixture.manifest.criticalHashes[absoluteUrl] = sinkHash;
  fixture.manifest.entryCount += 1;
  const deployment = await serveDeployment(fixture);
  try {
    const result = await runLiveVerifier(deployment.url, sourceCommit);
    assert.notEqual(result.code, 0, result.stdout);
    assert.match(result.stderr, /invalid manifest path/i);
    assert.equal(sinkRequests, 0, 'verifier contacted an absolute URL from the manifest');
  } finally {
    await deployment.close();
    sink.close();
    await once(sink, 'close');
  }
});

test('Pages workflow builds and verifies the deployment against github.sha', async () => {
  const deploy = await readFile('.github/workflows/deploy-pages.yml', 'utf8');
  assert.match(deploy, /SOURCE_COMMIT:\s*\$\{\{\s*github\.sha\s*\}\}/);
  assert.match(deploy, /node scripts\/verify-live-deployment\.mjs/);
  assert.match(deploy, /steps\.deployment\.outputs\.page_url/);
  assert.match(deploy, /verify-live-deployment\.mjs[^\n]*"\$PAGE_URL"[^\n]*"\$SOURCE_COMMIT"/);
});
