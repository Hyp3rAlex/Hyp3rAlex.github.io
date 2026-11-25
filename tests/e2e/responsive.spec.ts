import { expect, test, type Page } from '@playwright/test';

// Responsive checks beyond the width matrix in site.spec.ts: tablets in both orientations, a phone in landscape,
// a 200 % zoom proxy, how far down the first project card sits on a phone, and touch-target sizes.

const ROUTES = ['/', '/projects/', '/recruiter/', '/contact/', '/projects/longisafe-lab/'];

const VIEWPORTS = [
  { name: 'tablet portrait 768×1024', viewport: { width: 768, height: 1024 }, deviceScaleFactor: 1 },
  { name: 'tablet landscape 1024×768', viewport: { width: 1024, height: 768 }, deviceScaleFactor: 1 },
  { name: 'phone landscape 844×390', viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 },
  // A 1280×900 window zoomed to 200 % lays out as 640×450 CSS px at twice the pixel density (WCAG 1.4.4 / 1.4.10 proxy).
  { name: '200 % zoom proxy 640×450 @2x', viewport: { width: 640, height: 450 }, deviceScaleFactor: 2 },
  // WCAG 1.4.10 reflow: 320 CSS px wide, i.e. 1280 px at 400 %.
  { name: 'reflow 320×640', viewport: { width: 320, height: 640 }, deviceScaleFactor: 1 },
];

/**
 * Upper bound for the document offset of the first project card on the home page at 390×844.
 * Measured 1082 px (1.28 screens) on 2026-11-25 (V1: about 1,866 px); the bound is that value plus about 10 %.
 * Lower it whenever the hero gets shorter.
 */
const FIRST_CARD_MAX_TOP = 1200;

async function ready(page: Page, route: string) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const res = await page.goto(route);
  expect(res?.status(), `${route} status`).toBe(200);
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
}

for (const vp of VIEWPORTS) {
  test.describe(vp.name, () => {
    test.use({ viewport: vp.viewport, deviceScaleFactor: vp.deviceScaleFactor });

    for (const route of ROUTES) {
      test(`${route}: no overflow, usable header, visible heading`, async ({ page }) => {
        await ready(page, route);

        const m = await page.evaluate(() => {
          const vw = window.innerWidth;
          const vh = window.innerHeight;
          const shown = (el: Element | null) => {
            if (!el) return false;
            const r = el.getBoundingClientRect();
            return r.width > 0 && r.height > 0 && el.checkVisibility({ visibilityProperty: true });
          };
          const header = document.querySelector('header.site-header');
          const hr = header?.getBoundingClientRect();
          // Every visible header control must lie inside the viewport horizontally.
          const clipped = [...(header?.querySelectorAll('a, button, summary') ?? [])]
            .filter((el) => shown(el) && !el.closest('.menu-panel'))
            .filter((el) => {
              const r = el.getBoundingClientRect();
              return r.left < -0.5 || r.right > vw + 0.5;
            })
            .map((el) => (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 40));
          const h1 = document.querySelector('h1');
          const h1r = h1?.getBoundingClientRect();
          return {
            vw,
            vh,
            overflow: document.documentElement.scrollWidth - vw,
            headerHeight: hr?.height ?? 0,
            brand: shown(header?.querySelector('a.brand') ?? null),
            primaryNav: shown(header?.querySelector('nav.primary a') ?? null),
            menuButton: shown(header?.querySelector('details.menu > summary') ?? null),
            clipped,
            h1Shown: shown(h1),
            h1Left: h1r?.left ?? -1,
            h1Right: h1r?.right ?? Infinity,
          };
        });

        expect(m.overflow, 'horizontal overflow in px').toBeLessThanOrEqual(0);
        expect(m.brand, 'brand link visible').toBe(true);
        expect(m.primaryNav || m.menuButton, 'primary navigation or menu button visible').toBe(true);
        expect(m.clipped, 'header controls outside the viewport').toEqual([]);
        expect(m.headerHeight, 'header height').toBeGreaterThan(0);
        expect(m.headerHeight, 'header must leave most of the viewport to the page').toBeLessThanOrEqual(m.vh * 0.3);
        expect(m.h1Shown, 'h1 visible').toBe(true);
        expect(m.h1Left, 'h1 starts inside the viewport').toBeGreaterThanOrEqual(0);
        expect(m.h1Right, 'h1 ends inside the viewport').toBeLessThanOrEqual(m.vw + 0.5);

        // Where the menu button replaces the navigation, it must open a panel with reachable links.
        if (!m.primaryNav) {
          await page.locator('details.menu > summary').click();
          const panel = page.locator('.menu-panel');
          await expect(panel).toBeVisible();
          await expect(panel.getByRole('link', { name: /Contact/ })).toBeVisible();
          const overflowOpen = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
          expect(overflowOpen, 'horizontal overflow with the menu open').toBeLessThanOrEqual(0);
        }
      });
    }
  });
}

