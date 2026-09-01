import { assertGeneratedAssetsCurrent } from './lib/generated-assets.mjs';

try {
  const checkedBundles = await assertGeneratedAssetsCurrent(process.cwd());
  console.log(JSON.stringify({ checkedBundles, status: 'current' }, null, 2));
} catch (error) {
  console.error(error.message || error);
  process.exitCode = 1;
}
