import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { getCurriculumStats } from './curriculum-stats.mjs';

async function readmeUpdate(root) {
  const stats = await getCurriculumStats(root);
  const file = path.join(root, 'README.md');
  const current = await readFile(file, 'utf8');
  const next = current
      .replace(/- \d+ modules (?:publiés )?r?répartis en (?:trois|quatre) parcours : Fondamentaux Linux \(M1–M8\), Réseau & services \(M9–M11\), Sécurité, Pentest & DFIR \((?:CS1 \+ )?M12–M14\)(?: et Lab & Tinker \((?:HW1–HW4|HW1, HW2, HW3, HW4) — matériel\))?\./, `- ${stats.modules} modules publiés répartis en quatre parcours : Fondamentaux Linux (M1–M8), Réseau & services (M9–M11), Sécurité, Pentest & DFIR (CS1 + M12–M14) et Lab & Tinker (HW1–HW4 — matériel).`)
      .replace(/- \d+ leçons, \d+ exercices(?:, \d+ questions de quiz)? et un quiz par module\./, `- ${stats.lessons} leçons, ${stats.exercises} exercices, ${stats.questions} questions de quiz et un quiz par module.`)
      .replace(/- \d+ challenges CTF avec système de hints et validation par hash\./, `- ${stats.challenges} challenges CTF avec système de hints et validation par hash.`);
  return { current, file, next, stats };
}

export async function assertReadmeCurrent(root = process.cwd()) {
  const update = await readmeUpdate(root);
  if (update.next !== update.current) {
    throw new Error('README.md est périmé par rapport aux données du curriculum.');
  }
  return update.stats;
}

export async function syncReadme(root = process.cwd()) {
  const update = await readmeUpdate(root);
  if (update.next !== update.current) await writeFile(update.file, update.next);
  return update.stats;
}
