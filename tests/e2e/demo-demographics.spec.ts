import { expect, test, type Locator, type Page } from '@playwright/test';

/** End-to-end test of the Demographics Service demo: API replay, explorer, and the guided "Try it" steps. */
const URL = '/projects/demographics-service/';

async function open(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(URL);
  const demo = page.locator('demographics-demo');
  // Controls are rendered disabled and enabled once the custom element has upgraded.
  await expect(demo.locator('[data-send]')).toBeEnabled();
  return { demo, errors };
}

const preset = (demo: Locator, path: string) => demo.getByRole('button', { name: `GET ${path}`, exact: true });
const visibleRows = (demo: Locator) => demo.locator('tbody tr:not([hidden])');
const body = async (demo: Locator) => JSON.parse((await demo.locator('[data-body]').textContent()) ?? 'null');

test.describe('Demographics demo', () => {
  test('server-renders the default request and all rows', async ({ page }) => {
    const { demo } = await open(page);
    await expect(demo.locator('.badge')).toContainText(/static replay/i);
    await expect(demo.locator('[data-status]')).toHaveText('200 OK · array of 50 objects');
    await expect(visibleRows(demo)).toHaveCount(51); // 50 aggregated rows + the skipped Connecticut row
    await expect(visibleRows(demo).first()).toContainText('California');
    await expect(visibleRows(demo).first()).toContainText('39,877,642');
    await expect(demo.locator('[data-skip]')).toContainText(/skipped/i);
  });

  test('presets return the status and body the controller would', async ({ page }) => {
    const { demo, errors } = await open(page);

    await preset(demo, '/api/states/Texas').click();
    await expect(demo.locator('[data-status]')).toHaveText('200 OK · 1 object');
    expect(await body(demo)).toEqual({ stateName: 'Texas', population: 30506523, updatedAt: '2026-11-25T01:24:10Z' });
    await expect(preset(demo, '/api/states/Texas')).toHaveAttribute('aria-pressed', 'true');
    await expect(demo.locator('tr[data-hit]')).toHaveAttribute('data-name', 'Texas');

    await preset(demo, '/api/states/texas').click();
    await expect(demo.locator('[data-status]')).toHaveText('404 Not Found · empty body');
    await expect(demo.locator('[data-status]')).toHaveAttribute('data-state', 'warn');
    await expect(demo.locator('[data-body]')).toBeHidden();
    await expect(demo.locator('[data-note]')).toContainText('case-sensitive');

    await preset(demo, '/api/states/Connecticut').click();
    await expect(demo.locator('[data-status]')).toHaveText('404 Not Found · empty body');
    await expect(demo.locator('[data-note]')).toContainText('null population');

    await preset(demo, '/api/states/District%20of%20Columbia').click();
    expect(await body(demo)).toMatchObject({ stateName: 'District of Columbia', population: 700690 });

    await preset(demo, '/api/states?name=Texas').click();
    await expect(demo.locator('[data-status]')).toHaveText('200 OK · array of 50 objects');
    expect(await body(demo)).toHaveLength(50);
    await expect(demo.locator('[data-live]')).toContainText('ignored');
    expect(errors).toEqual([]);
  });

  test('a typed path is sent with Enter and with the Send button', async ({ page }) => {
    const { demo } = await open(page);
    const input = demo.locator('[data-path-input]');

    await input.fill('/api/states/New%20York');
    await input.press('Enter');
    await expect(demo.locator('[data-req]')).toHaveText('GET /api/states/New%20York');
    expect(await body(demo)).toMatchObject({ stateName: 'New York', population: 20113414 });

    await input.fill('/api/nope');
    await demo.locator('[data-send]').click();
    await expect(demo.locator('[data-status]')).toHaveText('404 Not Found · body not replayed');
  });

  test('explorer: sort, filter, metric and Reset', async ({ page }) => {
    const { demo } = await open(page);
    const first = visibleRows(demo).first();

    await demo.getByRole('button', { name: 'Name A–Z' }).click();
    await expect(first).toContainText('Alabama');
    await expect(demo.locator('th[data-col="name"]')).toHaveAttribute('aria-sort', 'ascending');

    await demo.getByRole('button', { name: 'Value ↑' }).click();
    await expect(first).toContainText('Wyoming');
    await expect(first).toContainText('578,766');

    await demo.getByLabel('Metric').selectOption('records');
    await expect(demo.locator('[data-metric-head]')).toHaveText('County-level records');
    await expect(first).toContainText('District of Columbia');
    await demo.getByRole('button', { name: 'Value ↓' }).click();
    await expect(first).toContainText('Texas');
    await expect(first.locator('[data-value]')).toHaveText('254');

    await demo.getByLabel('Metric').selectOption('share');
    await expect(first).toContainText('California');
    await expect(first.locator('[data-value]')).toHaveText('11.94 %');

    await demo.getByLabel('Filter by name or abbreviation').fill('new');
    await expect(visibleRows(demo)).toHaveCount(4);
    await expect(demo.locator('[data-shown]')).toHaveText('4 of 50');
    await expect(demo.locator('[data-sum]')).toHaveText('33,040,914');

    await demo.getByLabel('Filter by name or abbreviation').fill('zzz');
    await expect(demo.locator('[data-none]')).toBeVisible();
    await expect(demo.locator('[data-shown]')).toHaveText('0 of 50');

    await demo.getByRole('button', { name: 'Reset' }).click();
    await expect(demo.getByLabel('Filter by name or abbreviation')).toHaveValue('');
    await expect(demo.getByLabel('Metric')).toHaveValue('population');
    await expect(visibleRows(demo)).toHaveCount(51);
    await expect(first).toContainText('California');
    await expect(first.locator('[data-value]')).toHaveText('39,877,642');
    await expect(demo.locator('[data-shown]')).toHaveText('50 of 50');
    await expect(demo.locator('[data-sum]')).toHaveText('333,859,535');
    await expect(demo.locator('[data-status]')).toHaveText('200 OK · array of 50 objects');
    await expect(demo.locator('[data-path-input]')).toHaveValue('/api/states');
  });

  test('selecting a state in the explorer sends its request', async ({ page }) => {
    const { demo } = await open(page);
    await demo.getByRole('button', { name: 'Florida: send GET request' }).click();
    await expect(demo.locator('[data-req]')).toHaveText('GET /api/states/Florida');
    expect(await body(demo)).toMatchObject({ stateName: 'Florida', population: 22381338 });
    await expect(demo.locator('[data-path-input]')).toHaveValue('/api/states/Florida');
    await expect(demo.locator('tr[data-hit]')).toHaveAttribute('data-name', 'Florida');
  });

  test('the "Try it yourself" steps lead to the outcomes they describe', async ({ page }) => {
    const { demo } = await open(page);
    await expect(page.locator('.tryit li')).toHaveCount(3);

    // 01 — the …/Texas preset answers 200 with a single object
    await demo.getByRole('button', { name: 'GET /api/states/Texas', exact: true }).click();
    await expect(demo.locator('[data-status]')).toHaveText('200 OK · 1 object');
    expect(Array.isArray(await body(demo))).toBe(false);

    // 02 — filtering for "conn" leaves Connecticut as a skipped row
    await demo.getByLabel('Filter by name or abbreviation').fill('conn');
    await expect(visibleRows(demo)).toHaveCount(1);
    await expect(demo.locator('[data-skip]')).toBeVisible();
    await expect(demo.locator('[data-skip]')).toContainText(/skipped/i);

    // 03 — selecting its name sends the request: 404 with an empty body
    await demo.getByRole('button', { name: 'Connecticut: send GET request' }).click();
    await expect(demo.locator('[data-req]')).toHaveText('GET /api/states/Connecticut');
    await expect(demo.locator('[data-status]')).toHaveText('404 Not Found · empty body');
    await expect(demo.locator('[data-body]')).toBeHidden();
    await expect(demo.locator('[data-empty]')).toBeVisible();
  });
});
