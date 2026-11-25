export interface RepoMeta {
  fullName: string;
  url: string;
  description: string | null;
  language: string | null;
  defaultBranch: string;
  pushedAt: string;
  license: string | null;
  archived: boolean;
}
/** A snapshot entry: the parsed fields plus, when the API sent one, the ETag used for conditional requests. */
export type SnapshotEntry = Partial<RepoMeta> & { etag?: string };
export interface Snapshot {
  fetchedAt: string | null;
  repos: Record<string, SnapshotEntry>;
}
export type FetchResult =
  | { ok: true; fullName: string; data: Partial<RepoMeta>; etag?: string; notModified?: false }
  | { ok: true; fullName: string; notModified: true }
  | { ok: false; fullName: string; error: string };
export function parseRepo(payload: unknown): RepoMeta;
export function conditionalHeaders(entry: SnapshotEntry | null | undefined): { 'If-None-Match'?: string };
export function resultFromResponse(fullName: string, status: number, payload: unknown, etag?: string | null): FetchResult;
export function mergeSnapshot(
  previous: Snapshot | undefined,
  results: FetchResult[],
  now: string,
): { snapshot: Snapshot; updated: number; unchanged: number; failed: { fullName: string; error: string }[] };
export function findUnlisted(ownerRepos: unknown[], allowlist: { fullName: string }[]): string[];
