// Screenshot helper for visual review: node scripts/shots.mjs <outDir> <theme> <width,...> <path,...> [--full]
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const [outDir = 'docs/design/shots', theme = 'dark', widths = '1440', paths = '/', ...flags] = process.argv.slice(2);
const base = process.env.BASE_URL ?? 'http://localhost:4321';
const full = flags.includes('--full');
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
for (const w of widths.split(',').map(Number)) {
  const context = await browser.newContext({
    viewport: { width: w, height: w < 600 ? 844 : w < 1100 ? 1024 : 900 },
    deviceScaleFactor: w < 600 ? 2 : 1,
    hasTouch: w < 1100,
    reducedMotion: 'reduce',
  });
  await context.addInitScript((t) => localStorage.setItem('ay-theme', t), theme);
  const page = await context.newPage();
  for (const p of paths.split(',')) {
    await page.goto(base + p, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    const name = `${p === '/' ? 'home' : p.replace(/^\/|\/$/g, '').replace(/\//g, '-')}-${w}-${theme}${full ? '-full' : ''}.png`;
    await page.screenshot({ path: `${outDir}/${name}`, fullPage: full });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    console.log(name, overflow > 0 ? `OVERFLOW +${overflow}px` : 'ok');
  }
  await context.close();
}
await browser.close();
