import { readFile } from 'node:fs/promises';
import path from 'node:path';

export const MODULE_IDS = Array.from({ length: 14 }, (_, index) => `m${index + 1}`);
export const DATA_FILES = ['cheatsheet.json', 'ctf.json', 'exercises.json', 'glossary.json', 'lessons.json', 'modules.json', 'news.json', 'quizzes.json', 'vfs.json'];
export async function loadJson(relativePath, root = process.cwd()) {
  return JSON.parse(await readFile(path.join(root, relativePath), 'utf8'));
}
function issue(code, message, location) { return { severity: 'error', code, location, message }; }
function duplicateValues(values) {
  const seen = new Set(); const duplicates = new Set();
  for (const value of values) { if (seen.has(value)) duplicates.add(value); seen.add(value); }
  return [...duplicates].sort();
}
export async function validateContent(root = process.cwd()) {
  const errors = []; const warnings = []; const data = {};
  for (const file of DATA_FILES) {
    try { data[file] = await loadJson(`data/${file}`, root); }
    catch (error) { errors.push(issue('json-parse', error.message, `data/${file}`)); }
  }
  if (errors.length) return { errors, warnings, counts: {}, data };
  const lessons = data['lessons.json']; const exercises = data['exercises.json']; const quizzes = data['quizzes.json'];
  const challenges = data['ctf.json'].challenges; const terms = data['glossary.json'].terms;
  const catalogue = data['modules.json'];
  if (!catalogue || !Array.isArray(catalogue.modules) || catalogue.modules.length !== MODULE_IDS.length) {
    errors.push(issue('invalid-modules', 'modules.json must list exactly m1 through m14', 'data/modules.json'));
  } else {
    const ids = catalogue.modules.map((entry) => entry.id);
    if (JSON.stringify(ids) !== JSON.stringify(MODULE_IDS)) errors.push(issue('module-coverage', 'modules.json must define exactly m1 through m14 in order', 'data/modules.json'));
    for (const entry of catalogue.modules) {
      if (!entry.title || !['linux', 'network', 'offsec'].includes(entry.track) || entry.status !== 'published' || !Array.isArray(entry.prerequisites) || typeof entry.displayOrder !== 'number' || !Array.isArray(entry.objectives) || entry.objectives.length < 2 || !Number.isFinite(entry.estimatedMinutes) || typeof entry.successCriteria !== 'string') {
        errors.push(issue('invalid-module', `Malformed module ${entry.id ?? '(missing id)'}`, 'data/modules.json'));
      }
    }
    const tracks = catalogue.tracks;
    if (!Array.isArray(tracks) || tracks.length !== 3) {
      errors.push(issue('invalid-tracks', 'modules.json must define exactly three tracks', 'data/modules.json'));
    }
  }
  const categories = data['cheatsheet.json'].categories; const news = data['news.json'].news;
  for (const [name, groups] of Object.entries({ lessons, exercises, quizzes })) {
    const keys = Object.keys(groups).sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
    if (JSON.stringify(keys) !== JSON.stringify(MODULE_IDS)) errors.push(issue('module-coverage', `${name} must define exactly m1 through m14`, `data/${name}.json`));
  }
  const lessonIds = Object.values(lessons).flat().map((entry) => entry.id);
  const exerciseIds = Object.values(exercises).flat().map((entry) => entry.id);
  // The current quiz schema has no persisted question id. Use stable, positional
  // validation keys instead of inventing a production requirement in the harness.
  const questionIds = MODULE_IDS.flatMap((moduleId) => (quizzes[moduleId]?.questions || []).map((_, index) => `${moduleId}-q${index + 1}`));
  const challengeIds = challenges.map((entry) => entry.id); const termIds = terms.map((entry) => entry.id);
  for (const [label, values] of Object.entries({ lesson: lessonIds, exercise: exerciseIds, question: questionIds, challenge: challengeIds, term: termIds })) {
    for (const duplicate of duplicateValues(values)) errors.push(issue('duplicate-id', `Duplicate ${label} id: ${duplicate}`, 'data/'));
    if (values.some((value) => typeof value !== 'string' || value.length === 0)) errors.push(issue('invalid-id', `${label} ids must be non-empty strings`, 'data/'));
  }
  for (const moduleId of MODULE_IDS) {
    for (const lesson of lessons[moduleId] || []) if (!lesson.id.startsWith(`${moduleId}-l`) || !lesson.title || !lesson.content || lesson.reviewStatus !== 'reviewed' || !lesson.reviewedAt || !lesson.distro) errors.push(issue('invalid-lesson', `Malformed lesson ${lesson.id ?? '(missing id)'}`, `data/lessons.json#${moduleId}`));
    for (const exercise of exercises[moduleId] || []) if (!exercise.id.startsWith(`${moduleId}-e`) || !exercise.title || !exercise.desc || !Array.isArray(exercise.accepted) || exercise.accepted.length === 0 || !Array.isArray(exercise.hints) || !exercise.validator || typeof exercise.validator !== 'object' || !exercise.validator.type) errors.push(issue('invalid-exercise', `Malformed exercise ${exercise.id ?? '(missing id)'}`, `data/exercises.json#${moduleId}`));
    const quiz = quizzes[moduleId];
    if (!quiz || !quiz.title || !Array.isArray(quiz.questions) || quiz.questions.length === 0) { errors.push(issue('invalid-quiz', `Malformed quiz ${moduleId}`, `data/quizzes.json#${moduleId}`)); continue; }
    for (const question of quiz.questions) if (!Array.isArray(question.options) || question.options.length < 2 || !Number.isInteger(question.correct) || question.correct < 0 || question.correct >= question.options.length || !question.q || !question.expl) errors.push(issue('invalid-question', `Malformed question ${question.id ?? '(missing id)'}`, `data/quizzes.json#${moduleId}`));
  }
  for (const challenge of challenges) if (!/^ctf-\d{2}$/.test(challenge.id) || !/^[0-9a-f]{64}$/.test(challenge.flagHash || '') || !Array.isArray(challenge.hints) || !challenge.vfs || typeof challenge.vfs !== 'object') errors.push(issue('invalid-ctf', `Malformed challenge ${challenge.id ?? '(missing id)'}`, 'data/ctf.json'));
  if (!Array.isArray(categories) || categories.some((category) => !category.id || !category.label || !Array.isArray(category.commands))) errors.push(issue('invalid-cheatsheet', 'Cheatsheet categories are malformed', 'data/cheatsheet.json'));
  if (!Array.isArray(terms) || terms.some((term) => !term.id || !term.term || !term.definition)) errors.push(issue('invalid-glossary', 'Glossary terms are malformed', 'data/glossary.json'));
  if (!Array.isArray(news) || news.some((entry) => !entry.id || !entry.title || !entry.source_url)) errors.push(issue('invalid-news', 'News entries are malformed', 'data/news.json'));
  const counts = { modules: MODULE_IDS.length, lessons: lessonIds.length, exercises: exerciseIds.length, quizQuestions: questionIds.length, quizzes: Object.keys(quizzes).length, ctfChallenges: challengeIds.length, cheatsheetCommands: categories.reduce((total, category) => total + category.commands.length, 0), glossaryTerms: termIds.length, news: news.length };
  const expected = { modules: 14, lessons: 73, exercises: 38, quizQuestions: 70, quizzes: 14, ctfChallenges: 10, cheatsheetCommands: 118, glossaryTerms: 74 };
  for (const [name, value] of Object.entries(expected)) if (counts[name] !== value) errors.push(issue('unexpected-count', `${name}: expected ${value}, found ${counts[name]}`, 'data/'));
  return { errors, warnings, counts, data };
}
export function findDanglingVfsReferences(vfs) {
  const dangling = [];
  for (const [parent, node] of Object.entries(vfs)) {
    if (!node || node.type !== 'dir') continue;
    for (const child of node.children || []) {
      const childPath = parent === '/' ? `/${child}` : `${parent.replace(/\/$/, '')}/${child}`;
      if (!Object.hasOwn(vfs, childPath)) dangling.push({ parent, child, childPath });
    }
  }
  return dangling.sort((a, b) => a.childPath.localeCompare(b.childPath));
}