test.describe('phone portrait 390×844', () => {
  test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });

  test('home: the first project card is reached early', async ({ page }) => {
    await ready(page, '/');
    const card = page.locator('#work .card').first();
    await expect(card).toBeAttached();
    const top = await card.evaluate((el) => Math.round(el.getBoundingClientRect().top + window.scrollY));
    test.info().annotations.push({
      type: 'first-card-top',
      description: `${top} px from the top of the document = ${(top / 844).toFixed(2)} screens at 390×844 (bound ${FIRST_CARD_MAX_TOP} px)`,
    });
    expect(top, 'document offset of the first project card in px').toBeLessThanOrEqual(FIRST_CARD_MAX_TOP);
  });

  for (const route of ['/', '/recruiter/', '/contact/']) {
    test(`${route}: touch targets are at least 24×24 CSS px`, async ({ page }) => {
      await ready(page, route);
      const targets = await page.evaluate(() => {
        const out: { label: string; where: string; w: number; h: number }[] = [];
        const isBlock = (el: Element) => !/^inline/.test(getComputedStyle(el).display) && getComputedStyle(el).display !== 'contents';
        for (const el of document.querySelectorAll<HTMLElement>('header :is(a, button, summary), main :is(a, button, summary), footer :is(a, button, summary)')) {
          if (!el.checkVisibility({ visibilityProperty: true })) continue;
          const r = el.getBoundingClientRect();
          // Skip targets that are not rendered or parked off-screen until focused (skip link).
          if (r.width <= 1 || r.height <= 1) continue;
          if (r.bottom + window.scrollY <= 0 || r.right + window.scrollX <= 0) continue;
          // WCAG 2.5.8 "inline" exception: a link inside a sentence or block of running text.
          if (el.tagName === 'A') {
            let block: Element | null = el.parentElement;
            while (block && !isBlock(block)) block = block.parentElement;
            if (block) {
              let other = '';
              const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
              for (let n = walker.nextNode(); n; n = walker.nextNode()) {
                if (!n.parentElement?.closest('a, button, summary')) other += n.textContent ?? '';
              }
              if (/[\p{L}\p{N}]{2,}/u.test(other)) continue;
            }
          }
          const region = el.closest('header') ? 'header' : el.closest('footer') ? 'footer' : 'main';
          const cls = typeof el.className === 'string' && el.className ? `.${el.className.trim().split(/\s+/).join('.')}` : '';
          out.push({
            label: (el.getAttribute('aria-label') ?? el.innerText ?? '').replace(/\s+/g, ' ').trim().slice(0, 48),
            where: `${region} ${el.tagName.toLowerCase()}${cls}`,
            w: Math.round(r.width * 10) / 10,
            h: Math.round(r.height * 10) / 10,
          });
        }
        return out;
      });

      expect(targets.length, 'targets audited').toBeGreaterThan(5);
      const fmt = (t: (typeof targets)[number]) => `${t.label || '(no text)'} [${t.where}] ${t.w}×${t.h}`;
      const below44 = targets.filter((t) => t.w < 44 || t.h < 44);
      test.info().annotations.push({
        type: 'targets-below-44px',
        description: below44.length ? `${below44.length} of ${targets.length}: ${below44.map(fmt).join(' · ')}` : `none of ${targets.length}`,
      });
      const below24 = targets.filter((t) => t.w < 24 || t.h < 24).map(fmt);
      expect(below24, 'targets smaller than 24×24 CSS px (WCAG 2.2 SC 2.5.8)').toEqual([]);
    });
  }
});
