import { readFile } from 'node:fs/promises';
import path from 'node:path';

export const MODULE_IDS = Array.from({ length: 14 }, (_, index) => `m${index + 1}`);
export const HW_MODULE_IDS = ['hw1', 'hw2', 'hw3', 'hw4'];
export const ALL_MODULE_IDS = [...MODULE_IDS, ...HW_MODULE_IDS];
export const TRACK_IDS = ['linux', 'network', 'offsec', 'hardware'];
export const CYBER_REFERENCE_MODULES = new Set(['m12', 'm13', 'm14']);
export const DATA_FILES = ['cheatsheet.json', 'ctf.json', 'exercise-variants.json', 'exercises.json', 'glossary.json', 'lessons.json', 'modules.json', 'news.json', 'quizzes.json', 'vfs.json'];
export async function loadJson(relativePath, root = process.cwd()) {
  return JSON.parse(await readFile(path.join(root, relativePath), 'utf8'));
}
function issue(code, message, location) { return { severity: 'error', code, location, message }; }
function duplicateValues(values) {
  const seen = new Set(); const duplicates = new Set();
  for (const value of values) { if (seen.has(value)) duplicates.add(value); seen.add(value); }
  return [...duplicates].sort();
}
function isValidReviewDate(value) {
  return typeof value === 'string'
    && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(`${value}T00:00:00Z`));
}
function hasValidCyberSources(lesson) {
  if (!Array.isArray(lesson.sources) || lesson.sources.length < 2) return false;
  return lesson.sources.every((source) => {
    if (!source || typeof source !== 'object' || !source.title || !source.scope || source.checkedAt !== lesson.reviewedAt || !isValidReviewDate(source.checkedAt)) return false;
    try {
      return new URL(source.url).protocol === 'https:';
    } catch {
      return false;
    }
  });
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
  if (!catalogue || !Array.isArray(catalogue.modules) || catalogue.modules.length !== ALL_MODULE_IDS.length) {
    errors.push(issue('invalid-modules', 'modules.json must list exactly m1 through m14 plus hw1 through hw4', 'data/modules.json'));
  } else {
    const ids = catalogue.modules.map((entry) => entry.id);
    if (JSON.stringify(ids) !== JSON.stringify(ALL_MODULE_IDS)) errors.push(issue('module-coverage', 'modules.json must define exactly m1 through m14 plus hw1 through hw4 in order', 'data/modules.json'));
    for (const entry of catalogue.modules) {
      if (!entry.title || !TRACK_IDS.includes(entry.track) || !['published', 'draft'].includes(entry.status) || !Array.isArray(entry.prerequisites) || typeof entry.displayOrder !== 'number' || !Array.isArray(entry.objectives) || entry.objectives.length < 2 || !Number.isFinite(entry.estimatedMinutes) || typeof entry.successCriteria !== 'string') {
        errors.push(issue('invalid-module', `Malformed module ${entry.id ?? '(missing id)'}`, 'data/modules.json'));
      }
    }
    const tracks = catalogue.tracks;
    if (!Array.isArray(tracks) || tracks.length !== TRACK_IDS.length || JSON.stringify(tracks.map((track) => track.id)) !== JSON.stringify(TRACK_IDS)) {
      errors.push(issue('invalid-tracks', 'modules.json must define exactly four tracks (linux, network, offsec, hardware)', 'data/modules.json'));
    }
  }
  const publishedIds = (catalogue?.modules || []).filter((entry) => entry.status === 'published').map((entry) => entry.id);
  const publishedIdsSorted = [...ALL_MODULE_IDS].filter((id) => publishedIds.includes(id));
  const categories = data['cheatsheet.json'].categories; const news = data['news.json'].news;
  const sortByCanonical = (a, b) => ALL_MODULE_IDS.indexOf(a) - ALL_MODULE_IDS.indexOf(b);
  for (const [name, groups] of Object.entries({ lessons, exercises, quizzes })) {
    const keys = Object.keys(groups).sort(sortByCanonical);
    if (JSON.stringify(keys) !== JSON.stringify(publishedIdsSorted)) errors.push(issue('module-coverage', `${name} must define exactly the published modules`, `data/${name}.json`));
  }
  const lessonIds = Object.values(lessons).flat().map((entry) => entry.id);
  const exerciseIds = Object.values(exercises).flat().map((entry) => entry.id);
  // The current quiz schema has no persisted question id. Use stable, positional
  // validation keys instead of inventing a production requirement in the harness.
  const questionIds = publishedIdsSorted.flatMap((moduleId) => (quizzes[moduleId]?.questions || []).map((_, index) => `${moduleId}-q${index + 1}`));
  const challengeIds = challenges.map((entry) => entry.id); const termIds = terms.map((entry) => entry.id);
  for (const [label, values] of Object.entries({ lesson: lessonIds, exercise: exerciseIds, question: questionIds, challenge: challengeIds, term: termIds })) {
    for (const duplicate of duplicateValues(values)) errors.push(issue('duplicate-id', `Duplicate ${label} id: ${duplicate}`, 'data/'));
    if (values.some((value) => typeof value !== 'string' || value.length === 0)) errors.push(issue('invalid-id', `${label} ids must be non-empty strings`, 'data/'));
  }
  for (const moduleId of publishedIdsSorted) {
    for (const lesson of lessons[moduleId] || []) {
      if (!lesson.id.startsWith(`${moduleId}-l`) || !lesson.title || !lesson.content || lesson.reviewStatus !== 'reviewed' || !lesson.reviewedAt || !lesson.distro) errors.push(issue('invalid-lesson', `Malformed lesson ${lesson.id ?? '(missing id)'}`, `data/lessons.json#${moduleId}`));
      if (CYBER_REFERENCE_MODULES.has(moduleId) && !hasValidCyberSources(lesson)) errors.push(issue('invalid-cyber-source', `Lesson ${lesson.id ?? '(missing id)'} must provide at least two checked HTTPS references`, `data/lessons.json#${moduleId}`));
    }
    for (const exercise of exercises[moduleId] || []) {
      const investigation = exercise.mode === 'investigation';
      const commandContract = Array.isArray(exercise.accepted) && exercise.accepted.length > 0 && exercise.validator && typeof exercise.validator === 'object' && exercise.validator.type;
      const reportContract = Array.isArray(exercise.reportFields) && exercise.reportFields.length > 0 && exercise.reportFields.every((field) => field.id && field.label && field.type);
      if (!exercise.id.startsWith(`${moduleId}-e`) || !exercise.title || !exercise.desc || !Array.isArray(exercise.hints) || (investigation ? !reportContract : !commandContract)) {
        errors.push(issue('invalid-exercise', `Malformed exercise ${exercise.id ?? '(missing id)'}`, `data/exercises.json#${moduleId}`));
      }
    }
    const quiz = quizzes[moduleId];
    if (!quiz || !quiz.title || !Array.isArray(quiz.questions) || quiz.questions.length === 0) { errors.push(issue('invalid-quiz', `Malformed quiz ${moduleId}`, `data/quizzes.json#${moduleId}`)); continue; }
    for (const question of quiz.questions) if (!Array.isArray(question.options) || question.options.length < 2 || !Number.isInteger(question.correct) || question.correct < 0 || question.correct >= question.options.length || !question.q || !question.expl) errors.push(issue('invalid-question', `Malformed question ${question.id ?? '(missing id)'}`, `data/quizzes.json#${moduleId}`));
  }
  for (const challenge of challenges) if (!/^ctf-\d{2}$/.test(challenge.id) || !/^[0-9a-f]{64}$/.test(challenge.flagHash || '') || !Array.isArray(challenge.hints) || !challenge.vfs || typeof challenge.vfs !== 'object') errors.push(issue('invalid-ctf', `Malformed challenge ${challenge.id ?? '(missing id)'}`, 'data/ctf.json'));
  const variantCatalogue = data['exercise-variants.json'];
  const expectedGroups = ['m12-audit', 'm13-pentest', 'm14-dfir'];
  if (!variantCatalogue || JSON.stringify(Object.keys(variantCatalogue.groups || {})) !== JSON.stringify(expectedGroups)) {
    errors.push(issue('invalid-variant-groups', 'exercise-variants.json must define the three Cyber groups in canonical order', 'data/exercise-variants.json'));
  } else {
    for (const groupId of expectedGroups) {
      const group = variantCatalogue.groups[groupId];
      const moduleExerciseIds = (exercises[group.moduleId] || []).map((exercise) => exercise.id);
      if (!Array.isArray(group.variants) || group.variants.length !== 4 || JSON.stringify(group.exerciseIds) !== JSON.stringify(moduleExerciseIds)) {
        errors.push(issue('invalid-variant-group', `${groupId} must define four variants and all module exercises`, `data/exercise-variants.json#${groupId}`));
        continue;
      }
      if (duplicateValues(group.variants.map((variant) => variant.id)).length) errors.push(issue('duplicate-variant', `Duplicate variant id in ${groupId}`, `data/exercise-variants.json#${groupId}`));
      for (const variant of group.variants) {
        const covered = Object.keys(variant.exercises || {}).sort();
        if (!variant.id || !variant.title || !variant.brief || !variant.correction || !variant.vfsOverlay || JSON.stringify(covered) !== JSON.stringify([...group.exerciseIds].sort())) {
          errors.push(issue('invalid-variant', `Malformed variant ${variant.id ?? '(missing id)'}`, `data/exercise-variants.json#${groupId}`));
        }
      }
    }
  }
  if (!Array.isArray(categories) || categories.some((category) => !category.id || !category.label || !Array.isArray(category.commands))) errors.push(issue('invalid-cheatsheet', 'Cheatsheet categories are malformed', 'data/cheatsheet.json'));
  if (!Array.isArray(terms) || terms.some((term) => !term.id || !term.term || !term.definition)) errors.push(issue('invalid-glossary', 'Glossary terms are malformed', 'data/glossary.json'));
  if (!Array.isArray(news) || news.some((entry) => !entry.id || !entry.title || !entry.source_url)) errors.push(issue('invalid-news', 'News entries are malformed', 'data/news.json'));
  const counts = { modules: ALL_MODULE_IDS.length, lessons: lessonIds.length, exercises: exerciseIds.length, quizQuestions: questionIds.length, quizzes: Object.keys(quizzes).length, ctfChallenges: challengeIds.length, cheatsheetCommands: categories.reduce((total, category) => total + category.commands.length, 0), glossaryTerms: termIds.length, news: news.length };
  const expected = { modules: 18, lessons: 93, exercises: 46, quizQuestions: 90, quizzes: 18, ctfChallenges: 10, cheatsheetCommands: 118, glossaryTerms: 74 };
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
