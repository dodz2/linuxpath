import { checkReferences } from './lib/reference-check.mjs';

const root = process.argv[2] || process.cwd();
const result = await checkReferences(root);
console.log(JSON.stringify({ root: result.root, checked: result.checked, missing: result.missing }, null, 2));
process.exit(result.missing.length === 0 ? 0 : 1);
