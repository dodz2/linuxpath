import { loadJson } from './content-validation.mjs';

function countGrouped(source) {
  return Object.values(source).reduce((total, value) => total + (Array.isArray(value) ? value.length : 0), 0);
}

export async function getCurriculumStats(root = process.cwd()) {
  const [modulesFile, lessons, exercises, quizzes, ctf, cheatsheet, glossary] = await Promise.all([
    loadJson('data/modules.json', root),
    loadJson('data/lessons.json', root),
    loadJson('data/exercises.json', root),
    loadJson('data/quizzes.json', root),
    loadJson('data/ctf.json', root),
    loadJson('data/cheatsheet.json', root),
    loadJson('data/glossary.json', root),
  ]);
  const modules = modulesFile.modules.filter((entry) => entry.status === 'published');
  const estimatedMinutes = modules.reduce((total, entry) => total + entry.estimatedMinutes, 0);
  const tracks = modulesFile.tracks.map((track) => {
    const publishedModules = modules.filter((entry) => track.modules.includes(entry.id));
    const trackMinutes = publishedModules.reduce((total, entry) => total + entry.estimatedMinutes, 0);
    return {
      id: track.id,
      modules: publishedModules.length,
      estimatedMinutes: trackMinutes,
      estimatedHours: Math.ceil(trackMinutes / 60),
    };
  });
  const questions = Object.values(quizzes).reduce((total, quiz) => total + (quiz?.questions || []).length, 0);
  const commands = (cheatsheet.categories || []).reduce((total, category) => total + (category.commands || []).length, 0);
  return {
    modules: modules.length,
    estimatedMinutes,
    estimatedHours: Math.ceil(estimatedMinutes / 60),
    tracks,
    lessons: countGrouped(lessons),
    exercises: countGrouped(exercises),
    quizzes: Object.keys(quizzes).length,
    questions,
    challenges: (ctf.challenges || []).length,
    cheatsheetCommands: commands,
    glossaryTerms: (glossary.terms || []).length,
    linux: modules.filter((entry) => entry.track === 'linux').length,
    network: modules.filter((entry) => entry.track === 'network').length,
    offsec: modules.filter((entry) => entry.track === 'offsec').length,
  };
}
