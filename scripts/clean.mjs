import { rm } from 'node:fs/promises';

for (const target of ['dist', 'test-results', 'playwright-report', 'blob-report']) {
  await rm(target, { recursive: true, force: true });
}
console.log('Generated build and test artifacts removed.');
