import { test, expect } from '@playwright/test';

test('every url listed in the served sitemap answers HTTP 200 with a coherent canonical', async ({ request }) => {
  const sitemapResp = await request.get('/sitemap.xml');
  expect(sitemapResp.status()).toBe(200);
  const xml = await sitemapResp.text();
  const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  expect(urls.length).toBeGreaterThanOrEqual(1);
  for (const url of urls) {
    expect(url).not.toContain('#');
    // fetch the deployed equivalent (same path, local origin)
    const pathname = new URL(url).pathname.replace(/\/linuxpath\/?$/, '/');
    const resp = await request.get(pathname.endsWith('/') ? './' : '.' + pathname);
    expect(resp.status()).toBe(200);
    const html = await resp.text();
    // canonical must match the deployed loc exactly (trailing slash)
    expect(html).toContain(`<link rel="canonical" href="https://dodz2.github.io/linuxpath/">`);
  }
});

test('robots.txt is served and points only at served resources', async ({ request }) => {
  const resp = await request.get('/robots.txt');
  expect(resp.status()).toBe(200);
  const body = await resp.text();
  expect(body).toContain('Sitemap: https://dodz2.github.io/linuxpath/sitemap.xml');
  expect(body).toContain('Disallow: /v86/');
});

test('without JavaScript the home still renders essential metadata and a visible fallback', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  const resp = await page.goto('./', { waitUntil: 'domcontentloaded' });
  expect(resp?.status()).toBe(200);
  // head metadata is static, readable without JS
  await expect(page).toHaveTitle(/LinuxPath/);
  const canonical = await page.locator('link[rel="canonical"]').getAttribute('href');
  expect(canonical).toBe('https://dodz2.github.io/linuxpath/');
  await expect(page.locator('script[type="application/ld+json"]')).toHaveCount(1);
  // body is not blank: a fallback hero is actually visible
  await expect(page.locator('#home-hero')).toContainText(/Linux|JavaScript/i);
  const visible = await page.locator('#home-hero').isVisible();
  expect(visible).toBe(true);
  await context.close();
});