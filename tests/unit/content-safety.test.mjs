import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { loadJson } from '../../scripts/lib/content-validation.mjs';

const FORBIDDEN = [
  { id: 'm4-l5', needle: 'sudo echo' },
  { id: 'm6-l3', needle: 'sudo apt update && sudo apt upgrade -y' },
  { id: 'm7-l3', needle: 'password|passwd|secret' },
  { id: 'm8-l7', needle: 'docker run ubuntu echo' },
  { id: 'm9-l2', needle: 'nft flush table' },
  { id: 'm13-l1', needle: 'exploit/multi/handler' },
  { id: 'm13-l1', needle: 'set RHOSTS' },
  { id: 'm12-l1', needle: 'lynis show details' },
  { id: 'm12-l2', needle: 'ssg-rhel7-oval.xml' },
  { id: 'm12-l2', needle: 'scap-yaml' },
  { id: 'm12-l3', needle: 'auditctl -w' },
  { id: 'm12-l5', needle: 'unattended-upgrades --dry-run' },
  { id: 'm13-l3', needle: '--script vuln' },
  { id: 'm13-l3', needle: '192.168.1.1' },
  { id: 'm13-l4', needle: 'cible.com' },
  { id: 'm13-l5', needle: 'searchsploit -x' },
  { id: 'm14-l2', needle: 'mount -o loop,offset=' },
  { id: 'm14-l3', needle: 'ip link set eth0 down' },
  { id: 'm14-l3', needle: 'sans l’éteindre' },
  { id: 'm14-l5', needle: 'insmod lime.ko' },
  { id: 'm14-l5', needle: 'linux.netscan' },
];

const REQUIRED = [
  { id: 'm2-l2', needle: 'umask' },
  { id: 'm4-l5', needle: 'tee -a' },
  { id: 'm6-l3', needle: 'unattended-upgrades' },
  { id: 'm7-l3', needle: String.raw`\.[0-9]{1,3}` },
  { id: 'm8-l7', needle: 'docker run --rm' },
  { id: 'm9-l2', needle: 'chmod 600' },
  { id: 'm13-l1', needle: 'info' },
  { id: 'cs1-l1', needle: 'disponibilité' },
  { id: 'cs1-l1', needle: 'intégrité' },
  { id: 'cs1-l2', needle: 'vulnérabilité' },
  { id: 'cs1-l2', needle: 'contrôle' },
  { id: 'cs1-l3', needle: 'audit' },
  { id: 'cs1-l3', needle: 'DFIR' },
  { id: 'cs1-l4', needle: 'autorisation' },
  { id: 'cs1-l4', needle: 'lab' },
  { id: 'cs1-l5', needle: 'SSH' },
  { id: 'cs1-l5', needle: 'journal' },
  { id: 'm12-l1', needle: 'lynis-report.dat' },
  { id: 'm12-l2', needle: 'ssg-ubuntu2204-ds.xml' },
  { id: 'm12-l2', needle: 'oscap info' },
  { id: 'm12-l3', needle: '-a always,exit' },
  { id: 'm12-l3', needle: 'pam_faillock' },
  { id: 'm12-l4', needle: 'sshd_config' },
  { id: 'm12-l4', needle: 'visudo' },
  { id: 'm12-l5', needle: 'unattended-upgrade --dry-run' },
  { id: 'm12-l5', needle: 'pro fix --dry-run' },
  { id: 'm12-l6', needle: 'Hardening index' },
  { id: 'm12-l6', needle: 'retour arrière' },
  { id: 'm13-l1', needle: 'simulation' },
  { id: 'm13-l1', needle: 'autorisation écrite' },
  { id: 'm13-l2', needle: 'Professional' },
  { id: 'm13-l3', needle: 'lab.linuxpath.test' },
  { id: 'm13-l3', needle: 'http-title' },
  { id: 'm14-l1', needle: 'SHA-256' },
  { id: 'm14-l1', needle: 'ne téléversez jamais' },
  { id: 'm14-l2', needle: 'ro,noload' },
  { id: 'm14-l2', needle: 'write blocker' },
  { id: 'm14-l2', needle: '/home/user/labs/evidence-source.img' },
  { id: 'm14-l3', needle: 'SP 800-61r3' },
  { id: 'm14-l4', needle: 'ss -tpn' },
  { id: 'm14-l5', needle: 'ordre de volatilité' },
  { id: 'm14-l5', needle: 'banners.Banners' },
  { id: 'm14-l5', needle: 'ISF' },
];

