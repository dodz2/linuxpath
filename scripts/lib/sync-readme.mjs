import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { getCurriculumStats } from './curriculum-stats.mjs';

export async function syncReadme(root = process.cwd()) {
  const stats = await getCurriculumStats(root);
  const file = path.join(root, 'README.md');
  const current = await readFile(file, 'utf8');
  const next = current
      .replace(/- \d+ modules (?:publiés )?r?répartis en (?:trois|quatre) parcours : Fondamentaux Linux \(M1–M8\), Réseau & services \(M9–M11\), Sécurité, Pentest & DFIR \(M12–M14\)(?: et Lab & Tinker \(HW1, HW2, HW3, HW4 — matériel ; HW2–HW4 en préparation\))?\./, `- ${stats.modules} modules publiés répartis en quatre parcours : Fondamentaux Linux (M1–M8), Réseau & services (M9–M11), Sécurité, Pentest & DFIR (M12–M14) et Lab & Tinker (HW1, HW2, HW3, HW4 — matériel ; HW2–HW4 en préparation).`)
      .replace(/- \d+ leçons, \d+ exercices(?:, \d+ questions de quiz)? et un quiz par module\./, `- ${stats.lessons} leçons, ${stats.exercises} exercices, ${stats.questions} questions de quiz et un quiz par module.`)
      .replace(/- \d+ challenges CTF avec système de hints et validation par hash\./, `- ${stats.challenges} challenges CTF avec système de hints et validation par hash.`);
  if (next !== current) await writeFile(file, next);
  return stats;
}
