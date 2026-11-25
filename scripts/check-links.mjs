#!/usr/bin/env node
// Link check for a built site. Node built-ins only.
//
//   node scripts/check-links.mjs <dist> [--allow-pending <url>]... [--site <origin>]
//                                [--no-external] [--concurrency 6] [--timeout 10000] [--json <file>]
//
// Internal: every href/src/srcset/poster in every HTML file must resolve to a file in <dist>;
//           a #fragment must exist as an id (or <a name>) on the target page.
//           Absolute links to the site's own origin (from --site, else the home page's canonical URL)
//           are checked against <dist> too, because the deployed site may not exist yet.
// External: every distinct http(s) URL gets HEAD, then GET if HEAD is not conclusive.
//   ok          2xx, same URL
//   redirected  2xx after one or more redirects (final URL is printed)
//   unverified  the server refuses automated clients or is temporarily unavailable:
//               401, 403, 429, 999, 5xx, timeout. Reported as "could not verify", never a failure.
//   pending     broken, but listed with --allow-pending (e.g. a repository that is not public yet)
//   broken      404/410/other 4xx, DNS failure, refused connection, TLS error
// Exit code: 1 if any internal link or any external link is broken, otherwise 0.
import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';

const args = process.argv.slice(2);
const opts = { dist: null, allowPending: [], site: null, external: true, concurrency: 6, timeout: 10_000, json: null };
for (let i = 0; i < args.length; i += 1) {
  const a = args[i];
  const next = () => {
    i += 1;
    if (args[i] === undefined) fail(`${a} needs a value`);
    return args[i];
  };
  if (a === '--allow-pending') opts.allowPending.push(...next().split(',').map((s) => s.trim()).filter(Boolean));
  else if (a === '--site') opts.site = next();
  else if (a === '--no-external') opts.external = false;
  else if (a === '--concurrency') opts.concurrency = Math.max(1, Number(next()) || 6);
  else if (a === '--timeout') opts.timeout = Math.max(1000, Number(next()) || 10_000);
  else if (a === '--json') opts.json = next();
  else if (a.startsWith('--')) fail(`unknown option ${a}`);
  else if (!opts.dist) opts.dist = a;
  else fail(`unexpected argument ${a}`);
}
if (!opts.dist) fail('usage: node scripts/check-links.mjs <dist> [--allow-pending <url>] [--no-external]');

function fail(msg) {
  console.error(msg);
  process.exit(2);
}

const root = resolve(opts.dist);
const UA = 'Mozilla/5.0 (compatible; link-check/1.0)';
const norm = (u) => u.replace(/\/+$/, '').toLowerCase();
const pending = new Set(opts.allowPending.map(norm));

async function walk(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else out.push(p);
  }
  return out;
}

const decodeEntities = (s) =>
  s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));

/** Attributes of one start tag as a Map (lower-cased names, entity-decoded values). */
function attrsOf(tag) {
  const map = new Map();
  const re = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  const body = tag.replace(/^<[^\s/>]+/, '').replace(/\/?>$/, '');
  let m;
  while ((m = re.exec(body))) map.set(m[1].toLowerCase(), decodeEntities(m[2] ?? m[3] ?? m[4] ?? ''));
  return map;
}

/** Links and anchor ids of one HTML document. Script, style and comment contents are ignored. */
function parseHtml(html) {
  const clean = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<script\b([^>]*)>[\s\S]*?<\/script>/gi, '<script$1></script>')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');
  const ids = new Set();
  const links = [];
  let canonical = null;
  const tagRe = /<([a-zA-Z][^\s/>]*)(?:"[^"]*"|'[^']*'|[^'">])*>/g;
  let m;
  while ((m = tagRe.exec(clean))) {
    const name = m[1].toLowerCase();
    const at = attrsOf(m[0]);
    if (at.has('id')) ids.add(at.get('id'));
    if (name === 'a' && at.has('name')) ids.add(at.get('name'));
    if (name === 'link') {
      const rel = (at.get('rel') ?? '').toLowerCase();
      if (rel.includes('canonical')) canonical = at.get('href') ?? null;
      if (/\b(preconnect|dns-prefetch)\b/.test(rel)) continue;
    }
    for (const key of ['href', 'xlink:href', 'src', 'poster']) {
      if (at.has(key) && !(name === 'base')) links.push({ tag: name, attr: key, value: at.get(key).trim() });
    }
    for (const key of ['srcset', 'imagesrcset']) {
      if (!at.has(key)) continue;
      for (const part of at.get(key).split(',')) {
        const u = part.trim().split(/\s+/)[0];
        if (u) links.push({ tag: name, attr: key, value: u });
      }
    }
  }
  return { ids, links, canonical };
}