test('lessons do not teach the audited operationally dangerous recipes', async () => {
  const lessons = await loadJson('data/lessons.json');
  const hits = [];
  for (const { id, needle } of FORBIDDEN) {
    const lesson = Object.values(lessons).flat().find((entry) => entry.id === id);
    assert.ok(lesson, `missing lesson ${id}`);
    if (lesson.content.includes(needle)) hits.push(`${id}: ${needle}`);
  }
  assert.deepEqual(hits, [], hits.join('; '));
});

test('priority lessons contain the corrected teaching', async () => {
  const lessons = await loadJson('data/lessons.json');
  const missing = [];
  for (const { id, needle } of REQUIRED) {
    const lesson = Object.values(lessons).flat().find((entry) => entry.id === id);
    assert.ok(lesson, `missing lesson ${id}`);
    if (!lesson.content.toLowerCase().includes(needle.toLowerCase())) missing.push(`${id}: ${needle}`);
  }
  assert.deepEqual(missing, []);
});

test('every lesson has a documented review status', async () => {
  const lessons = await loadJson('data/lessons.json');
  const rows = Object.values(lessons).flat();
  assert.equal(rows.length, 99);
  const incomplete = rows.filter((lesson) => lesson.reviewStatus !== 'reviewed' || !lesson.reviewedAt || !lesson.distro);
  assert.deepEqual(incomplete.map((lesson) => lesson.id), []);
});

test('m11-l5 serializes shell input redirections without creating HTML tags', async () => {
  const lessons = await loadJson('data/lessons.json');
  const lesson = lessons.m11.find((entry) => entry.id === 'm11-l5');
  const expected = [
    'openssl s_client -connect example.com:443 -servername example.com &lt;/dev/null 2>/dev/null | openssl x509 -noout -text',
    'openssl s_client -connect example.com:443 -showcerts &lt;/dev/null',
  ];
  for (const command of expected) assert.ok(lesson.content.includes(command), command);
  assert.equal(lesson.content.includes('</dev/null'), false);
});

