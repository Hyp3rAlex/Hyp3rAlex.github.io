/**
 * In-memory replay of the Demographics Service API contract, plus helpers for the data explorer.
 *
 * Mirrors the audited Spring Boot code at revision 1bf9c87:
 *   - StatePopulationController  (GET /api/states, GET /api/states/{stateName})
 *   - StatePopulationService     (null filter + groupingBy + summingLong)
 * Nothing here talks to a network; the rows come from the static snapshot in src/data/demo/demographics.json.
 */
import snapshot from '../data/demo/demographics.json';

/** One row of the explorer: an aggregated state plus how many upstream records fed it. */
export interface StateRow {
  stateName: string;
  abbr: string;
  population: number;
  /** Number of county-level records summed into this row. */
  counties: number;
}

/** The service's response DTO (StatePopulationResponseDto.java:7-9). */
export interface StatePopulationResponse {
  stateName: string;
  population: number;
  updatedAt: string;
}

export interface ReplayResponse {
  status: 200 | 400 | 404 | 405;
  statusText: 'OK' | 'Bad Request' | 'Not Found' | 'Method Not Allowed';
  /** Parsed JSON body; `null` means the replay shows no body. */
  body: StatePopulationResponse[] | StatePopulationResponse | null;
  /** Which handler answered, or why none did. */
  handler: 'getAllStates' | 'getStateByName' | 'none';
  /** Plain-language explanation of the outcome, for the demo UI. */
  note: string;
}

export const SNAPSHOT_ROWS: readonly StateRow[] = snapshot.states;
export const SNAPSHOT_UPDATED_AT: string = snapshot.retrievedAt;

const BASE = '/api/states';

function toDto(row: StateRow, updatedAt: string): StatePopulationResponse {
  return { stateName: row.stateName, population: row.population, updatedAt };
}

function miss(note: string): ReplayResponse {
  return { status: 404, statusText: 'Not Found', body: null, handler: 'none', note };
}

/**
 * Answer a request the way the audited controller would.
 *
 * `request` is either a path (`/api/states/Texas`) or a request line (`GET /api/states/Texas`).
 * Query strings are accepted and ignored, because the controller declares no request parameters.
 */
export function route(
  request: string,
  rows: readonly StateRow[] = SNAPSHOT_ROWS,
  updatedAt: string = SNAPSHOT_UPDATED_AT,
): ReplayResponse {
  let target = request.trim();
  let method = 'GET';
  const m = /^([A-Za-z]+)\s+(.*)$/.exec(target);
  if (m && !m[1]!.startsWith('/')) {
    method = m[1]!.toUpperCase();
    target = m[2]!.trim();
  }

  // Strip fragment (never sent to a server) and query string (ignored by the controller).
  const hash = target.indexOf('#');
  if (hash >= 0) target = target.slice(0, hash);
  const q = target.indexOf('?');
  const hasQuery = q >= 0;
  const rawPath = hasQuery ? target.slice(0, q) : target;

  const isCollection = rawPath === BASE;
  const rest = rawPath.startsWith(BASE + '/') ? rawPath.slice(BASE.length + 1) : null;
  const isItem = rest !== null && rest.length > 0 && !rest.includes('/');

  if (!isCollection && !isItem) {
    return miss(
      'No handler is mapped to this path. The controller only maps /api/states and /api/states/{stateName}; 404 with Spring Boot’s default error response is the expected behaviour (not observed on a running instance), and that body is not reproduced here.',
    );
  }

  if (method !== 'GET') {
    return {
      status: 405,
      statusText: 'Method Not Allowed',
      body: null,
      handler: 'none',
      note: 'Both mappings are @GetMapping. 405 is the expected Spring default for other methods; it was not observed on a running instance, and its error body is not reproduced here.',
    };
  }

  if (isCollection) {
    return {
      status: 200,
      statusText: 'OK',
      body: rows.map((r) => toDto(r, updatedAt)),
      handler: 'getAllStates',
      note: hasQuery
        ? 'The controller declares no request parameters, so the query string is ignored and every row is returned. The README documents ?name=…, but the code does not implement it.'
        : 'JSON array of every stored row. The service returns findAll() order, which is unspecified; the replay lists rows alphabetically.',
    };
  }

  let stateName: string;
  try {
    stateName = decodeURIComponent(rest!);
  } catch {
    return {
      status: 400,
      statusText: 'Bad Request',
      body: null,
      handler: 'none',
      note: 'The path contains a malformed percent-escape. 400 is the expected servlet-container default before the controller runs; not observed on a running instance.',
    };
  }
  if (stateName.includes('/')) {
    return {
      status: 400,
      statusText: 'Bad Request',
      body: null,
      handler: 'none',
      note: 'The path contains an encoded slash. 400 is the expected servlet-container default before the controller runs; not observed on a running instance.',
    };
  }

  // findByStateName on the primary key: exact, case-sensitive.
  const hit = rows.find((r) => r.stateName === stateName);
  if (hit) {
    return {
      status: 200,
      statusText: 'OK',
      body: toDto(hit, updatedAt),
      handler: 'getStateByName',
      note: 'A single JSON object, not an array.',
    };
  }

  const nearMiss = rows.find((r) => r.stateName.toLowerCase() === stateName.toLowerCase());
  const skipped = snapshot.skipped.find((s) => s.stateName === stateName);
  let why = 'No row has this primary key.';
  if (nearMiss) why = `The lookup is an exact, case-sensitive match on the primary key; the stored key is “${nearMiss.stateName}”.`;
  else if (skipped)
    why = `${skipped.stateName} has no row: all ${skipped.nullPopulation} of its upstream records carry a null population and are dropped by the null filter before aggregation.`;
  return {
    status: 404,
    statusText: 'Not Found',
    body: null,
    handler: 'getStateByName',
    note: `${why} The controller answers 404 with an empty body.`,
  };
}

