import { expect, test, type Page } from '@playwright/test';

const ROUTE = '/projects/tacto-negotiation-arena/';

async function open(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(ROUTE);
  const demo = page.locator('tacto-demo');
  await demo.scrollIntoViewIfNeeded();
  // Controls are rendered disabled and enabled by the custom element.
  await expect(demo.getByRole('button', { name: 'Next →' })).toBeEnabled();
  return { demo, errors };
}

const say = (demo: ReturnType<Page['locator']>) => demo.locator('[data-out="say"]');
const outcome = (demo: ReturnType<Page['locator']>) => demo.locator('[data-out="outcome"]');

test.describe('Tacto demo', () => {
  test('replay steps to the accept with Next', async ({ page }) => {
    const { demo, errors } = await open(page);
    await expect(demo.locator('.tq-step:visible')).toHaveCount(1);
    const play = demo.getByRole('button', { name: 'Play replay' });
    if (await play.isVisible()) {
      await play.click();
      await expect(play).toHaveAttribute('aria-pressed', 'true');
      await play.click();
      await expect(play).toHaveAttribute('aria-pressed', 'false');
      await demo.getByRole('button', { name: 'Reset replay' }).click();
    }
    await expect(demo.locator('.tq-step:visible')).toContainText('Supplier status: open');
    const next = demo.getByRole('button', { name: 'Next →' });
    await next.click();
    await expect(say(demo)).toHaveText('Step 2 of 12, round 1: buyer agent sends a counter-offer at 13.98.');
    await expect(demo.locator('.tq-step:visible')).toContainText('Decision: counter-offer');
    await expect(demo.locator('.tq-step:visible .verdict[data-state="pass"]').first()).toContainText('valid');
    for (let i = 0; i < 10; i++) await next.click();
    await expect(say(demo)).toHaveText('Step 12 of 12, round 5: buyer agent accepts the standing sheet at 15.72. Deal.');
    await expect(demo.locator('.tq-step:visible')).toContainText('Decision: accept');
    await expect(demo.locator('[data-out="round"]')).toHaveText('5');
    await expect(demo.locator('[data-out="gap"]')).toHaveText('0.10');
    await expect(next).toBeDisabled();
    // the replay never shows an invalid check: the sample case has no must-haves
    await expect(demo.locator('section').first().locator('.verdict[data-state="fail"]')).toHaveCount(0);
    await demo.getByRole('button', { name: 'Reset replay' }).click();
    await expect(demo.locator('[data-out="stepno"]')).toHaveText('1');
    expect(errors).toEqual([]);
  });

  test('replay follows the range slider by keyboard', async ({ page }) => {
    const { demo } = await open(page);
    const range = demo.getByLabel(/^Step/);
    await range.focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await expect(say(demo)).toHaveText('Step 3 of 12, round 1: supplier quotes 17.12, status open.');
    await page.keyboard.press('End');
    await expect(say(demo)).toContainText('accepts the standing sheet at 15.72');
    await expect(demo.locator('.tq-step:visible')).toContainText('Decision: accept');
    await page.keyboard.press('Home');
    await expect(demo.locator('[data-out="round"]')).toHaveText('0');
  });

  test('sandbox opens on a violated must-have, corrects it, and resets', async ({ page }) => {
    const { demo } = await open(page);
    const checks = demo.locator('[data-out="checks"]');
    // default state: all three must-haves fail and the guard rewrites the sheet
    await expect(checks.locator('.verdict[data-state="fail"]')).toHaveCount(3);
    await expect(outcome(demo)).toContainText('guard intervened');
    await expect(outcome(demo)).toContainText('Send counter-offer');
    await expect(outcome(demo)).toContainText('guard: fixed sheet (must-have): lead_time_days 46 -> 35, payment_days 30 -> 45, defect_ppm 2000 -> 1000');
    await expect(outcome(demo)).toContainText('must-haves hold');

    // make every term pass: nothing left to fix
    await demo.getByLabel('Lead time, days').fill('28');
    await demo.getByLabel('Payment term, days').selectOption('60');
    await demo.getByLabel('Defect rate, ppm').selectOption('500');
    await expect(checks.locator('.verdict[data-state="pass"]')).toHaveCount(3);
    await expect(checks.locator('.verdict[data-state="fail"]')).toHaveCount(0);
    await expect(outcome(demo)).toContainText('no intervention');
    await expect(outcome(demo)).toContainText('Guard log: no line emitted');

    // TryIt step 2: a walk-away becomes a counter at the supplier's price with the must-haves corrected
    await demo.getByLabel('Decision', { exact: true }).selectOption({ label: 'Walk away' });
    await expect(outcome(demo)).toContainText('guard: counter at their price on sup:SYN (delegate wanted to walk)');
    await expect(outcome(demo).locator('.tq-sheet')).toContainText('24.80 EUR');
    await expect(outcome(demo).locator('.tq-sheet')).toContainText('35 days');
    await expect(outcome(demo).locator('.tq-sheet')).toContainText('1000 ppm');
    await expect(demo.getByLabel('Unit price, EUR')).toBeDisabled();

    // TryIt step 3: back to a counter-offer, one must-have fails and is fixed
    await demo.getByLabel('Decision', { exact: true }).selectOption({ label: 'Counter-offer (draft sheet)' });
    await demo.getByLabel('Defect rate, ppm').selectOption('2000');
    await expect(checks.locator('.verdict[data-state="fail"]')).toHaveCount(1);
    await expect(outcome(demo)).toContainText('guard: fixed sheet (must-have): defect_ppm 2000 -> 1000');

    // an out-of-range number is reported, not silently clamped
    const lead = demo.getByLabel('Lead time, days');
    await lead.fill('99');
    await expect(lead).toHaveAttribute('aria-invalid', 'true');
    await expect(demo.locator('[data-out="guarderr"]')).toContainText('Lead time must be a whole number between 14 and 60 days.');
    await lead.fill('30');
    await expect(lead).not.toHaveAttribute('aria-invalid', 'true');
    await expect(demo.locator('[data-out="guarderr"]')).toBeEmpty();

    await demo.getByRole('button', { name: 'Reset sandbox' }).click();
    await expect(demo.getByLabel('Lead time, days')).toHaveValue('46');
    await expect(checks.locator('.verdict[data-state="fail"]')).toHaveCount(3);
  });

  test('the TryIt steps name controls that exist', async ({ page }) => {
    const { demo } = await open(page);
    const steps = page.locator('.tryit li');
    await expect(steps).toHaveCount(3);
    for (const name of ['Next →', 'Reset sandbox']) await expect(demo.getByRole('button', { name })).toBeVisible();
    for (const label of ['Lead time, days', 'Defect rate, ppm']) await expect(demo.getByLabel(label)).toBeVisible();
    await expect(demo.getByLabel('Decision', { exact: true }).locator('option')).toContainText(['Counter-offer (draft sheet)', 'Walk away']);
    await expect(steps.nth(0)).toContainText('Next →');
    await expect(steps.nth(1)).toContainText('Walk away');
    await expect(steps.nth(2)).toContainText('Reset sandbox');
  });

  test.describe('on a 390 × 844 phone', () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test('works by touch-sized controls without horizontal overflow', async ({ page }) => {
      const { demo } = await open(page);
      const next = demo.getByRole('button', { name: 'Next →' });
      for (let i = 0; i < 11; i++) await next.click();
      await expect(say(demo)).toContainText('Deal.');
      await demo.getByLabel('Decision', { exact: true }).selectOption({ label: 'Walk away' });
      await expect(outcome(demo)).toContainText('guard intervened');
      await demo.getByRole('button', { name: 'Reset sandbox' }).click();
      await expect(outcome(demo)).toContainText('guard: fixed sheet (must-have)');
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(0);
      const small = await demo.locator('button:visible, select:visible, input[type="number"]:visible').evaluateAll((els) => els.filter((e) => e.getBoundingClientRect().height < 43.5).length);
      expect(small).toBe(0);
    });
  });
});