test('cyber lessons expose checked official references', async () => {
  const lessons = await loadJson('data/lessons.json');
  const rows = ['cs1', 'm12', 'm13', 'm14'].flatMap((moduleId) => lessons[moduleId]);
  const malformed = rows.filter((lesson) => !Array.isArray(lesson.sources)
    || lesson.sources.length < 2
    || lesson.sources.some((source) => !source?.title || !source?.scope || !/^https:\/\//.test(source?.url || '') || source.checkedAt !== lesson.reviewedAt));
  assert.deepEqual(malformed.map((lesson) => lesson.id), []);
});

test('content review matrix lists every published lesson', async () => {
  const lessons = await loadJson('data/lessons.json');
  const matrix = await readFile('docs/content-review-matrix.md', 'utf8');
  const missing = Object.values(lessons).flat().filter((lesson) => !matrix.includes(lesson.id)).map((lesson) => lesson.id);
  assert.deepEqual(missing, []);
});

test('no quiz bank uses answer A for every question', async () => {
  const quizzes = await loadJson('data/quizzes.json');
  const biased = [];
  for (const [moduleId, quiz] of Object.entries(quizzes)) {
    if (quiz.questions.length >= 5 && quiz.questions.every((question) => question.correct === 0)) {
      biased.push(moduleId);
    }
  }
  assert.deepEqual(biased, []);
});

test('ambiguous quiz prompts are rewritten as single-answer questions', async () => {
  const quizzes = await loadJson('data/quizzes.json');
  const blob = JSON.stringify(quizzes).toLowerCase();
  assert.equal(blob.includes('plusieurs réponses'), false);
  assert.equal(quizzes.m5.questions[1].expl.toLowerCase().includes('tous deux valides'), false);
  assert.equal(quizzes.m14.questions[2].expl.toLowerCase().includes('empreinte unique'), false);
});

test('no CTF hint contains a plaintext flag', async () => {
  const ctf = await loadJson('data/ctf.json');
  const leaks = [];
  for (const challenge of ctf.challenges) {
    for (const [index, hint] of (challenge.hints || []).entries()) {
      if (/flag\{[^}]+\}/i.test(hint)) leaks.push(`${challenge.id} hint ${index + 1}`);
    }
  }
  assert.deepEqual(leaks, []);
});

test('ctf-08 announces a simulated capture and ctf-10 does not pretend to decrypt with the key', async () => {
  const ctf = await loadJson('data/ctf.json');
  const ctf08 = ctf.challenges.find((challenge) => challenge.id === 'ctf-08');
  const ctf10 = ctf.challenges.find((challenge) => challenge.id === 'ctf-10');
  const ctf05 = ctf.challenges.find((challenge) => challenge.id === 'ctf-05');
  assert.match(`${ctf08.context} ${ctf08.hints.join(' ')}`, /simulation/i);
  assert.equal(/chiffr/i.test(ctf10.context), false);
  assert.equal(ctf05.difficulty, 'easy');
});

test('glossary does not present regreSSHion as a buffer overflow', async () => {
  const glossary = await loadJson('data/glossary.json');
  const overflow = glossary.terms.find((term) => term.id === 'buffer-overflow');
  assert.ok(overflow);
  assert.equal(/CVE-2024-6387/i.test(`${overflow.definition} ${overflow.example}`), false);
  assert.match(glossary.terms.find((term) => term.id === 'daemon').definition, /pas toujours/i);
});

test('first-party HTML has no inline handlers or executable inline scripts', async () => {
  const html = await readFile('index.html', 'utf8');
  const handlers = [...html.matchAll(/\s(on[a-z]+)\s*=/gi)].map((match) => match[1].toLowerCase());
  assert.deepEqual(handlers, []);

  const inlineExecutable = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
    .filter(([, attrs, body]) => body.trim()
      && !/\bsrc\s*=/.test(attrs)
      && !/\btype\s*=\s*["']application\/ld\+json["']/i.test(attrs));
  assert.deepEqual(inlineExecutable.map(([, attrs]) => attrs.trim()), []);
  assert.match(html, /<script\s+src=["']assets\/sw-register\.min\.js["'][^>]*><\/script>/i);
});

test('first-party JavaScript never creates runtime handler properties or executable strings', async () => {
  const sourceNames = (await readdir('assets'))
    .filter((name) => name.endsWith('.js') && !name.endsWith('.min.js'));
  const violations = [];
  for (const name of sourceNames) {
    const source = await readFile(`assets/${name}`, 'utf8');
    for (const pattern of [
      /setAttribute\s*\(\s*(["'])on[a-z]+\1\s*,/gi,
      /\.on[a-z]+\s*=/gi,
      /\son[a-z]+\s*=\s*(["'])/gi,
      /\beval\s*\(/g,
      /\bnew\s+Function\s*\(/g,
    ]) {
      for (const match of source.matchAll(pattern)) {
        violations.push(`${name}:${source.slice(0, match.index).split('\n').length}:${match[0]}`);
      }
    }
  }
  assert.deepEqual(violations, []);
});

test('static CSP forbids inline and eval while allowing self-hosted WASM workers', async () => {
  const html = await readFile('index.html', 'utf8');
  const csp = html.match(/<meta\s+http-equiv=["']Content-Security-Policy["']\s+content=(["'])([\s\S]*?)\1/i)?.[2] || '';
  assert.match(csp, /default-src\s+'self'/);
  assert.match(csp, /script-src\s+'self'\s+'wasm-unsafe-eval'/);
  assert.match(csp, /script-src-attr\s+'none'/);
  assert.match(csp, /worker-src\s+'self'\s+blob:/);
  assert.match(csp, /object-src\s+'none'/);
  assert.match(csp, /base-uri\s+'none'/);
  assert.match(csp, /frame-src\s+'none'/);
  assert.equal(/frame-ancestors/.test(csp), false);
  const scriptDirective = csp.match(/script-src\s+([^;]+)/)?.[1] || '';
  assert.equal(/'unsafe-inline'|'unsafe-eval'/.test(scriptDirective), false);
  assert.equal(/'unsafe-eval'/.test(csp), false);
});