const exists = async (p) => stat(p).then((s) => s, () => null);

/** Map a site path to a file in dist, the way a static host does. */
async function resolveInDist(pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  const file = resolve(root, '.' + decoded);
  if (file !== root && !file.startsWith(root + sep)) return null;
  const s = await exists(file);
  if (s?.isFile()) return file;
  if (s?.isDirectory()) {
    const index = join(file, 'index.html');
    return (await exists(index))?.isFile() ? index : null;
  }
  if (!decoded.endsWith('/') && (await exists(file + '.html'))?.isFile()) return file + '.html';
  return null;
}

// ---- collect ----------------------------------------------------------------------------------
if (!(await exists(root))?.isDirectory()) fail(`not a directory: ${root}`);
const files = (await walk(root)).filter((f) => f.endsWith('.html')).sort();
const pages = new Map();
for (const f of files) pages.set(f, parseHtml(await readFile(f, 'utf8')));

let siteOrigin = null;
try {
  const home = pages.get(join(root, 'index.html'));
  siteOrigin = new URL(opts.site ?? home?.canonical ?? '').origin;
} catch {
  // No usable canonical URL: only relative links count as internal.
}

const pageUrl = (file) => {
  const rel = relative(root, file).split(sep).join('/');
  return '/' + rel.replace(/(^|\/)index\.html$/, '$1');
};

const internalBroken = [];
const external = new Map(); // url -> Set(page)
let internalCount = 0;

for (const [file, page] of pages) {
  const from = pageUrl(file);
  for (const link of page.links) {
    const raw = link.value;
    if (!raw || /^(mailto:|tel:|sms:|javascript:|data:|blob:|about:)/i.test(raw)) continue;
    let url;
    try {
      url = new URL(raw, 'http://dist.invalid' + from);
    } catch {
      internalBroken.push({ from, link: raw, reason: 'unparsable URL' });
      continue;
    }
    const isOwnSite = siteOrigin && url.origin === siteOrigin;
    if (url.origin !== 'http://dist.invalid' && !isOwnSite) {
      if (url.protocol === 'http:' || url.protocol === 'https:') {
        url.hash = '';
        const key = url.href;
        if (!external.has(key)) external.set(key, new Set());
        external.get(key).add(from);
      }
      continue;
    }
    internalCount += 1;
    const target = await resolveInDist(url.pathname);
    if (!target) {
      internalBroken.push({ from, link: raw, reason: 'no such file in dist' });
      continue;
    }
    const frag = url.hash ? decodeURIComponent(url.hash.slice(1)) : '';
    if (frag && frag !== 'top' && target.endsWith('.html')) {
      const ids = pages.get(target)?.ids;
      if (ids && !ids.has(frag)) internalBroken.push({ from, link: raw, reason: `no element with id "${frag}" on ${pageUrl(target)}` });
    }
  }
}

// ---- external ---------------------------------------------------------------------------------
const UNVERIFIABLE = new Set([401, 403, 429, 999]);

