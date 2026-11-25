#!/usr/bin/env node
// Lighthouse (mobile emulation, default throttling) for every route of a production build.
//
//   node scripts/lighthouse.mjs --dist <dist> [--port 4340] [--runs 3] [--out <dir>] [--scratch <dir>]
//   node scripts/lighthouse.mjs --base http://localhost:4340 --dist <dist>      (server already running)
//   node scripts/lighthouse.mjs --base <url> --routes /,/projects/
//
// Writes lighthouse.json and lighthouse.md (medians per route) to --out
// (default: ../lighthouse-reports next to the repository, i.e. outside the tree).
//
// Chrome is Playwright's Chromium unless CHROME_PATH is set. This script starts Chrome itself (headless, fresh
// profile per run inside --scratch, default: a new directory under the system temp dir) and hands Lighthouse the
// debugging port. Lighthouse's own launcher is deliberately not used: under WSL it creates its profile folder in the
// Windows user's profile directory, or as a stray folder in the working directory.
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const args = process.argv.slice(2);
const opt = (name, fallback = null) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : fallback;
};

const dist = opt('dist') ? resolve(opt('dist')) : null;
const port = Number(opt('port', '4340'));
const runs = Math.max(1, Number(opt('runs', '3')));
const outDir = resolve(opt('out', join(repoRoot, '..', 'lighthouse-reports')));
const lighthouseVersion = opt('lighthouse', '13');
let base = opt('base');

if (!dist && !(base && opt('routes'))) {
  console.error('usage: node scripts/lighthouse.mjs --dist <dist> [--base <url>] [--routes /,/a/] [--runs 3] [--out <dir>] [--scratch <dir>]');
  process.exit(2);
}

async function htmlRoutes(dir) {
  const out = [];
  async function walk(d) {
    for (const e of await readdir(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) await walk(p);
      else if (e.name === 'index.html') out.push('/' + relative(dir, d).split(sep).join('/') + (d === dir ? '' : '/'));
    }
  }
  await walk(dir);
  return out;
}

// Reading order: home, project index, case studies, then the remaining pages.
const rank = (r) => (r === '/' ? 0 : r === '/projects/' ? 1 : r.startsWith('/projects/') ? 2 : 3);
const routes = (opt('routes') ? opt('routes').split(',').map((s) => s.trim()).filter(Boolean) : await htmlRoutes(dist)).sort(
  (a, b) => rank(a) - rank(b) || a.localeCompare(b),
);

const scratch = opt('scratch') ? resolve(opt('scratch')) : await mkdtemp(join(tmpdir(), 'portfolio-lighthouse-'));
await mkdir(scratch, { recursive: true });
await mkdir(outDir, { recursive: true });

let chromePath = process.env.CHROME_PATH;
if (!chromePath) {
  const require = createRequire(import.meta.url);
  chromePath = require('@playwright/test').chromium.executablePath();
}

let server = null;
if (!base) {
  server = spawn(process.execPath, [join(repoRoot, 'scripts', 'serve-dist.mjs'), dist, String(port)], { stdio: 'ignore' });
  base = `http://localhost:${port}`;
  for (let i = 0; i < 50; i += 1) {
    if (await fetch(base + '/').then((r) => r.ok, () => false)) break;
    await new Promise((r) => setTimeout(r, 100));
  }
}
const stopServer = () => server?.kill();
process.on('exit', stopServer);
process.on('SIGINT', () => process.exit(130));

async function freePort() {
  const { createServer } = await import('node:net');
  return new Promise((done, reject) => {
    const srv = createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port: p } = srv.address();
      srv.close(() => done(p));
    });
  });
}