/** Pretty-print a replayed body. The service emits compact JSON; indentation is added for reading only. */
export function formatBody(body: ReplayResponse['body']): string {
  return body === null ? '' : JSON.stringify(body, null, 2);
}

/** Short description of a response for a status line or live region. */
export function describe(res: ReplayResponse): string {
  const head = `${res.status} ${res.statusText}`;
  // Only the controller's own 404 is known to be empty; framework-level errors carry a default body this replay omits.
  if (res.body === null) return res.handler === 'getStateByName' ? `${head} · empty body` : `${head} · body not replayed`;
  if (Array.isArray(res.body)) return `${head} · array of ${res.body.length} objects`;
  return `${head} · 1 object`;
}

// ---------- Aggregation (StatePopulationService.java:39-44) ----------

export interface CountyRecord {
  stateName: string | null;
  population: number | null;
}

export interface Aggregation {
  /** State totals in first-seen order. */
  totals: Map<string, number>;
  /** Records dropped by the null filter. */
  skipped: number;
}

/**
 * Mirror of the Java stream:
 *   filter(stateName != null && population != null)
 *     .collect(groupingBy(stateName, summingLong(population)))
 */
export function aggregate(counties: readonly CountyRecord[]): Aggregation {
  const totals = new Map<string, number>();
  let skipped = 0;
  for (const c of counties) {
    if (c.stateName === null || c.population === null) {
      skipped += 1;
      continue;
    }
    totals.set(c.stateName, (totals.get(c.stateName) ?? 0) + c.population);
  }
  return { totals, skipped };
}

// ---------- Explorer helpers ----------

export type SortKey = 'name' | 'population' | 'counties';
export type SortDir = 'asc' | 'desc';

/** Return a sorted copy. Ties on population fall back to name so the order is deterministic. */
export function sortRows(rows: readonly StateRow[], key: SortKey, dir: SortDir): StateRow[] {
  const sign = dir === 'asc' ? 1 : -1;
  const byName = (a: StateRow, b: StateRow) => (a.stateName < b.stateName ? -1 : a.stateName > b.stateName ? 1 : 0);
  return [...rows].sort((a, b) => {
    if (key === 'name') return sign * byName(a, b);
    return sign * (a[key] - b[key]) || byName(a, b);
  });
}

/** Does a state match the explorer's text filter? Case-insensitive substring of the name, or exact abbreviation. */
export function matchesFilter(row: { stateName: string; abbr: string }, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (q === '') return true;
  return row.stateName.toLowerCase().includes(q) || row.abbr.toLowerCase() === q;
}

export function filterRows(rows: readonly StateRow[], query: string): StateRow[] {
  return rows.filter((r) => matchesFilter(r, query));
}

