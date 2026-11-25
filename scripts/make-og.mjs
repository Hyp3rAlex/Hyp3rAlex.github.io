// Generates public/og.png (1200×630) and public/apple-touch-icon.png (180×180) from an HTML template.
// Run manually after changing identity or positioning: node scripts/make-og.mjs
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';

const font = (p) => `data:font/woff2;base64,${readFileSync(new URL(`../node_modules/${p}`, import.meta.url)).toString('base64')}`;
const display = font('@fontsource-variable/space-grotesk/files/space-grotesk-latin-wght-normal.woff2');
const mono = font('@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff2');
const mark = (w, sw = 3.6) => `<svg width="${w}" viewBox="0 0 44 32" fill="none" stroke="#f4f4f5" stroke-width="${sw}" stroke-linecap="square" stroke-miterlimit="8"><path d="M3 29 15 3 27 29"/><path d="M11.5 21h7"/><path d="M27.5 3 34 17l6.5-14"/><path d="M34 17v12"/></svg>`;

const og = `<!doctype html><meta charset="utf-8"><style>
@font-face{font-family:D;src:url(${display});font-weight:300 700}
@font-face{font-family:M;src:url(${mono})}
*{margin:0;box-sizing:border-box}
body{width:1200px;height:630px;background:#08090b;color:#f4f4f5;font-family:D;padding:64px 72px;display:flex;flex-direction:column;justify-content:space-between;
background-image:linear-gradient(rgba(255,255,255,.045) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.045) 1px,transparent 1px);background-size:64px 64px;background-position:-1px -1px}
.top,.bot{display:flex;justify-content:space-between;align-items:center;font-family:M;font-size:19px;letter-spacing:.08em;text-transform:uppercase;color:#93979f}
h1{font-size:150px;font-weight:600;line-height:.86;letter-spacing:-.055em;margin-left:-8px}
h1 span{display:block;color:#b5b8be}
p{font-size:40px;font-weight:500;letter-spacing:-.025em;margin-top:28px}
</style><div class="top">${mark(84)}<span>Portfolio · Munich, DE</span></div>
<div><h1>Alexander<span>Yordanov</span></h1><p>Building software for complex systems.</p></div>
<div class="bot"><span>Information Systems + Mechanical Engineering · TUM</span><span>hyp3ralex.github.io</span></div>`;

const icon = `<!doctype html><style>*{margin:0}body{width:180px;height:180px;background:#08090b;display:grid;place-items:center}</style>${mark(132, 4)}`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.setContent(og);
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: 'public/og.png' });
await page.setViewportSize({ width: 180, height: 180 });
await page.setContent(icon);
await page.screenshot({ path: 'public/apple-touch-icon.png' });
await browser.close();
console.log('wrote public/og.png and public/apple-touch-icon.png');
