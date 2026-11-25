import { describe, expect, it } from 'vitest';
import { parseRepo, mergeSnapshot, findUnlisted, conditionalHeaders, resultFromResponse } from '../../scripts/lib/metadata.mjs';

const good = {
  full_name: 'Hyp3rAlex/longisafe-lab',
  html_url: 'https://github.com/Hyp3rAlex/longisafe-lab',
  description: 'desc',
  language: 'Python',
  default_branch: 'main',
  pushed_at: '2026-11-13T13:01:20Z',
  license: null,
  private: false,
};

describe('parseRepo', () => {
  it('keeps only the fields the site uses', () => {
    expect(parseRepo({ ...good, stargazers_count: 3, owner: { login: 'x' } })).toEqual({
      fullName: 'Hyp3rAlex/longisafe-lab',
      url: 'https://github.com/Hyp3rAlex/longisafe-lab',
      description: 'desc',
      language: 'Python',
      defaultBranch: 'main',
      pushedAt: '2026-11-13T13:01:20Z',
      license: null,
      archived: false,
    });
  });
  it('accepts null description and language', () => {
    expect(parseRepo({ ...good, description: null, language: null }).language).toBeNull();
  });
  it.each([
    ['null payload', null],
    ['error body', { message: 'Not Found' }],
    ['wrong type', { ...good, pushed_at: 12 }],
    ['bad date', { ...good, pushed_at: 'yesterday' }],
    ['non-GitHub url', { ...good, html_url: 'https://evil.example/x/y' }],
    ['private repository', { ...good, private: true }],
  ])('rejects malformed response: %s', (_name, payload) => {
    expect(() => parseRepo(payload)).toThrow();
  });
});

describe('mergeSnapshot', () => {
  const previous = { fetchedAt: '2026-11-01T00:00:00Z', repos: { 'a/b': { fullName: 'a/b', pushedAt: 'old' } } };

  it('keeps the last-known-good entry when a fetch fails', () => {
    const { snapshot, failed, updated } = mergeSnapshot(
      previous,
      [{ ok: false, fullName: 'a/b', error: 'HTTP 500' }],
      '2026-11-25T00:00:00Z',
    );
    expect(snapshot).toEqual(previous);
    expect(updated).toBe(0);
    expect(failed).toEqual([{ fullName: 'a/b', error: 'HTTP 500' }]);
  });
  it('updates successful repos and the timestamp, leaving failed ones cached', () => {
    const { snapshot } = mergeSnapshot(
      previous,
      [
        { ok: true, fullName: 'c/d', data: { fullName: 'c/d' } },
        { ok: false, fullName: 'a/b', error: 'timeout' },
      ],
      '2026-11-25T00:00:00Z',
    );
    expect(snapshot.fetchedAt).toBe('2026-11-25T00:00:00Z');
    expect(snapshot.repos['a/b'].pushedAt).toBe('old');
    expect(snapshot.repos['c/d']).toEqual({ fullName: 'c/d' });
  });
  it('works without any previous snapshot', () => {
    expect(mergeSnapshot(undefined, [], 'now').snapshot).toEqual({ fetchedAt: null, repos: {} });
  });
});

