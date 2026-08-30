import { validateContent } from './lib/content-validation.mjs';

const result = await validateContent(process.argv[2] || process.cwd());
console.log(JSON.stringify({ counts: result.counts, warnings: result.warnings, errors: result.errors }, null, 2));
process.exit(result.errors.length === 0 ? 0 : 1);
