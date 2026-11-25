#!/usr/bin/env node
// Refresh src/data/github-metadata.json for the allowlisted repositories (src/data/repos.json).
// - anonymous by default; uses GITHUB_TOKEN when present (CI) for a higher rate limit
// - never fails the build: on any error the committed last-known-good snapshot stays in place
// - never auto-publishes: unlisted repositories are only reported
// - conditional requests: each repository's ETag is stored in the snapshot and sent as If-None-Match;
//   a 304 keeps the cached entry and counts as fresh
import { readFile, writeFile } from 'node:fs/promises';
import { conditionalHeaders, resultFromResponse, mergeSnapshot, findUnlisted } from './lib/metadata.mjs';

const ALLOWLIST = new URL('../src/data/repos.json', import.meta.url);
const SNAPSHOT = new URL('../src/data/github-metadata.json', import.meta.url);
const API = process.env.GITHUB_API_URL ?? 'https://api.github.com';
const TIMEOUT_MS = 10_000;

const headers = {
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'portfolio-metadata-refresh',
  ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
};

async function get(path, extraHeaders = {}) {
  const res = await fetch(API + path, { headers: { ...headers, ...extraHeaders }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (res.status === 403 || res.status === 429) {
    const reset = res.headers.get('x-ratelimit-reset');
    throw new Error(`rate limited${reset ? ` until ${new Date(Number(reset) * 1000).toISOString()}` : ''}`);
  }
  return res;
}

async function getJson(path) {
  const res = await get(path);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/** One repository, conditionally: sends the cached ETag; 304 means the cached entry is still current. */
async function fetchRepo(fullName, cached) {
  const res = await get(`/repos/${fullName}`, conditionalHeaders(cached));
  const payload = res.status === 200 ? await res.json() : null;
  return resultFromResponse(fullName, res.status, payload, res.headers.get('etag'));
}

async function listOwnerRepos(owner) {
  const all = [];
  for (let page = 1; page <= 10; page += 1) {
    const batch = await getJson(`/users/${owner}/repos?per_page=100&page=${page}&type=owner`);
    if (!Array.isArray(batch)) throw new Error('unexpected list payload');
    all.push(...batch);
    if (batch.length < 100) break;
  }
  return all;
}

const allow = JSON.parse(await readFile(ALLOWLIST, 'utf8'));
let previous = { fetchedAt: null, repos: {} };
try {
  previous = JSON.parse(await readFile(SNAPSHOT, 'utf8'));
} catch {
  console.warn('No readable snapshot yet; starting empty.');
}

const results = await Promise.all(
  allow.repos.map(async ({ fullName }) => {
    try {
      return await fetchRepo(fullName, previous.repos?.[fullName]);
    } catch (err) {
      return { ok: false, fullName, error: err instanceof Error ? err.message : String(err) };
    }
  }),
);

const { snapshot, updated, unchanged, failed } = mergeSnapshot(previous, results, new Date().toISOString());
for (const f of failed) console.warn(`kept cached entry for ${f.fullName}: ${f.error}`);

if (updated > 0) {
  await writeFile(SNAPSHOT, JSON.stringify(snapshot, null, 2) + '\n');
  console.log(
    `Refreshed ${updated}/${allow.repos.length} repositories: ${updated - unchanged} fetched (200), ${unchanged} not modified (304).`,
  );
} else {
  console.warn('No repository could be refreshed; snapshot left untouched.');
}

try {
  const unlisted = findUnlisted(await listOwnerRepos(allow.owner), allow.repos);
  if (unlisted.length) {
    console.log(`REVIEW: public repositories not on the allowlist (not published): ${unlisted.join(', ')}`);
  }
} catch (err) {
  console.warn(`Could not check for unlisted repositories: ${err instanceof Error ? err.message : err}`);
}