/** Start headless Chrome with a fresh profile in the scratch directory; resolves once the debugging port answers. */
async function startChrome() {
  const profile = await mkdtemp(join(scratch, 'chrome-profile-'));
  const debugPort = await freePort();
  const child = spawn(
    chromePath,
    [
      '--headless=new', '--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-extensions',
      '--disable-background-networking', '--disable-component-update', '--disable-sync', '--mute-audio',
      `--user-data-dir=${profile}`, `--remote-debugging-port=${debugPort}`, 'about:blank',
    ],
    { cwd: scratch, stdio: 'ignore' },
  );
  const stop = async () => {
    if (child.exitCode === null) {
      child.kill();
      await new Promise((r) => child.once('exit', r));
    }
    await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  };
  for (let i = 0; i < 100; i += 1) {
    if (await fetch(`http://127.0.0.1:${debugPort}/json/version`).then((r) => r.ok, () => false)) return { debugPort, stop };
    if (child.exitCode !== null) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  await stop();
  throw new Error('Chrome did not open its debugging port');
}

async function runLighthouse(url, outFile) {
  const chrome = await startChrome();
  const cli = [
    '--yes',
    `lighthouse@${lighthouseVersion}`,
    url,
    '--quiet',
    '--output=json',
    `--output-path=${outFile}`,
    '--only-categories=performance,accessibility,best-practices,seo',
    `--port=${chrome.debugPort}`,
  ];
  try {
    await new Promise((done, reject) => {
      const child = spawn('npx', cli, { cwd: scratch, stdio: ['ignore', 'ignore', 'pipe'] });
      let err = '';
      child.stderr.on('data', (d) => (err += d));
      child.on('error', reject);
      child.on('close', (code) => (code === 0 ? done() : reject(new Error(`lighthouse exited ${code}: ${err.slice(-400)}`))));
    });
  } finally {
    await chrome.stop();
  }
}

const median = (xs) => {
  const s = xs.filter((x) => typeof x === 'number' && !Number.isNaN(x)).sort((a, b) => a - b);
  if (!s.length) return null;
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

const results = [];
let version = null;
for (const route of routes) {
  const samples = [];
  for (let i = 1; i <= runs; i += 1) {
    const file = join(scratch, `lh-${results.length}-${i}.json`);
    try {
      await runLighthouse(base + route, file);
      const lhr = JSON.parse(await readFile(file, 'utf8'));
      version = lhr.lighthouseVersion;
      const score = (id) => (lhr.categories[id]?.score === null || lhr.categories[id] === undefined ? null : Math.round(lhr.categories[id].score * 100));
      const num = (id) => lhr.audits[id]?.numericValue ?? null;
      samples.push({
        performance: score('performance'),
        accessibility: score('accessibility'),
        bestPractices: score('best-practices'),
        seo: score('seo'),
        lcpMs: num('largest-contentful-paint'),
        cls: num('cumulative-layout-shift'),
        tbtMs: num('total-blocking-time'),
        transferBytes: num('total-byte-weight'),
      });
      await rm(file, { force: true });
    } catch (e) {
      console.error(`  run ${i} of ${route} failed: ${e.message}`);
    }
  }
  const m = (k) => median(samples.map((s) => s[k]));
  const row = {
    route,
    runs: samples.length,
    performanceRuns: samples.map((s) => s.performance),
    median: {
      performance: m('performance'), accessibility: m('accessibility'), bestPractices: m('bestPractices'), seo: m('seo'),
      lcpMs: m('lcpMs'), cls: m('cls'), tbtMs: m('tbtMs'), transferBytes: m('transferBytes'),
    },
    samples,
  };
  results.push(row);
  console.log(`${route}  perf ${row.performanceRuns.join('/')}  a11y ${row.median.accessibility}  bp ${row.median.bestPractices}  seo ${row.median.seo}`);
}
stopServer();

const measuredAt = new Date().toISOString();
const fmt = {
  s: (ms) => (ms === null ? '–' : `${(ms / 1000).toFixed(1)} s`),
  ms: (ms) => (ms === null ? '–' : `${Math.round(ms)} ms`),
  cls: (v) => (v === null ? '–' : v.toFixed(3).replace(/\.?0+$/, '') || '0'),
  kb: (b) => (b === null ? '–' : `${Math.round(b / 1024)} KB`),
  n: (v) => (v === null ? '–' : String(v)),
};
const md = [
  '# Lighthouse summary',
  '',
  `Measured ${measuredAt.slice(0, 16).replace('T', ' ')} UTC · Lighthouse ${version ?? lighthouseVersion} · mobile emulation, default throttling · ` +
    `${runs} runs per page, medians shown · production build served locally without compression. Lab data from one machine, not field data.`,
  '',
  '| Page | Performance (median; runs) | Accessibility | Best practices | SEO | LCP | CLS | TBT | Transfer |',
  '|---|---|---|---|---|---|---|---|---|',
  ...results.map(
    (r) =>
      `| \`${r.route}\` | ${fmt.n(r.median.performance)} (${r.performanceRuns.join(' · ')}) | ${fmt.n(r.median.accessibility)} | ${fmt.n(r.median.bestPractices)} | ` +
      `${fmt.n(r.median.seo)} | ${fmt.s(r.median.lcpMs)} | ${fmt.cls(r.median.cls)} | ${fmt.ms(r.median.tbtMs)} | ${fmt.kb(r.median.transferBytes)} |`,
  ),
  '',
].join('\n');

await writeFile(join(outDir, 'lighthouse.json'), JSON.stringify({ measuredAt, lighthouseVersion: version, runs, emulation: 'mobile, default throttling', results }, null, 2) + '\n');
await writeFile(join(outDir, 'lighthouse.md'), md);
console.log(`\n${md}\nWritten to ${outDir}`);

const incomplete = results.filter((r) => r.runs < runs);
if (incomplete.length) {
  console.error(`Incomplete: ${incomplete.map((r) => `${r.route} (${r.runs}/${runs})`).join(', ')}`);
  process.exit(1);
}
