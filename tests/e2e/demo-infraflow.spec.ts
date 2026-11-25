import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

/**
 * Operates the InfraFlow demo in a real browser and compares what it shows with the same fixtures the
 * unit tests use (src/data/demo/infraflow.json → expected.fixtures).
 */
interface Fixture {
  name: string;
  count: number;
  values: Record<string, number | null>;
}
const data = JSON.parse(readFileSync(new URL('../../src/data/demo/infraflow.json', import.meta.url), 'utf8')) as {
  expected: { fixtures: Fixture[] };
};
const fixture = (name: string) => data.expected.fixtures.find((f) => f.name === name)!;

const PAGE = '/projects/infraflow-mission-control/';
const COUNT_KPIS = [
  'total_demands',
  'open_demands',
  'approval_pending',
  'high_priority_not_approvable',
  'overdue_open',
  'blocked_open',
  'stale_open',
  'unassigned_open',
];
const pct = (v: number | null) => (v === null ? 'n/a' : `${v.toFixed(1)} %`);

/** Tiles may sit inside a collapsed <details> on phones, so compare text content, not visibility. */
async function expectFixture(page: Page, name: string) {
  const f = fixture(name);
  const demo = page.locator('infraflow-demo');
  for (const k of COUNT_KPIS) await expect(demo.locator(`[data-kpi="${k}"]`), `${name}: ${k}`).toHaveText(String(f.values[k]), { useInnerText: false });
  await expect(demo.locator('[data-kpi="completeness_pct"]')).toHaveText(pct(f.values.completeness_pct ?? null), { useInnerText: false });
  await expect(demo.locator('.records tbody tr[data-id]:not([hidden])')).toHaveCount(f.count);
  await expect(demo.locator('[data-row-count]')).toHaveText(`${f.count} of 50`, { useInnerText: false });
}

async function openDemo(page: Page) {
  await page.goto(PAGE);
  const demo = page.locator('infraflow-demo');
  await demo.scrollIntoViewIfNeeded();
  // Controls are server-rendered disabled and enabled by the custom element.
  await expect(demo.getByRole('button', { name: 'Reset' })).toBeEnabled();
  return demo;
}

async function runScenario(page: Page) {
  const demo = await openDemo(page);
  await expectFixture(page, 'all');

  // Try-it step 1: the Decision board preset.
  const board = demo.getByRole('button', { name: 'Decision board' });
  await board.click();
  await expect(board).toHaveAttribute('aria-pressed', 'true');
  await expectFixture(page, 'decision_board');
  await expect(demo.locator('[data-kpi="total_demands"]')).toHaveText('9', { useInnerText: false });
  await expect(demo.locator('[data-kpi="approval_pending"]')).toHaveText('5', { useInnerText: false });
  await expect(demo.locator('[data-status-count]')).toHaveText('2 of 12 selected', { useInnerText: false });

  // Try-it step 2: narrow to the storage category — one deferred demand is left.
  await demo.getByLabel('Category').selectOption('storage');
  await expect(demo.locator('.records tbody tr[data-id]:not([hidden])')).toHaveCount(1);
  await expect(demo.locator('.records tbody tr[data-id]:not([hidden])')).toHaveAttribute('data-id', 'ORION-REQ-017');
  await expect(demo.getByRole('status')).toHaveText('1 of 50 demands shown: 1 open, 0 awaiting decision, 0 overdue.');

  // A category on its own, against the audit fixture.
  await demo.getByRole('button', { name: 'All', exact: true }).click();
  await expectFixture(page, 'category_storage');

  // Try-it step 3: sort by score. On phones the table starts collapsed.
  const records = demo.locator('details.records');
  if (!(await records.evaluate((d) => (d as HTMLDetailsElement).open))) await records.locator('summary').click();
  const scoreHeader = demo.locator('th', { has: page.locator('[data-sort="score"]') });
  await demo.locator('[data-sort="score"]').click();
  await expect(scoreHeader).toHaveAttribute('aria-sort', 'ascending');
  await demo.locator('[data-sort="score"]').click();
  await expect(scoreHeader).toHaveAttribute('aria-sort', 'descending');
  const scores = await demo.locator('.records tbody tr[data-id]:not([hidden]) td.num').evaluateAll((cells) => cells.map((c) => parseFloat(c.textContent ?? '')));
  expect(scores).toHaveLength(fixture('category_storage').count);
  expect(scores).toEqual([...scores].sort((a, b) => b - a));

  // Reset restores the unfiltered numbers and the default sort.
  await demo.getByRole('button', { name: 'Reset' }).click();
  await expectFixture(page, 'all');
  await expect(demo.getByLabel('Category')).toHaveValue('');
  await expect(demo.getByRole('button', { name: 'All', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(demo.locator('th', { has: page.locator('[data-sort="id"]') })).toHaveAttribute('aria-sort', 'ascending');
  await expect(demo.getByRole('status')).toHaveText('50 of 50 demands shown: 37 open, 5 awaiting decision, 4 overdue.');
}

test.describe('InfraFlow demo', () => {
  test('presets, category, sorting and Reset match the unit-test fixtures', async ({ page }) => {
    await runScenario(page);
  });

  test('an empty selection shows n/a and the empty-state row', async ({ page }) => {
    const demo = await openDemo(page);
    await demo.locator('details.status-more summary').click();
    for (const box of await demo.locator('input[name="status"]').all()) if ((await box.getAttribute('value')) !== 'ROUTED_OUT') await box.uncheck();
    await demo.getByLabel('Category').selectOption('storage');
    await expectFixture(page, 'empty');
    await expect(demo.getByRole('status')).toHaveText('No demands match this filter (0 of 50).');
  });
});

test.describe('InfraFlow demo on a 390×844 phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('same scenario; secondary KPIs and the table start collapsed; no horizontal overflow', async ({ page }) => {
    const demo = await openDemo(page);
    await expect(demo.locator('details.more-kpis')).not.toHaveAttribute('open', '');
    await expect(demo.locator('details.records')).not.toHaveAttribute('open', '');
    await expect(demo.locator('details.records summary')).toContainText('50 of 50');
    await runScenario(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  });
});