describe('conditional requests', () => {
  const cached = { fullName: 'a/b', pushedAt: 'old', etag: 'W/"abc123"' };
  const previous = { fetchedAt: '2026-11-01T00:00:00Z', repos: { 'a/b': cached } };

  it('sends If-None-Match only when a well-formed ETag is cached', () => {
    expect(conditionalHeaders(cached)).toEqual({ 'If-None-Match': 'W/"abc123"' });
    expect(conditionalHeaders({ etag: '"strong"' })).toEqual({ 'If-None-Match': '"strong"' });
    expect(conditionalHeaders({ fullName: 'a/b' })).toEqual({});
    expect(conditionalHeaders(undefined)).toEqual({});
    expect(conditionalHeaders({ etag: 'abc\r\nX-Injected: 1' })).toEqual({});
  });

  it('maps 304 to notModified, 200 to parsed data with the ETag, anything else to a failure', () => {
    expect(resultFromResponse('a/b', 304, null, null)).toEqual({ ok: true, fullName: 'a/b', notModified: true });
    const fresh = resultFromResponse(good.full_name, 200, good, '"e1"');
    expect(fresh).toMatchObject({ ok: true, fullName: good.full_name, etag: '"e1"', data: { pushedAt: good.pushed_at } });
    expect(resultFromResponse(good.full_name, 200, good, null)).not.toHaveProperty('etag');
    expect(resultFromResponse('a/b', 404, { message: 'Not Found' }, null)).toEqual({ ok: false, fullName: 'a/b', error: 'HTTP 404' });
    expect(resultFromResponse('a/b', 200, { message: 'garbage' }, '"e"')).toMatchObject({ ok: false, fullName: 'a/b' });
  });

  it('304 keeps the cached entry untouched and counts as fresh', () => {
    const { snapshot, updated, unchanged, failed } = mergeSnapshot(
      previous,
      [{ ok: true, fullName: 'a/b', notModified: true }],
      '2026-11-25T00:00:00Z',
    );
    expect(snapshot.repos['a/b']).toEqual(cached);
    expect(snapshot.fetchedAt).toBe('2026-11-25T00:00:00Z');
    expect({ updated, unchanged, failed }).toEqual({ updated: 1, unchanged: 1, failed: [] });
  });

  it('stores the ETag next to the parsed fields without changing their shape', () => {
    const data = parseRepo(good);
    const { snapshot, unchanged } = mergeSnapshot(
      previous,
      [{ ok: true, fullName: data.fullName, data, etag: '"new"' }],
      '2026-11-25T00:00:00Z',
    );
    expect(snapshot.repos[data.fullName]).toEqual({ ...data, etag: '"new"' });
    expect(snapshot.repos['a/b']).toEqual(cached);
    expect(unchanged).toBe(0);
  });

  it('replaces a stale ETag on 200 and drops it when the response carries none', () => {
    const data = { fullName: 'a/b', pushedAt: 'new' };
    expect(mergeSnapshot(previous, [{ ok: true, fullName: 'a/b', data, etag: '"v2"' }], 'now').snapshot.repos['a/b']).toEqual({ ...data, etag: '"v2"' });
    expect(mergeSnapshot(previous, [{ ok: true, fullName: 'a/b', data }], 'now').snapshot.repos['a/b']).toEqual(data);
  });

  it('treats a 304 without a cached entry as a failure, not as data', () => {
    const { snapshot, updated, failed } = mergeSnapshot(previous, [{ ok: true, fullName: 'x/y', notModified: true }], 'now');
    expect(snapshot).toEqual(previous);
    expect(updated).toBe(0);
    expect(failed).toEqual([{ fullName: 'x/y', error: 'not modified, but no cached entry' }]);
  });

  it('mixes 200, 304 and failures in one run', () => {
    const { snapshot, updated, unchanged, failed } = mergeSnapshot(
      previous,
      [
        { ok: true, fullName: 'a/b', notModified: true },
        { ok: true, fullName: 'c/d', data: { fullName: 'c/d' }, etag: '"c"' },
        { ok: false, fullName: 'e/f', error: 'timeout' },
      ],
      'now',
    );
    expect({ updated, unchanged, failed: failed.length }).toEqual({ updated: 2, unchanged: 1, failed: 1 });
    expect(Object.keys(snapshot.repos)).toEqual(['a/b', 'c/d']);
  });
});

describe('findUnlisted', () => {
  it('reports public non-fork repos missing from the allowlist, case-insensitively', () => {
    const owner = [
      { full_name: 'Hyp3rAlex/Known', private: false, fork: false },
      { full_name: 'Hyp3rAlex/new-thing', private: false, fork: false },
      { full_name: 'Hyp3rAlex/a-fork', private: false, fork: true },
      { full_name: 'Hyp3rAlex/secret', private: true, fork: false },
      null,
    ];
    expect(findUnlisted(owner, [{ fullName: 'hyp3ralex/known' }])).toEqual(['Hyp3rAlex/new-thing']);
  });
});
