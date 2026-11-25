import { expect, test, type Locator, type Page } from '@playwright/test';

/**
 * Ride Planner demo, end to end. The expected routes and the α values where they flip are the ones
 * asserted by tests/unit/rideplanner.test.ts on the same synthetic graph.
 */
const URL = '/projects/bmw-ride-planner/';
const MOTORWAY = 'A → M1 → M2 → S → M3 → M4 → B';
const PRIMARY = 'A → P1 → P2 → P3 → P4 → B';
const LAKE = 'A → L1 → L2 → L3 → L4 → L5 → B';
const PASS = 'A → N1 → N2 → N3 → N4 → N5 → B';

async function open(page: Page) {
  await page.goto(URL);
  const demo = page.locator('rideplanner-demo');
  await demo.scrollIntoViewIfNeeded();
  await expect(demo.locator('[data-status]')).toContainText(LAKE); // server-rendered default
  // Controls only respond once the custom element is defined.
  await page.evaluate(() => customElements.whenDefined('rideplanner-demo'));
  await expect(demo.locator('input[name="alpha"]')).toBeEnabled();
  return {
    demo,
    status: demo.locator('[data-status]'),
    readout: demo.locator('[data-readout]'),
    alpha: demo.locator('input[name="alpha"]'),
    beta: demo.locator('input[name="beta"]'),
    alphaOut: demo.locator('[data-out="alpha"]'),
    avoid: demo.getByLabel(/Avoid motorways/),
    soft: demo.getByLabel(/Penalise major roads/),
    straight: demo.getByLabel(/Penalise straight roads/),
    to: demo.getByLabel('Destination'),
    from: demo.getByLabel('Start'),
    reset: demo.getByRole('button', { name: 'Reset' }),
  };
}

/** Move a range input with the keyboard, one step per key press, until its output shows `target`. */
async function keyTo(page: Page, input: Locator, output: Locator, target: number) {
  await input.focus();
  for (let i = 0; i < 80; i++) {
    const now = Number(await output.textContent());
    if (Math.abs(now - target) < 0.05) return;
    await page.keyboard.press(now < target ? 'ArrowRight' : 'ArrowLeft');
  }
  throw new Error(`slider did not reach ${target}`);
}

