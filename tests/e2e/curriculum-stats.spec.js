import { test, expect } from '@playwright/test';
import { openApp } from './helpers.js';

test.use({ serviceWorkers: 'block' });

test('runtime track cards derive duration from served module minutes instead of static HTML', async ({ page }) => {
  let intercepted = false;
  await page.route('**/data/modules.json', async (route) => {
    intercepted = true;
    const response = await route.fetch();
    const body = await response.json();
    const module = body.modules.find((entry) => entry.id === 'm1');
    module.estimatedMinutes += 60;
    await route.fulfill({ response, json: body });
  });

  await openApp(page);
  expect(intercepted).toBe(true);
  expect(await page.evaluate(() => ({
    minutes: MODULES.find((entry) => entry.id === 'm1')?.estimatedMinutes,
    hours: getCurriculumStats().tracks.linux.estimatedHours,
  }))).toEqual({ minutes: 110, hours: 10 });
  await expect(page.locator('.track-card[data-track="linux"]')).toContainText('~10 h');
});
