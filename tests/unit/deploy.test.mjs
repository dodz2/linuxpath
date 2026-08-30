import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { constants } from 'node:fs';

async function exists(path) {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function unpinnedUses(yaml) {
  return [...yaml.matchAll(/uses:\s*([^\s#]+)/g)]
    .map((match) => match[1])
    .filter((value) => !/@[0-9a-f]{40}$/.test(value));
}

test('GitHub Pages deploys a single tested dist artifact with pinned local Terser', async () => {
  const deploy = await readFile('.github/workflows/deploy-pages.yml', 'utf8');
  const ci = await readFile('.github/workflows/ci.yml', 'utf8');
  const news = await readFile('.github/workflows/update-news.yml', 'utf8');
  const minify = await readFile('minify.sh', 'utf8');
  const issues = [];

  if (await exists('.github/workflows/verify-minification.yml')) {
    issues.push('verify-minification.yml still exists as a second publication strategy');
  }
  if (/npm install -g terser/.test(deploy) || /npm install -g terser/.test(ci)) {
    issues.push('a workflow installs a global unpinned Terser');
  }
  if (/node-version:\s*'20'/.test(deploy) || /node-version:\s*'20'/.test(ci)) {
    issues.push('a workflow pins Node 20 while the harness requires Node >= 22');
  }
  if (!/node-version:\s*'22'/.test(deploy) || !/node-version:\s*'22'/.test(ci)) {
    issues.push('CI/deploy must pin Node 22');
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
  if (/sudo apt-get install -y node-terser/.test(ci + deploy + minify)) {
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
  if (!/dodz2\.github\.io\/linuxpath/.test(deploy)) {
    issues.push('deploy is missing a post-deploy smoke against the live Pages URL');
  }
  if (!/node_modules\/\.bin\/terser|npm exec --/.test(minify) || /npx terser/.test(minify)) {
    issues.push('minify.sh must use the lockfile Terser, not a floating npx download');
  }
  assert.deepEqual(issues, [], issues.join('; '));
});
