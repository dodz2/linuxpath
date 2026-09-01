import { writeGeneratedAssets } from './lib/generated-assets.mjs';

const count = await writeGeneratedAssets(process.cwd());
console.log(`Generated ${count} minified asset bundle(s).`);
