// Pure helpers for the build-time GitHub metadata refresh. Unit-tested in tests/unit/metadata.test.ts.

/** Validate and reduce a GitHub REST `GET /repos/{owner}/{repo}` payload to the fields the site uses. */
export function parseRepo(payload) {
  if (!payload || typeof payload !== 'object') throw new Error('payload is not an object');
  const str = (v, name, optional = false) => {
    if (v === null || v === undefined) {
      if (optional) return null;
      throw new Error(`missing ${name}`);
    }
    if (typeof v !== 'string') throw new Error(`${name} is not a string`);
    return v;
  };
  const isoDate = (v, name) => {
    const s = str(v, name);
    if (Number.isNaN(Date.parse(s))) throw new Error(`${name} is not a date`);
    return s;
  };
  if (payload.private === true) throw new Error('repository is private');
  const url = str(payload.html_url, 'html_url');
  if (!/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/.test(url)) throw new Error('html_url is not a GitHub repository URL');
  return {
    fullName: str(payload.full_name, 'full_name'),
    url,
    description: str(payload.description, 'description', true),
    language: str(payload.language, 'language', true),
    defaultBranch: str(payload.default_branch, 'default_branch'),
    pushedAt: isoDate(payload.pushed_at, 'pushed_at'),
    license: payload.license && typeof payload.license.spdx_id === 'string' ? payload.license.spdx_id : null,
    archived: payload.archived === true,
  };
}

/**
 * Request headers for a conditional refresh of one repository: `If-None-Match` with the ETag stored in the
 * snapshot, when there is one. Returns an empty object otherwise, so the request is unconditional.
 */
export function conditionalHeaders(entry) {
  const etag = entry && typeof entry.etag === 'string' ? entry.etag.trim() : '';
  // An ETag is an opaque quoted string, optionally weak: "abc" or W/"abc". Anything else is not sent.
  return /^(W\/)?"[^"\r\n]*"$/.test(etag) ? { 'If-None-Match': etag } : {};
}

/**
 * Turn one API response into a fetch result.
 * 200 → parsed fields plus the response ETag; 304 → `notModified` (the cached entry is still current).
 */
export function resultFromResponse(fullName, status, payload, etag) {
  if (status === 304) return { ok: true, fullName, notModified: true };
  if (status !== 200) return { ok: false, fullName, error: `HTTP ${status}` };
  try {
    const data = parseRepo(payload);
    return { ok: true, fullName, data, ...(typeof etag === 'string' && etag ? { etag } : {}) };
  } catch (err) {
    return { ok: false, fullName, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Merge freshly fetched results into the last-known-good snapshot.
 * - A repo whose fetch failed keeps its previous entry, so an API outage never removes data.
 * - A repo answered with 304 Not Modified keeps its previous entry (including its ETag) and counts as fresh.
 * - A 304 for a repo with no cached entry cannot be honoured and is reported as failed.
 * `updated` is the number of repositories confirmed current in this run (200 or 304); `unchanged` the 304 share.
 */
export function mergeSnapshot(previous, results, now) {
  const repos = { ...(previous?.repos ?? {}) };
  const failed = [];
  let updated = 0;
  let unchanged = 0;
  for (const r of results) {
    if (r.ok && r.notModified) {
      if (repos[r.fullName]) {
        updated += 1;
        unchanged += 1;
      } else {
        failed.push({ fullName: r.fullName, error: 'not modified, but no cached entry' });
      }
    } else if (r.ok) {
      repos[r.fullName] = r.etag ? { ...r.data, etag: r.etag } : r.data;
      updated += 1;
    } else {
      failed.push({ fullName: r.fullName, error: r.error });
    }
  }
  return {
    snapshot: { fetchedAt: updated > 0 ? now : (previous?.fetchedAt ?? null), repos },
    updated,
    unchanged,
    failed,
  };
}

/** Public, non-fork repositories of the owner that are not on the allowlist: a review task, never auto-published. */
export function findUnlisted(ownerRepos, allowlist) {
  const known = new Set(allowlist.map((r) => r.fullName.toLowerCase()));
  return ownerRepos
    .filter((r) => r && r.private !== true && r.fork !== true && typeof r.full_name === 'string')
    .map((r) => r.full_name)
    .filter((name) => !known.has(name.toLowerCase()));
}