/** Set a range input directly (for steps where the keyboard path is not what is under test). */
async function setRange(input: Locator, value: number) {
  await input.evaluate((el, v) => {
    (el as HTMLInputElement).value = String(v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);
}

test.describe('Ride Planner demo', () => {
  test('server-renders the default comparison', async ({ page }) => {
    const d = await open(page);
    await expect(d.status).toContainText('79 min, 95.7 km, mean scenic 0.69');
    await expect(d.status).toContainText('32 min longer than the fastest route (47 min');
    await expect(d.readout).toContainText('1.4 · 2.7 · 4.5');
    await expect(d.demo.locator('.rp-fast')).toHaveCount(2); // route + legend key
    await expect(d.demo.locator('.rp-pref')).toHaveCount(2);
    await expect(d.demo.locator('.demo-bar .badge')).toContainText(/synthetic graph/i);
  });

  test('α slider by keyboard flips the route at 1.4, 2.7 and 4.5', async ({ page }) => {
    test.slow(); // about 75 single key presses
    const d = await open(page);
    await keyTo(page, d.alpha, d.alphaOut, 0);
    await expect(d.status).toContainText(`equals the fastest route: ${MOTORWAY}`);
    await keyTo(page, d.alpha, d.alphaOut, 1.3);
    await expect(d.status).toContainText('equals the fastest route');
    await keyTo(page, d.alpha, d.alphaOut, 1.4);
    await expect(d.status).toContainText(PRIMARY);
    await expect(d.readout).toContainText('fastest 47 min');
    await keyTo(page, d.alpha, d.alphaOut, 2.6);
    await expect(d.status).toContainText(PRIMARY);
    await keyTo(page, d.alpha, d.alphaOut, 2.7);
    await expect(d.status).toContainText(LAKE);
    await keyTo(page, d.alpha, d.alphaOut, 4.4);
    await expect(d.status).toContainText(LAKE);
    await keyTo(page, d.alpha, d.alphaOut, 4.5);
    await expect(d.status).toContainText(PASS);
    await expect(d.status).toContainText('97 min');
  });

  test('TryIt steps describe what the demo does', async ({ page }) => {
    const d = await open(page);
    const tryit = page.locator('.tryit');
    await expect(tryit).toContainText('1.4');
    await expect(tryit).toContainText('2.7');
    await expect(tryit).toContainText('4.5');
    for (const name of ['Scenic weight α', 'Avoid motorways', 'Penalise major roads', 'Reset', 'Risk aversion β']) {
      await expect(tryit).toContainText(name);
    }
    // Step 2: α = 1.0, hard exclusion → primary road; soft penalty → lake road.
    await setRange(d.alpha, 1);
    await expect(d.status).toContainText('equals the fastest route');
    await d.avoid.check();
    await expect(d.status).toContainText(PRIMARY);
    await expect(d.demo.locator('[data-svg] .rp-x')).toHaveCount(4);
    await d.avoid.uncheck();
    await d.soft.check();
    await expect(d.status).toContainText(LAKE);
    // Step 3: Reset, then β = 0 → the pass; time and mean scenic both rise.
    await d.reset.click();
    await expect(d.alphaOut).toHaveText('3.0');
    await expect(d.soft).not.toBeChecked();
    await expect(d.status).toContainText(LAKE);
    await setRange(d.beta, 0);
    await expect(d.status).toContainText(PASS);
    await expect(d.readout).toContainText('97 min');
    await expect(d.readout).toContainText('0.83');
  });

  test('fallback notice, straight-road penalty, identical endpoints and Reset', async ({ page }) => {
    const d = await open(page);
    await d.avoid.check();
    await d.to.selectOption('S');
    await expect(d.status).toContainText('motorway required');
    await expect(d.status).toContainText('A → M1 → M2 → S');
    await d.to.selectOption('A');
    await expect(d.status).toContainText('same node');
    await d.reset.click();
    await expect(d.avoid).not.toBeChecked();
    await expect(d.to).toHaveValue('B');
    await expect(d.status).toContainText(LAKE);
    await setRange(d.alpha, 1);
    await d.straight.check();
    await expect(d.status).toContainText(PASS);
    await d.from.selectOption('N3');
    await d.to.selectOption('L3');
    await expect(d.status).toContainText(/Preferred route (equals the fastest route: )?N3 → /);
    await d.reset.click();
    await expect(d.status).toContainText(LAKE);
  });

  test('revisiting a setting reuses the memoised edge costs; the table follows the route', async ({ page }) => {
    const d = await open(page);
    await expect(d.readout).toContainText('1 built · 0 reused');
    await setRange(d.alpha, 4);
    await setRange(d.alpha, 5);
    await expect(d.readout).toContainText('3 built · 0 reused');
    await setRange(d.alpha, 4);
    await expect(d.readout).toContainText('3 built · 1 reused');
    await d.demo.locator('details > summary').click();
    const table = d.demo.locator('[data-table] table');
    await expect(table).toBeVisible();
    await expect(table.locator('.rp-group').first()).toContainText(`Preferred: ${LAKE}`);
    await expect(table.locator('.rp-total')).toHaveCount(2);
  });

  test('makes no request outside its own origin', async ({ page, baseURL }) => {
    const foreign: string[] = [];
    page.on('request', (r) => {
      if (!r.url().startsWith(baseURL!) && !r.url().startsWith('data:')) foreign.push(r.url());
    });
    const d = await open(page);
    await setRange(d.alpha, 5);
    await d.avoid.check();
    expect(foreign).toEqual([]);
  });
});

test.describe('Ride Planner demo on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('the whole graph fits the viewport width and stays usable', async ({ page }) => {
    const d = await open(page);
    const svg = d.demo.locator('[data-svg]');
    const box = (await svg.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
    // Start and destination labels are both inside the viewport: nothing to scroll sideways for.
    for (const label of ['A', 'B']) {
      const b = (await svg.locator('text.rp-l--end', { hasText: new RegExp(`^${label}$`) }).boundingBox())!;
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.x + b.width).toBeLessThanOrEqual(390);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    for (const target of [d.alpha, d.to, d.reset, d.demo.locator('.rp-check').first()]) {
      expect((await target.boundingBox())!.height).toBeGreaterThanOrEqual(43.5);
    }
    await setRange(d.alpha, 5);
    await expect(d.status).toContainText(PASS);
    await d.reset.click();
    await expect(d.status).toContainText(LAKE);
  });
});

test.describe('Ride Planner demo without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('shows the default result and no live-looking dead controls', async ({ page }) => {
    await page.goto(URL);
    const demo = page.locator('rideplanner-demo');
    await expect(demo.locator('[data-status]')).toContainText(LAKE);
    await expect(demo.locator('[data-svg] .rp-pref')).toHaveCount(1);
    for (const control of await demo.locator('form input, form select, form button').all()) {
      await expect(control).toBeDisabled();
    }
    await expect(demo.locator('.rp-nojs')).toBeVisible();
  });
});
