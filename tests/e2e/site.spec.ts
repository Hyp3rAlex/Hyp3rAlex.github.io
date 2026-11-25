import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const PROJECTS = [
  'longisafe-lab',
  'demographics-service',
  'infraflow-mission-control',
  'bmw-ride-planner',
  'tacto-negotiation-arena',
];
const TEAM_PROJECTS = ['bmw-ride-planner', 'tacto-negotiation-arena'];
const ROUTES = ['/', '/projects/', '/projects/portfolio/', '/about/', '/recruiter/', '/resume/', '/contact/', '/legal/', ...PROJECTS.map((p) => `/projects/${p}/`)];

function trackErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  page.on('requestfailed', (r) => errors.push(`requestfailed: ${r.url()}`));
  page.on('response', (r) => {
    if (r.status() >= 400) errors.push(`${r.status()}: ${r.url()}`);
  });
  return errors;
}

for (const route of ROUTES) {
  test(`${route} loads cleanly, has one h1, and does not overflow`, async ({ page }) => {
    const errors = trackErrors(page);
    const res = await page.goto(route);
    expect(res?.status()).toBe(200);
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('main')).toBeVisible();
    expect(await page.title()).toContain('Alexander Yordanov');
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `https://hyp3ralex.github.io${route}`);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, 'horizontal overflow in px').toBeLessThanOrEqual(0);
    expect(errors).toEqual([]);
  });

  test(`${route} has no serious accessibility violations (axe, both themes)`, async ({ page }) => {
    // Two full axe scans of a long case study can exceed the default budget in Firefox and WebKit.
    test.setTimeout(120_000);
    for (const theme of ['dark', 'light']) {
      await page.addInitScript((t) => localStorage.setItem('ay-theme', t), theme);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto(route);
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
      const serious = results.violations
        .filter((v) => v.impact === 'serious' || v.impact === 'critical')
        .map((v) => `${theme}: ${v.id} — ${v.nodes.map((n) => n.target.join(' ')).slice(0, 4).join(' | ')}`);
      expect(serious).toEqual([]);
    }
  });
}

test('overflow matrix: no horizontal scroll from 320 to 2560 px', async ({ page }) => {
  // 10 widths × every route is well over a hundred page loads; WebKit needs more than the default budget.
  test.setTimeout(360_000);
  for (const width of [320, 375, 390, 430, 768, 1024, 1280, 1440, 1920, 2560]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of ROUTES) {
      await page.goto(route);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `${route} at ${width}px`).toBeLessThanOrEqual(0);
    }
  }
});

test('legal page carries the Impressum and privacy information in English and German', async ({ page }) => {
  await page.goto('/legal/');
  const main = page.locator('main');
  await expect(main.getByRole('heading', { name: 'Legal notice', exact: true })).toBeVisible();
  await expect(main.getByRole('heading', { name: 'Impressum', exact: true })).toBeVisible();
  await expect(main.getByRole('heading', { name: 'Datenschutzerklärung' })).toBeVisible();
  await expect(main.locator('address').first()).toContainText('Alexander Yordanov');
  await expect(main.locator('address').first()).toContainText('85748 Garching bei München');
  await expect(main.locator('[lang="de"]#de')).toContainText('Angaben gemäß § 5 DDG');
  // Reachable from every page through the footer.
  await page.goto('/');
  await expect(page.locator('footer').getByRole('link', { name: /Impressum/ })).toHaveAttribute('href', '/legal/');
  // The street address appears on the legal page only.
  for (const route of ['/', '/contact/', '/recruiter/', '/resume/', '/about/']) {
    await page.goto(route);
    await expect(page.locator('body')).not.toContainText('Enzianstraße');
  }
});

test('unknown route serves the 404 page with navigation', async ({ page }) => {
  const res = await page.goto('/definitely-not-here/');
  expect(res?.status()).toBe(404);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Nothing at this address');
  await expect(page.locator('main').getByRole('link', { name: /Work/ })).toBeVisible();
});

