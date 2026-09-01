import { syncReadme } from './lib/sync-readme.mjs';

const stats = await syncReadme(process.cwd());
console.log(`README.md synchronisé (${stats.modules} modules, ${stats.lessons} leçons).`);
