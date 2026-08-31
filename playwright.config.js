import { defineConfig } from '@playwright/test';

const host = '127.0.0.1';
const target = process.env.LINUXPATH_E2E_TARGET || 'source';
const servers = {
  source: { port: 4177, directory: '.', serviceWorkers: 'block' },
  dist: { port: 4178, directory: 'dist', serviceWorkers: 'block' },
  offline: { port: 4179, directory: 'dist', serviceWorkers: 'allow' },
};
if (!servers[target]) {
  throw new Error(`Unknown LINUXPATH_E2E_TARGET=${target}`);
}
const selected = servers[target];
const baseURL = `http://${host}:${selected.port}/`;
const node = `"${process.execPath}"`;
const managedServer = process.env.LINUXPATH_E2E_MANAGED_SERVER === '1';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  maxFailures: 0,
  outputDir: `test-results/artifacts-${target}`,
  reporter: [
    ['list'],
    ['json', { outputFile: `test-results/playwright-${target}.json` }],
  ],
  ...(managedServer ? {} : {
    webServer: {
      command: `${node} scripts/e2e-static-server.mjs ${selected.port} ${selected.directory}`,
      url: baseURL,
      reuseExistingServer: false,
      timeout: 30_000,
      stdout: 'ignore',
      stderr: 'pipe',
    },
  }),
  use: {
    baseURL,
    headless: true,
    locale: 'fr-FR',
    timezoneId: 'Europe/Paris',
    viewport: { width: 1440, height: 1000 },
    launchOptions: { args: ['--no-sandbox'] },
    serviceWorkers: selected.serviceWorkers,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    target === 'offline'
      ? { name: target, testMatch: /offline\.spec\.js/ }
      : { name: target, testIgnore: /offline\.spec\.js/ },
  ],
});