test('recruiter brief answers the 30-second questions', async ({ page }) => {
  await page.goto('/recruiter/');
  const main = page.locator('main');
  await expect(main).toContainText('Alexander Yordanov');
  await expect(main).toContainText('B.Sc. Information Systems');
  await expect(main).toContainText('B.Sc. Mechanical Engineering');
  await expect(main).toContainText('Munich');
  await expect(main).toContainText('DIETL Feinmechanik');
  await expect(main).toContainText('English');
  // Owner-confirmed leadership is stated as leadership.
  await expect(main).toContainText('Team Lead — Tacto Negotiation Arena');
  await expect(main).toContainText('Team Lead — BMW Motorrad Ride Planner');
  await expect(main.getByRole('link', { name: 'Email', exact: true })).toHaveAttribute(
    'href',
    'mailto:alexander.yordanov.bg@gmail.com',
  );
});

const CV_FOCUS = ['Software_Engineering', 'Data_Engineering', 'Engineering_Software'] as const;
const cvName = (focus: string, lang: 'en' | 'de') =>
  lang === 'en' ? `Alexander_Yordanov_CV_${focus}_EN.pdf` : `Alexander_Yordanov_Lebenslauf_${focus}_DE.pdf`;
const FOCUS_TAB: Record<string, string> = {
  Software_Engineering: 'Software Engineering',
  Data_Engineering: 'Data Engineering & Automation',
  Engineering_Software: 'Engineering Software & Technology',
};

