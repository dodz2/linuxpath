import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(path, 'utf8');

test('repository governance files define maintainable and private security workflows', async () => {
  const [dependabot, ci, codeql, deploy, news, security, contributing, codeowners, readme] = await Promise.all([
    read('.github/dependabot.yml'),
    read('.github/workflows/ci.yml'),
    read('.github/workflows/codeql.yml'),
    read('.github/workflows/deploy-pages.yml'),
    read('.github/workflows/update-news.yml'),
    read('SECURITY.md'),
    read('CONTRIBUTING.md'),
    read('CODEOWNERS'),
    read('README.md'),
  ]);

  assert.match(dependabot, /version:\s*2/);
  assert.match(dependabot, /package-ecosystem:\s*["']?npm["']?/);
  assert.match(dependabot, /package-ecosystem:\s*["']?github-actions["']?/);
  assert.match(dependabot, /open-pull-requests-limit:\s*\d+/);

  assert.match(codeql, /permissions:\s*[\s\S]*contents:\s*read[\s\S]*security-events:\s*write/);
  assert.match(codeql, /language:\s*\[?["']?javascript-typescript["']?\]?/);
  const actionUses = [...codeql.matchAll(/uses:\s*([^\s#]+)@([^\s#]+)/g)];
  assert.ok(actionUses.length >= 3);
  for (const [, action, revision] of actionUses) {
    assert.match(revision, /^[0-9a-f]{40}$/, `${action} must be pinned to an immutable SHA`);
  }

  const buildJob = deploy.match(/\n  build:[\s\S]*?(?=\n  deploy:)/)?.[0] || '';
  const deployJob = deploy.match(/\n  deploy:[\s\S]*$/)?.[0] || '';
  assert.equal(/pages:\s*write|id-token:\s*write/.test(buildJob), false);
  assert.match(deployJob, /permissions:[\s\S]*pages:\s*write/);
  assert.match(deployJob, /id-token:\s*write/);

  for (const [name, workflow] of [['ci', ci], ['codeql', codeql], ['deploy', deploy], ['news', news]]) {
    const checkouts = [...workflow.matchAll(/uses:\s*actions\/checkout@[0-9a-f]{40}/g)].length;
    const nonPersistent = [...workflow.matchAll(/persist-credentials:\s*false/g)].length;
    assert.equal(nonPersistent, checkouts, `${name} checkout credentials must not persist`);
  }
  assert.match(deploy, /env:\s*\n\s+PAGE_URL:\s*\$\{\{\s*steps\.deployment\.outputs\.page_url\s*\}\}/);
  assert.match(deploy, /SOURCE_COMMIT:\s*\$\{\{\s*github\.sha\s*\}\}/);
  assert.match(deploy, /verify-live-deployment\.mjs\s+"\$PAGE_URL"\s+"\$SOURCE_COMMIT"/);
  assert.match(news, /peter-evans\/create-pull-request@[0-9a-f]{40}/);
  assert.match(news, /token:\s*\$\{\{\s*github\.token\s*\}\}/);
  assert.match(ci, /workflow_dispatch:/);
  assert.match(news, /actions:\s*write/);
  assert.match(news, /gh workflow run ci\.yml --ref/);
  assert.match(news, /gh pr merge[^\n]*--auto[^\n]*--squash/);

  assert.match(security, /security\/advisories\/new/);
  assert.match(security, /ne (?:publiez|divulguez|déposez) pas|do not (?:publish|disclose|file)/i);
  assert.match(contributing, /npm run verify/);
  assert.match(contributing, /npm run generate:assets/);
  assert.match(contributing, /Python[^0-9\n]*3\.13/i);
  assert.match(contributing, /uvx|uv\s+0\.11\.6/i);
  assert.equal(/vérification statique/i.test(readme), false);
  assert.match(readme, /\[Contribuer\]\(CONTRIBUTING\.md\)/);
  assert.match(readme, /\[Politique de sécurité\]\(SECURITY\.md\)/);
  assert.equal(codeowners.trim(), '* @dodz2');
});
