import { expect, test, type Locator, type Page } from '@playwright/test';

/**
 * LongiSafe monitor replay: real interaction with the demo on the built page.
 * Expected values are the ones the unit tests derive from the Python reference
 * (tests/unit/longisafe.test.ts, tests/unit/longisafe-chart.test.ts).
 */
const URL = '/projects/longisafe-lab/';

const demo = (page: Page) => page.locator('longisafe-demo');
const strip = (page: Page) => demo(page).locator('[data-strip] li');
const readout = (page: Page, label: string) => demo(page).locator('[data-readout] div', { hasText: label });
const slider = (page: Page, name: string) => demo(page).locator(`input[type=range][name=${name}]`);

async function open(page: Page) {
  await page.goto(URL);
  // The custom element enables the server-rendered (disabled) controls when it upgrades.
  await expect(demo(page).locator('button[type=reset]')).toBeEnabled();
}
async function choose(page: Page, id: string) {
  await demo(page).locator('.seg label', { hasText: id }).click();
  await expect(demo(page).locator(`input[name=scenario][value=${id}]`)).toBeChecked();
}
/** Move a range input with the keyboard, one step per key press. */
async function press(input: Locator, key: 'ArrowRight' | 'ArrowLeft', times: number) {
  await input.focus();
  for (let i = 0; i < times; i++) await input.press(key);
}

test('server-rendered default state: S09 with the default thresholds', async ({ page }) => {
  await open(page);
  await expect(demo(page).locator('.badge')).toContainText(/synthetic data/i);
  await expect(strip(page)).toHaveCount(3);
  await expect(strip(page).nth(0)).toContainText(/MON-003.*FAIL.*3\.40 s.*\+0\.40 s/s);
  await expect(strip(page).nth(1)).toContainText(/MON-004.*PASS/s);
  await expect(strip(page).nth(2)).toContainText(/MON-005.*FAIL.*3\.30 s.*\+0\.30 s/s);
  await expect(readout(page, 'Stop distance')).toContainText('withheld');
  await expect(demo(page).locator('[data-plot] svg')).toBeVisible();
});

test('guided steps: frozen speed signal, evidence time by keyboard, reset', async ({ page }) => {
  await open(page);

  // Step 1 — S10: MON-003 and MON-004 fail 0.35 s and 0.50 s after the fault begins; KPIs withheld.
  await choose(page, 'S10');
  await expect(strip(page).nth(0)).toContainText(/FAIL.*3\.35 s.*\+0\.35 s/s);
  await expect(strip(page).nth(1)).toContainText(/FAIL.*3\.50 s.*\+0\.50 s/s);
  await expect(strip(page).nth(2)).toContainText('PASS');
  await expect(readout(page, 'Stop distance')).toContainText('withheld');

  // Step 2 — evidence time 0.30 → 1.00 s (7 steps of 0.1): both detections move 0.70 s later.
  const evidence = slider(page, 'evidence_s');
  await press(evidence, 'ArrowRight', 7);
  await expect(evidence).toHaveValue('1');
  await expect(demo(page).locator('[data-out=evidence_s]')).toHaveText('1.00 s');
  await expect(strip(page).nth(0)).toContainText(/FAIL.*4\.05 s.*\+1\.05 s/s);
  await expect(strip(page).nth(1)).toContainText(/FAIL.*4\.20 s.*\+1\.20 s/s);

  // 2.10 s: MON-004 has cleared (its run lasts 1.80 s), MON-003 still fails (2.15 s run).
  await press(evidence, 'ArrowRight', 11);
  await expect(evidence).toHaveValue('2.1');
  await expect(strip(page).nth(0)).toContainText('FAIL');
  await expect(strip(page).nth(1)).toContainText('PASS');

  // 2.20 s and beyond: everything passes and KPIs are reported from the corrupted signal.
  await press(evidence, 'ArrowRight', 1);
  await expect(evidence).toHaveValue('2.2');
  for (let i = 0; i < 3; i++) await expect(strip(page).nth(i)).toContainText('PASS');

  // Step 3 — 2.50 s.
  await press(evidence, 'ArrowRight', 3);
  await expect(evidence).toHaveValue('2.5');
  for (let i = 0; i < 3; i++) await expect(strip(page).nth(i)).toContainText('PASS');
  await expect(readout(page, 'Stop distance')).toContainText('108.21 m');
  await expect(readout(page, 'Stop distance')).toContainText('undetected injected fault');
  await expect(demo(page).locator('[data-status]')).toContainText('evidence_s 2.5');

  // Reset restores the default scenario and thresholds.
  await demo(page).locator('button[type=reset]').click();
  await expect(demo(page).locator('input[name=scenario][value=S09]')).toBeChecked();
  await expect(evidence).toHaveValue('0.3');
  await expect(strip(page).nth(0)).toContainText(/FAIL.*3\.40 s/s);
  await expect(strip(page).nth(2)).toContainText(/FAIL.*3\.30 s/s);
  await expect(readout(page, 'Stop distance')).toContainText('withheld');
});

test('threshold sliders change the verdict they belong to', async ({ page }) => {
  await open(page);

  // S09: the injected bias is 1.5 m/s², so MON-003 fails at a limit of 1.4 and passes at 1.6.
  const coherence = slider(page, 'coherence_mps2');
  await press(coherence, 'ArrowRight', 7);
  await expect(coherence).toHaveValue('1.4');
  await expect(strip(page).nth(0)).toContainText('FAIL');
  await press(coherence, 'ArrowRight', 2);
  await expect(coherence).toHaveValue('1.6');
  await expect(strip(page).nth(0)).toContainText('PASS');
  await expect(strip(page).nth(2)).toContainText(/FAIL.*3\.30 s/s);
  await expect(demo(page).locator('[data-verdicts] tr', { hasText: 'MON-003' }).locator('.verdict')).toHaveText(/PASS/);

  // S14: the shortfall persists; MON-005 fails at the default limit and reports the stop metrics.
  await choose(page, 'S14');
  await expect(strip(page).nth(2)).toContainText(/FAIL.*3\.30 s.*\+0\.30 s/s);
  await expect(readout(page, 'Stop distance')).toContainText('318.59 m');
  await expect(demo(page).locator('[data-verdicts] tr', { hasText: 'MON-005' })).toContainText('3.00–33.30 s');

  // Keyboard on the scenario radio group works too.
  await demo(page).locator('input[name=scenario]:checked').focus();
  await page.keyboard.press('ArrowLeft');
  await expect(demo(page).locator('input[name=scenario][value=S10]')).toBeChecked();
  await expect(strip(page).nth(1)).toContainText(/FAIL.*3\.50 s/s);
});