test.describe('CV downloads', () => {
  let published = false;
  test.beforeAll(async ({ request }) => {
    published = (await request.get('/cv/manifest.json')).status() === 200;
  });

  test('all six PDFs are served as PDF, non-empty, and match the manifest', async ({ request }) => {
    test.skip(!published, 'this build ships no CV files');
    const manifest = (await (await request.get('/cv/manifest.json')).json()) as {
      files: { file: string; bytes: number; pages: number }[];
    };
    expect(manifest.files).toHaveLength(6);
    for (const focus of CV_FOCUS) {
      for (const lang of ['en', 'de'] as const) {
        const name = cvName(focus, lang);
        const res = await request.get(`/cv/${name}`);
        expect(res.status(), name).toBe(200);
        expect(res.headers()['content-type'], name).toContain('application/pdf');
        const body = await res.body();
        expect(body.subarray(0, 5).toString('latin1'), name).toBe('%PDF-');
        expect(body.length, name).toBe(manifest.files.find((f) => f.file === name)!.bytes);
        expect(body.length, name).toBeGreaterThan(10_000);
      }
    }
    // Only PDFs are public: no editable sources, no private copies.
    const stem = 'Alexander_Yordanov_CV_Software_Engineering_EN';
    for (const forbidden of [`${stem}.docx`, `${stem}_${'private'}.pdf`]) {
      expect((await request.get(`/cv/${forbidden}`)).status(), forbidden).toBe(404);
    }
  });

  test('recruiter brief: each specialization offers its own English and German PDF as the primary action', async ({ page }) => {
    test.skip(!published, 'this build ships no CV files');
    await page.goto('/recruiter/');
    for (const focus of CV_FOCUS) {
      await page.getByRole('link', { name: FOCUS_TAB[focus], exact: true }).click();
      const panel = page.locator('[data-focus-panel]:not([hidden])');
      const en = panel.getByRole('link', { name: /Download CV/ });
      const de = panel.getByRole('link', { name: /Lebenslauf herunterladen/ });
      await expect(en).toHaveText(/Download CV · EN/);
      await expect(de).toHaveText(/Lebenslauf herunterladen · DE/);
      await expect(en).toHaveAttribute('href', `/cv/${cvName(focus, 'en')}`);
      await expect(de).toHaveAttribute('href', `/cv/${cvName(focus, 'de')}`);
      await expect(en).toHaveAttribute('download', cvName(focus, 'en'));
      await expect(de).toHaveAttribute('download', cvName(focus, 'de'));
      await expect(panel.locator('.cv .meta')).toHaveText(/^PDF · A4 · \d page/);
      // The email route stays, as a quiet secondary link.
      const mail = panel.getByRole('link', { name: 'Request a tailored CV by email' });
      await expect(mail).toHaveAttribute('href', /^mailto:alexander\.yordanov\.bg@gmail\.com\?subject=CV%20request/);
      await expect(mail).not.toHaveClass(/btn/);
      // Buttons are comfortable touch targets.
      for (const b of [en, de]) expect((await b.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
  });

  test('the downloaded file is the document for the selected specialization and language', async ({ page, browserName }) => {
    test.skip(!published, 'this build ships no CV files');
    test.skip(browserName === 'webkit', 'download events are not reliable in this WebKit build; URLs are verified separately');
    await page.goto('/recruiter/?focus=data');
    const panel = page.locator('[data-focus-panel]:not([hidden])');
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      panel.getByRole('link', { name: /Lebenslauf herunterladen/ }).click(),
    ]);
    expect(download.suggestedFilename()).toBe('Alexander_Yordanov_Lebenslauf_Data_Engineering_DE.pdf');
  });

  test('CV page: all six documents are discoverable without JavaScript-only controls', async ({ page }) => {
    test.skip(!published, 'this build ships no CV files');
    await page.goto('/resume/');
    const panel = page.locator('.cvm');
    await expect(panel.getByRole('heading', { name: 'Download CV' })).toBeVisible();
    const hrefs = await panel.locator('a[href$=".pdf"]').evaluateAll((as) => as.map((a) => a.getAttribute('href')));
    expect(hrefs.sort()).toEqual(CV_FOCUS.flatMap((f) => [`/cv/${cvName(f, 'en')}`, `/cv/${cvName(f, 'de')}`]).sort());
    await expect(panel.getByRole('link', { name: 'Recruiter brief by specialization' })).toHaveAttribute('href', '/recruiter/');
    await expect(panel.getByRole('link', { name: 'Request a tailored CV by email' })).toHaveAttribute('href', /^mailto:/);
    // Keyboard: the first download is reachable and shows a focus indicator.
    const first = panel.locator('a[href$=".pdf"]').first();
    await first.focus();
    expect(await first.evaluate((el) => getComputedStyle(el).outlineStyle)).not.toBe('none');
  });

  test('without the documents the site falls back to an email request', async ({ page }) => {
    test.skip(published, 'this build ships CV files');
    await page.goto('/recruiter/');
    await expect(page.locator('a[href$=".pdf"]')).toHaveCount(0);
    await expect(
      page.locator('[data-focus-panel]:not([hidden])').getByRole('link', { name: 'Request CV by email' }),
    ).toHaveAttribute('href', /^mailto:/);
  });
});

test('recruiter specialization changes summary, skills and project order — not facts', async ({ page }) => {
  await page.goto('/recruiter/?focus=software');
  const panel = page.locator('[data-focus-panel]:not([hidden])');
  await expect(panel.locator('.summary')).toContainText('Spring Boot');
  await expect(panel.locator('.skills')).toContainText('PostgreSQL');
  await page.getByRole('link', { name: 'Engineering Software & Technology' }).click();
  await expect(panel.locator('.summary')).toContainText('longitudinal dynamics');
  await expect(panel.locator('.skills')).toContainText('Excel / VBA');
  await expect(panel).toContainText('DIETL Feinmechanik');
  // The fact strip above the selector is identical for every specialization.
  await expect(page.locator('.facts')).toContainText('Team Lead — Tacto Negotiation Arena');
  // Case study and demo links are direct.
  await expect(panel.getByRole('link', { name: 'Demo' }).first()).toHaveAttribute('href', /\/projects\/[a-z-]+\/#demo$/);
});

test('team lead roles are shown on the home page, catalogue, case studies and résumé', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.hero-facts')).toContainText('Team Lead — Tacto Negotiation Arena');
  await expect(page.locator('.hero-facts')).toContainText('Team Lead — BMW Motorrad Ride Planner');
  for (const [slug, title] of [
    ['tacto-negotiation-arena', 'Tacto Negotiation Arena'],
    ['bmw-ride-planner', 'BMW Motorrad Ride Planner'],
  ]) {
    await page.goto('/projects/');
    await expect(page.locator('.card', { hasText: title })).toContainText('Team Lead');
    await page.goto(`/projects/${slug}/`);
    await expect(page.locator('.head-spec')).toContainText('Team Lead');
    await expect(page.locator('.brief').first()).toContainText('Team Lead');
  }
  await page.goto('/resume/');
  await expect(page.locator('main')).toContainText('Team Lead — Tacto Negotiation Arena');
  await expect(page.locator('main')).toContainText('Team Lead — BMW Motorrad Ride Planner');
});

test('every case study opens with an overview and a guided demo start', async ({ page }) => {
  for (const slug of PROJECTS) {
    await page.goto(`/projects/${slug}/`);
    const brief = page.locator('.brief').first();
    await expect(brief).toBeVisible();
    await expect(brief.getByRole('link', { name: /Try the demo/ })).toHaveAttribute('href', '#demo');
    if (TEAM_PROJECTS.includes(slug)) await expect(brief.getByRole('link', { name: /Source/ })).toHaveCount(0);
    else await expect(brief.getByRole('link', { name: /Source/ })).toHaveAttribute('href', /^https:\/\/github\.com\/Hyp3rAlex\//);
    // The primary button label must be readable (regression: prose link colour overrode the button colour).
    const [fg, bg] = await brief
      .getByRole('link', { name: /Try the demo/ })
      .evaluate((el) => [getComputedStyle(el).color, getComputedStyle(el).backgroundColor]);
    expect(fg).not.toBe(bg);
    await expect(page.locator('.tryit').first()).toBeVisible();
    expect(await page.locator('.tryit li').count()).toBeGreaterThanOrEqual(2);
  }
});

test('architecture diagrams show a vertical drawing on phones and the wide one on desktop', async ({ page }) => {
  for (const slug of PROJECTS) {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/projects/${slug}/`);
    await expect(page.locator('.dg-mobile').first()).toBeVisible();
    await expect(page.locator('.dg-desktop').first()).toBeHidden();
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(page.locator('.dg-desktop').first()).toBeVisible();
    await expect(page.locator('.dg-mobile').first()).toBeHidden();
  }
});

test('contact page: email is visible, wraps on small screens, and the actions work', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto('/contact/');
  const addr = page.locator('.addr');
  await expect(addr).toHaveText('alexander.yordanov.bg@gmail.com');
  await expect(addr).toHaveAttribute('href', 'mailto:alexander.yordanov.bg@gmail.com');
  const box = await addr.boundingBox();
  expect(box!.x + box!.width).toBeLessThanOrEqual(320);
  await expect(page.getByRole('link', { name: 'Write an email' })).toHaveAttribute('href', /^mailto:/);
  await expect(page.locator('main').getByRole('link', { name: /Download CV/ })).toHaveAttribute('href', '/resume/');
  await expect(page.locator('main').getByRole('link', { name: /Recruiter brief/ })).toHaveAttribute('href', '/recruiter/');
  await expect(page.locator('main')).toContainText('Munich / Garching');
});

test('hero drawing responds to inspection with real coordinates', async ({ page, isMobile }) => {
  test.skip(!!isMobile, 'hero drawing is shown in the hero from tablet width up');
  await page.goto('/');
  const sheet = page.locator('.hero-fig drawing-sheet');
  const svg = sheet.locator('svg.drawing');
  const box = (await svg.boundingBox())!;
  // The A apex sits at grid position (15, 3): 26 units above the baseline.
  const W = 500;
  const H = 400;
  await page.mouse.move(box.x + ((52 + 15 * 9) / W) * box.width, box.y + ((74 + 3 * 9) / H) * box.height);
  await expect(sheet.locator('[data-readout]')).toContainText('A2');
  await expect(sheet.locator('[data-readout]')).toContainText('15.0');
  await expect(sheet.locator('[data-readout]')).toContainText('26.0');
  await page.mouse.move(5, 5);
  await expect(sheet.locator('[data-readout]')).toHaveText('Monogram · construction');
});

test('recruiter focus selection reorders projects and is shareable', async ({ page }) => {
  await page.goto('/recruiter/');
  const visibleFirst = () => page.locator('[data-focus-panel]:not([hidden]) .rank h4').first();
  await expect(visibleFirst()).toHaveText('Demographics Service');
  await page.getByRole('link', { name: 'Engineering Software & Technology' }).click();
  await expect(visibleFirst()).toHaveText('LongiSafe Lab');
  await expect(page).toHaveURL(/focus=engineering/);
  await page.reload();
  await expect(visibleFirst()).toHaveText('LongiSafe Lab');
  await page.goto('/recruiter/?focus=data');
  await expect(visibleFirst()).toHaveText('InfraFlow Mission Control');
});

test('project filter narrows the list and reports the count', async ({ page }) => {
  await page.goto('/projects/');
  const cards = page.locator('.plist > li:not([hidden])');
  const total = await cards.count();
  expect(total).toBeGreaterThanOrEqual(5);
  await page.getByRole('button', { name: 'Team', exact: true }).click();
  await expect(cards).toHaveCount(2);
  await expect(page.locator('.filter-status')).toHaveText(`2 of ${total} shown`);
  await page.getByRole('button', { name: 'All', exact: true }).click();
  await expect(cards).toHaveCount(total);
});

test('command palette: keyboard open, search, navigate, escape restores focus', async ({ page, isMobile }) => {
  await page.goto('/');
  const opener = page.locator('[data-cmdk-open]');
  await expect(opener).toBeVisible();
  if (isMobile) await opener.click();
  else {
    await opener.focus();
    await page.keyboard.press('Control+k');
  }
  const input = page.getByRole('combobox');
  await expect(input).toBeFocused();
  await input.fill('zzzz');
  await expect(page.locator('.cmdk-empty')).toBeVisible();
  await input.fill('');
  await page.keyboard.press('Escape');
  await expect(page.locator('dialog.cmdk')).not.toBeVisible();
  if (!isMobile) await expect(opener).toBeFocused();

  await opener.click();
  await input.fill('longisafe');
  await expect(page.getByRole('option').first()).toContainText('LongiSafe Lab');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/projects\/longisafe-lab\/$/);
});

test('command palette arrow keys move the active option', async ({ page }) => {
  await page.goto('/about/');
  await page.locator('[data-cmdk-open]').click();
  const selected = page.locator('.cmdk-item[aria-selected="true"]');
  await expect(selected).toHaveText(/Home/);
  await page.keyboard.press('ArrowDown');
  await expect(selected).toHaveText(/Work/);
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  await expect(selected).toHaveText(/Switch theme/);
});

test('theme choice applies, persists across navigation and reload', async ({ page }) => {
  await page.goto('/');
  const html = page.locator('html');
  await expect(html).toHaveAttribute('data-theme', 'dark');
  await page.locator('footer [data-theme-value="light"]').click();
  await expect(html).toHaveAttribute('data-theme', 'light');
  await expect(page.locator('footer [data-theme-value="light"]')).toHaveAttribute('aria-pressed', 'true');
  await page.goto('/about/');
  await expect(html).toHaveAttribute('data-theme', 'light');
  await page.reload();
  await expect(html).toHaveAttribute('data-theme', 'light');
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(243, 241, 236)');
});

test('system theme follows the OS preference', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ay-theme', 'system'));
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('copy-email gives honest feedback', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'clipboard permissions are only scriptable in Chromium');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/contact/');
  await page.getByRole('button', { name: 'Copy address' }).click();
  await expect(page.locator('[data-copy-status]')).toHaveText('Copied — the address is on your clipboard.');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('alexander.yordanov.bg@gmail.com');
});

test('copy-email reports failure when the clipboard is blocked', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: () => Promise.reject(new Error('denied')) },
      configurable: true,
    });
  });
  await page.goto('/contact/');
  await page.getByRole('button', { name: 'Copy address' }).click();
  await expect(page.locator('[data-copy-status]')).toContainText('Could not access the clipboard');
});

test('mobile menu opens, lists every destination and closes on Escape', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'mobile layout only');
  await page.goto('/');
  const summary = page.locator('details.menu > summary');
  await summary.click();
  const panel = page.locator('.menu-panel');
  // The panel must cover the viewport below the header, and every link must be the element actually hit there.
  const box = await panel.boundingBox();
  const viewport = page.viewportSize()!;
  expect(box!.height).toBeGreaterThan(viewport.height * 0.8);
  for (const link of await panel.locator('li a').all()) {
    const hit = await link.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return !!top && (top === el || el.contains(top));
    });
    expect(hit, await link.innerText()).toBe(true);
  }
  for (const name of ['Home', 'Work', 'About', 'Recruiter', 'Contact', 'CV']) {
    await expect(panel.getByRole('link', { name: new RegExp(name) })).toBeVisible();
  }
  await page.keyboard.press('Escape');
  await expect(panel).not.toBeVisible();
  await summary.click();
  await panel.getByRole('link', { name: /About/ }).click();
  await expect(page).toHaveURL(/\/about\/$/);
});

test('keyboard: skip link is the first stop and moves focus to main', async ({ page, browserName }) => {
  test.skip(browserName === 'webkit', 'Safari tab order depends on an OS setting');
  await page.goto('/');
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: 'Skip to content' });
  await expect(skip).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#main$/);
});

test('back and forward navigation work between pages', async ({ page }) => {
  await page.goto('/');
  await page.locator('header nav.primary, .menu').first().waitFor({ state: 'attached' });
  await page.goto('/projects/');
  await page.locator('.plist a').first().click();
  await expect(page).toHaveURL(/\/projects\/[a-z-]+\/$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/projects\/$/);
  await page.goForward();
  await expect(page).toHaveURL(/\/projects\/[a-z-]+\/$/);
});

test('every case study has source link, table of contents and a working demo region', async ({ page }) => {
  for (const slug of PROJECTS) {
    await page.goto(`/projects/${slug}/`);
    await expect(page.locator('.toc a:visible, .toc summary:visible').first()).toBeVisible();
    // Own repositories are linked; teammate-owned team repositories are deliberately not linked.
    if (TEAM_PROJECTS.includes(slug)) {
      await expect(page.locator('main a[href^="https://github.com/"]')).toHaveCount(0);
    } else {
      await expect(page.getByRole('link', { name: /Source on GitHub/ })).toHaveAttribute('href', /^https:\/\/github\.com\/Hyp3rAlex\//);
    }
    await expect(page.locator('#demo')).toBeAttached();
    await expect(page.locator('.demo').first()).toBeVisible();
    await expect(page.locator('.demo .badge').first()).toBeVisible();
  }
});

test('internal links on every page resolve', async ({ page, request }) => {
  const seen = new Set<string>();
  for (const route of ROUTES) {
    await page.goto(route);
    const hrefs = await page.locator('a[href^="/"]').evaluateAll((as) => as.map((a) => a.getAttribute('href')!));
    for (const h of hrefs) seen.add(h.split('#')[0]);
  }
  for (const href of seen) {
    const res = await request.get(href);
    expect(res.status(), href).toBe(200);
  }
});