async function request(url, method) {
  const res = await fetch(url, {
    method,
    redirect: 'follow',
    headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml,*/*;q=0.8', 'Accept-Language': 'en' },
    signal: AbortSignal.timeout(opts.timeout),
  });
  // Only the status line and headers are needed.
  await res.body?.cancel().catch(() => {});
  return res;
}

function classifyError(err) {
  const code = err?.cause?.code ?? err?.code ?? '';
  const text = `${err?.name ?? ''} ${code} ${err?.cause?.message ?? err?.message ?? ''}`.trim();
  if (err?.name === 'TimeoutError' || err?.name === 'AbortError' || /TIMEOUT/i.test(code)) return { state: 'unverified', detail: 'timeout' };
  if (code === 'ENOTFOUND' || code === 'EAI_NONAME') return { state: 'broken', detail: 'DNS: host not found' };
  if (code === 'EAI_AGAIN' || code === 'ECONNRESET' || code === 'UND_ERR_SOCKET') return { state: 'unverified', detail: text };
  return { state: 'broken', detail: text || 'request failed' };
}

function classifyResponse(url, res) {
  const status = res.status;
  if (status >= 200 && status < 300) {
    return res.redirected && norm(res.url) !== norm(url)
      ? { state: 'redirected', detail: `${status} → ${res.url}` }
      : { state: 'ok', detail: String(status) };
  }
  if (UNVERIFIABLE.has(status) || status >= 500) return { state: 'unverified', detail: `HTTP ${status}` };
  return { state: 'broken', detail: `HTTP ${status}` };
}

async function checkExternal(url) {
  let result;
  try {
    result = classifyResponse(url, await request(url, 'HEAD'));
  } catch (err) {
    result = classifyError(err);
  }
  if (result.state !== 'ok' && result.state !== 'redirected') {
    // HEAD is often unsupported or treated differently; GET decides.
    try {
      result = classifyResponse(url, await request(url, 'GET'));
    } catch (err) {
      const viaGet = classifyError(err);
      // Keep a definite HTTP answer from HEAD over a GET transport error.
      if (!/^HTTP /.test(result.detail)) result = viaGet;
    }
  }
  if (result.state === 'broken' && pending.has(norm(url))) result = { state: 'pending', detail: `${result.detail} (allowed: not published yet)` };
  return result;
}

const externalResults = [];
if (opts.external) {
  const queue = [...external.keys()].sort();
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(opts.concurrency, queue.length) }, async () => {
      while (cursor < queue.length) {
        const url = queue[cursor];
        cursor += 1;
        const r = await checkExternal(url);
        externalResults.push({ url, ...r, pages: [...external.get(url)].sort() });
      }
    }),
  );
  externalResults.sort((a, b) => a.url.localeCompare(b.url));
}

// ---- report -----------------------------------------------------------------------------------
const by = (state) => externalResults.filter((r) => r.state === state);
const label = { ok: 'ok', redirected: 'redirected', unverified: 'could not verify', pending: 'pending', broken: 'BROKEN' };

console.log(`Link check: ${relative(process.cwd(), root) || '.'}`);
console.log(`  HTML files: ${files.length} · internal references: ${internalCount} · distinct external URLs: ${external.size}`);
console.log(`  Internal: ${internalBroken.length === 0 ? 'all resolve (files and #fragments)' : `${internalBroken.length} BROKEN`}`);
for (const b of internalBroken) console.log(`    BROKEN ${b.from} → ${b.link} (${b.reason})`);
if (opts.external) {
  console.log(
    `  External: ${by('ok').length} ok · ${by('redirected').length} redirected · ${by('unverified').length} could not verify · ` +
      `${by('pending').length} pending · ${by('broken').length} broken`,
  );
  for (const r of externalResults) {
    const where = r.state === 'ok' ? '' : `  [${r.pages.slice(0, 3).join(', ')}${r.pages.length > 3 ? `, +${r.pages.length - 3}` : ''}]`;
    console.log(`    ${label[r.state].padEnd(16)} ${r.url}${r.state === 'ok' ? '' : ` — ${r.detail}`}${where}`);
  }
} else {
  console.log('  External: skipped (--no-external)');
}

if (opts.json) {
  await writeFile(
    opts.json,
    JSON.stringify({ checkedAt: new Date().toISOString(), htmlFiles: files.length, internalCount, internalBroken, external: externalResults }, null, 2) + '\n',
  );
}

const failed = internalBroken.length + by('broken').length;
console.log(failed === 0 ? 'Result: PASS' : `Result: FAIL (${failed} broken)`);
process.exit(failed === 0 ? 0 : 1);
