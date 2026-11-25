import { expect, test, type Page } from '@playwright/test';

const CANONICAL = ['LongiSafe Lab', 'Demographics Service', 'InfraFlow Mission Control', 'BMW Motorrad Ride Planner', 'Tacto Negotiation Arena', 'This portfolio'];
const NARROW = ['LongiSafe Lab', 'BMW Motorrad Ride Planner', 'Tacto Negotiation Arena', 'Demographics Service', 'InfraFlow Mission Control', 'This portfolio'];
const SOFTWARE = ['Demographics Service', 'Tacto Negotiation Arena', 'BMW Motorrad Ride Planner', 'This portfolio', 'InfraFlow Mission Control'];
const DATA = ['LongiSafe Lab', 'InfraFlow Mission Control', 'Demographics Service', 'Tacto Negotiation Arena'];
const ENGINEERING = ['LongiSafe Lab', 'BMW Motorrad Ride Planner'];
const TEAM = ['BMW Motorrad Ride Planner', 'Tacto Negotiation Arena'];
const SOLO = ['LongiSafe Lab', 'Demographics Service', 'InfraFlow Mission Control', 'This portfolio'];

const WIDTHS = [320, 390, 430, 768, 1024, 1440, 1920];
const homeNarrow = (w: number) => w < 768; // .work-grid is one column below 48em
const workNarrow = (w: number) => w < 704; // .plist is one column below 44em

/** Visible cards in DOM order: title, shown number and vertical/horizontal position. */
async function cards(page: Page, scope: string) {
  return page.locator(`${scope} .card:visible`).evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect();
      return { title: el.querySelector('.title')!.textContent!.trim(), idx: el.querySelector('.idx')!.textContent!.trim(), top: Math.round(r.top), left: Math.round(r.left) };
    }),
  );
}
/** DOM order must be visual order: sorted by row, then column, nothing changes. */
function expectVisualOrder(list: { title: string; top: number; left: number }[]) {
  const visual = [...list].sort((a, b) => a.top - b.top || a.left - b.left).map((c) => c.title);
  expect(visual).toEqual(list.map((c) => c.title));
}
const numbers = (n: number) => Array.from({ length: n }, (_, i) => String(i + 1).padStart(2, '0'));

for (const width of WIDTHS) {
  test(`home project order at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    const list = await cards(page, '#work');
    const expected = (homeNarrow(width) ? NARROW : CANONICAL).filter((t) => t !== 'This portfolio');
    expect(list.map((c) => c.title)).toEqual(expected);
    expect(list.map((c) => c.idx)).toEqual(numbers(5));
    expectVisualOrder(list);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test(`work page order per filter at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/projects/');
    const all = workNarrow(width) ? NARROW : CANONICAL;
    const number = (t: string) => String(all.indexOf(t) + 1).padStart(2, '0');
    const check = async (expected: string[]) => {
      const list = await cards(page, '.plist');
      expect(list.map((c) => c.title)).toEqual(expected);
      expect(list.map((c) => c.idx)).toEqual(expected.map(number));
      expectVisualOrder(list);
    };
    await check(all);
    const press = (name: string) => page.locator('.filter-bar').getByRole('button', { name, exact: true }).click();
    await press('Software');
    await check(SOFTWARE);
    await press('Data & automation');
    await check(DATA);
    await press('Engineering software');
    await check(ENGINEERING);
    await press('Team');
    await check(TEAM);
    await press('Individual');
    await check(SOLO);
    await press('All');
    await check(all);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}

test('order follows the layout when the window is resized', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  const titles = async (scope: string) => (await cards(page, scope)).map((c) => c.title);
  expect(await titles('#work')).toEqual(CANONICAL.slice(0, 5));
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => titles('#work')).toEqual(NARROW.slice(0, 5));
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect.poll(() => titles('#work')).toEqual(CANONICAL.slice(0, 5));

  await page.goto('/projects/');
  await page.locator('.filter-bar').getByRole('button', { name: 'Software', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await titles('.plist')).toEqual(SOFTWARE);
  await page.locator('.filter-bar').getByRole('button', { name: 'All', exact: true }).click();
  expect(await titles('.plist')).toEqual(NARROW);
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect.poll(() => titles('.plist')).toEqual(CANONICAL);
});

test('a shared filter link opens in the right order, and each project appears once', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/projects/?filter=data');
  expect((await cards(page, '.plist')).map((c) => c.title)).toEqual(DATA);
  expect(await page.locator('.plist .card').count()).toBe(6);
  await page.goto('/');
  expect(await page.locator('#work .card').count()).toBe(5);
});

test('keyboard order on a phone matches the visible order', async ({ page, browserName }) => {
  test.skip(browserName === 'webkit', 'Safari tab order depends on an OS setting');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/projects/');
  await page.locator('.filter-bar').getByRole('button', { name: 'Individual', exact: true }).focus();
  const seen: string[] = [];
  for (let i = 0; i < 6; i += 1) {
    await page.keyboard.press('Tab');
    seen.push(await page.evaluate(() => document.activeElement?.textContent?.trim() ?? ''));
  }
  expect(seen).toEqual(NARROW);
});

test('the list is already in its final order when the page first paints', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  // Record the order at DOMContentLoaded-independent time: the inline script runs during parsing.
  await page.addInitScript(() => {
    document.addEventListener('readystatechange', () => {
      if (document.readyState !== 'interactive') return;
      (window as unknown as { __order: string[] }).__order = [...document.querySelectorAll('.plist .title, #work .title')].map((e) => e.textContent!.trim());
    });
  });
  await page.goto('/projects/');
  expect(await page.evaluate(() => (window as unknown as { __order: string[] }).__order)).toEqual(NARROW);
  await page.goto('/');
  expect(await page.evaluate(() => (window as unknown as { __order: string[] }).__order)).toEqual(NARROW.slice(0, 5));
});