export function totalPopulation(rows: readonly StateRow[]): number {
  return rows.reduce((sum, r) => sum + r.population, 0);
}

/** Fixed en-GB style grouping (30,506,523) without depending on the runtime's ICU data. */
export function formatInt(n: number): string {
  return String(Math.trunc(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

// ---------- Request helpers ----------

/** The request path that addresses one state, with the name percent-encoded as a client would send it. */
export function pathForState(stateName: string): string {
  return `${BASE}/${encodeURIComponent(stateName)}`;
}

/** The state name a path addresses on the item route, decoded; `null` for any other path. */
export function stateNameFromPath(path: string): string | null {
  const raw = (path.trim().split(/[?#]/)[0] ?? '').replace(/^[A-Za-z]+\s+/, '');
  if (!raw.startsWith(BASE + '/')) return null;
  const rest = raw.slice(BASE.length + 1);
  if (rest === '' || rest.includes('/')) return null;
  try {
    return decodeURIComponent(rest);
  } catch {
    return null;
  }
}

/** Display state for a status line: 2xx is a pass, everything else a warning. */
export function statusState(res: Pick<ReplayResponse, 'status'>): 'pass' | 'warn' {
  return res.status >= 200 && res.status < 300 ? 'pass' : 'warn';
}

// ---------- Explorer view ----------

/**
 * What the explorer can show per state. The service's API returns population only;
 * record counts and shares are computed from the shipped state-level snapshot.
 */
export type Metric = 'population' | 'records' | 'share';

export const METRICS: readonly { id: Metric; label: string; unit: string }[] = [
  { id: 'population', label: 'Population', unit: 'people' },
  { id: 'records', label: 'County-level records', unit: 'records' },
  { id: 'share', label: 'Share of total', unit: '%' },
];

/** Numeric value of a metric for one row. `total` is the population of all rows (for the share). */
export function metricValue(row: StateRow, metric: Metric, total: number): number {
  if (metric === 'records') return row.counties;
  if (metric === 'share') return total === 0 ? 0 : (row.population / total) * 100;
  return row.population;
}

export function formatMetric(value: number, metric: Metric): string {
  return metric === 'share' ? `${value.toFixed(2)} %` : formatInt(value);
}

export interface ExplorerOptions {
  query: string;
  /** `metric` sorts by the selected metric's value. */
  sortBy: 'name' | 'metric';
  dir: SortDir;
  metric: Metric;
}

export interface ExplorerRow {
  row: StateRow;
  value: number;
  label: string;
  /** Bar length in percent of the largest value of this metric over all rows (not only the visible ones). */
  barPct: number;
}

export interface ExplorerView {
  rows: ExplorerRow[];
  shown: number;
  total: number;
  /** Population sum of the visible rows. */
  sum: number;
  /** Whether the skipped-state row (Connecticut) matches the filter. */
  skippedVisible: boolean;
  /** True when nothing at all matches, so the "no match" row is shown. */
  empty: boolean;
}

export const DEFAULT_EXPLORER: ExplorerOptions = { query: '', sortBy: 'metric', dir: 'desc', metric: 'population' };

/** Everything the explorer table and its read-out display, derived from the rows and the control state. */
export function explorerView(
  rows: readonly StateRow[],
  opts: ExplorerOptions,
  skipped: readonly { stateName: string; abbr: string }[] = snapshot.skipped,
): ExplorerView {
  const total = totalPopulation(rows);
  const max = rows.reduce((m, r) => Math.max(m, metricValue(r, opts.metric, total)), 0);
  // Share of total orders exactly like population.
  const key: SortKey = opts.sortBy === 'name' ? 'name' : opts.metric === 'records' ? 'counties' : 'population';
  const visible = sortRows(filterRows(rows, opts.query), key, opts.dir);
  const skippedVisible = skipped.some((s) => matchesFilter(s, opts.query));
  return {
    rows: visible.map((row) => {
      const value = metricValue(row, opts.metric, total);
      return { row, value, label: formatMetric(value, opts.metric), barPct: max === 0 ? 0 : Math.max((value / max) * 100, 0.4) };
    }),
    shown: visible.length,
    total: rows.length,
    sum: totalPopulation(visible),
    skippedVisible,
    empty: visible.length === 0 && !skippedVisible,
  };
}
