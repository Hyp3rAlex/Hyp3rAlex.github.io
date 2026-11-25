import { expect, test } from '@playwright/test';

test.use({ javaScriptEnabled: false });

test('without JavaScript: content is visible and navigation uses plain links', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Alexander');
  // Reveal animations must not hide content when JS never runs.
  const hidden = await page
    .locator('[data-reveal]')
    .evaluateAll((els) => els.filter((el) => getComputedStyle(el).opacity !== '1').length);
  expect(hidden).toBe(0);
  // JS-only controls stay out of the way instead of being dead buttons.
  await expect(page.locator('[data-cmdk-open]')).toBeHidden();
  await expect(page.locator('[data-theme-toggle]')).toBeHidden();
  await page.locator('#work a[href^="/projects/"]').first().click();
  await expect(page).toHaveURL(/\/projects\/[a-z-]+\/$/);
  await expect(page.locator('.demo').first()).toBeVisible();
});

test('without JavaScript: recruiter page shows all focus areas and projects list is complete', async ({ page }) => {
  await page.goto('/recruiter/');
  await expect(page.locator('[data-focus-panel]')).toHaveCount(3);
  for (const panel of await page.locator('[data-focus-panel]').all()) await expect(panel).toBeVisible();
  await page.goto('/projects/');
  expect(await page.locator('.plist > li').count()).toBeGreaterThanOrEqual(5);
  await expect(page.locator('.filter-bar')).toBeHidden();
});

test('without JavaScript: CV downloads are plain links on the CV page and in every specialization', async ({ page, request }) => {
  test.skip((await request.get('/cv/manifest.json')).status() !== 200, 'this build ships no CV files');
  await page.goto('/resume/');
  expect(await page.locator('.cvm a[href$=".pdf"]').count()).toBe(6);
  await page.goto('/recruiter/');
  // All three specializations are visible without JS, each with its two downloads.
  expect(await page.locator('[data-focus-panel] a[href$=".pdf"]').count()).toBe(6);
});
