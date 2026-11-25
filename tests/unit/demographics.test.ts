import { describe as suite, expect, it } from 'vitest';
import snapshot from '../../src/data/demo/demographics.json';
import {
  SNAPSHOT_ROWS,
  DEFAULT_EXPLORER,
  METRICS,
  aggregate,
  describe,
  explorerView,
  filterRows,
  formatBody,
  formatInt,
  formatMetric,
  metricValue,
  pathForState,
  route,
  stateNameFromPath,
  statusState,
  sortRows,
  totalPopulation,
  type StatePopulationResponse,
} from '../../src/lib/demographics';

const one = (path: string) => route(path).body as StatePopulationResponse;

suite('snapshot (audit spot-check values, section 9)', () => {
  it('has 50 rows: 49 states + District of Columbia, without Connecticut', () => {
    expect(SNAPSHOT_ROWS).toHaveLength(50);
    expect(SNAPSHOT_ROWS.some((r) => r.stateName === 'District of Columbia')).toBe(true);
    expect(SNAPSHOT_ROWS.some((r) => r.stateName === 'Connecticut')).toBe(false);
  });

  it('sums to 333,859,535', () => {
    expect(totalPopulation(SNAPSHOT_ROWS)).toBe(333_859_535);
    expect(snapshot.counts.totalPopulation).toBe(333_859_535);
  });

  it('accounts for all 3,144 upstream records: 3,135 aggregated + 9 skipped', () => {
    const aggregated = SNAPSHOT_ROWS.reduce((n, r) => n + r.counties, 0);
    expect(aggregated + snapshot.counts.featuresSkippedNull).toBe(3144);
    expect(snapshot.skipped).toEqual([{ stateName: 'Connecticut', abbr: 'CT', records: 9, nullPopulation: 9 }]);
  });
});

suite('route — GET /api/states', () => {
  it('returns 200 and an array of 50 DTOs with exactly the three DTO fields', () => {
    const res = route('GET /api/states');
    expect(res.status).toBe(200);
    expect(res.handler).toBe('getAllStates');
    expect(Array.isArray(res.body)).toBe(true);
    const body = res.body as StatePopulationResponse[];
    expect(body).toHaveLength(50);
    expect(Object.keys(body[0]!)).toEqual(['stateName', 'population', 'updatedAt']);
    expect(body[0]).toEqual({ stateName: 'Alabama', population: 5_098_606, updatedAt: '2026-11-25T01:24:10Z' });
  });

  it('accepts a bare path without the method', () => {
    expect(route('/api/states').status).toBe(200);
  });

  it('ignores ?name=Texas (the README form) and returns the full array', () => {
    const res = route('GET /api/states?name=Texas');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(50);
    expect(res.note).toMatch(/ignored/);
  });

  it('returns 200 [] when the table is empty (before the first ingestion)', () => {
    const res = route('/api/states', []);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

suite('route — GET /api/states/{stateName}', () => {
  it('returns a single object, not an array', () => {
    const res = route('GET /api/states/Texas');
    expect(res.status).toBe(200);
    expect(res.handler).toBe('getStateByName');
    expect(res.body).toEqual({ stateName: 'Texas', population: 30_506_523, updatedAt: '2026-11-25T01:24:10Z' });
  });

  it('matches the audit spot checks', () => {
    expect(one('/api/states/California').population).toBe(39_877_642);
    expect(one('/api/states/Florida').population).toBe(22_381_338);
    expect(one('/api/states/New%20York').population).toBe(20_113_414);
    expect(one('/api/states/Wyoming').population).toBe(578_766);
    expect(one('/api/states/Delaware').population).toBe(1_021_276);
  });

  it('URL-decodes %20', () => {
    const res = route('GET /api/states/District%20of%20Columbia');
    expect(res.status).toBe(200);
    expect(one('/api/states/District%20of%20Columbia')).toMatchObject({ stateName: 'District of Columbia', population: 700_690 });
  });

  it('is case-sensitive: texas → 404 with an empty body', () => {
    const res = route('GET /api/states/texas');
    expect(res.status).toBe(404);
    expect(res.body).toBeNull();
    expect(res.note).toMatch(/case-sensitive/);
  });

  it('Connecticut → 404, with the null-population explanation', () => {
    const res = route('GET /api/states/Connecticut');
    expect(res.status).toBe(404);
    expect(res.body).toBeNull();
    expect(res.note).toMatch(/9 of its upstream records/);
  });

  it('unknown state → 404', () => {
    expect(route('/api/states/Narnia').status).toBe(404);
  });

  it('ignores a query string on the item route too', () => {
    expect(one('/api/states/Texas?name=Ohio').stateName).toBe('Texas');
  });

  it('does not treat + as a space', () => {
    expect(route('/api/states/New+York').status).toBe(404);
  });

  it('answers 400 for a malformed percent-escape', () => {
    expect(route('/api/states/%ZZ').status).toBe(400);
  });
});

suite('route — everything else', () => {
  it.each(['/', '/api', '/api/state', '/api/states/', '/api/states/Texas/', '/api/states/Texas/counties', '/API/states', ''])(
    'unknown path %j → 404 from no handler',
    (path) => {
      const res = route(path);
      expect(res.status).toBe(404);
      expect(res.handler).toBe('none');
      expect(res.body).toBeNull();
    },
  );

  it('rejects non-GET methods on mapped paths with 405', () => {
    expect(route('POST /api/states').status).toBe(405);
    expect(route('DELETE /api/states/Texas').status).toBe(405);
  });
});

suite('describe / formatBody', () => {
  it('summarises each response shape', () => {
    expect(describe(route('/api/states'))).toBe('200 OK · array of 50 objects');
    expect(describe(route('/api/states/Texas'))).toBe('200 OK · 1 object');
    expect(describe(route('/api/states/texas'))).toBe('404 Not Found · empty body');
    expect(describe(route('/api/nope'))).toBe('404 Not Found · body not replayed');
  });

  it('formats an empty body as an empty string and JSON otherwise', () => {
    expect(formatBody(null)).toBe('');
    expect(JSON.parse(formatBody(route('/api/states/Texas').body))).toEqual(one('/api/states/Texas'));
  });
});

suite('aggregate — mirror of the Java stream', () => {
  it('reproduces the repository’s own unit-test fixture (Texas 100 + 200, California 300)', () => {
    const { totals, skipped } = aggregate([
      { stateName: 'Texas', population: 100 },
      { stateName: 'Texas', population: 200 },
      { stateName: 'California', population: 300 },
    ]);
    expect(Object.fromEntries(totals)).toEqual({ Texas: 300, California: 300 });
    expect(skipped).toBe(0);
  });

  it('drops records with a null name or null population, so an all-null state disappears', () => {
    const ct = Array.from({ length: 9 }, () => ({ stateName: 'Connecticut', population: null }));
    const { totals, skipped } = aggregate([
      ...ct,
      { stateName: null, population: 5 },
      { stateName: 'Delaware', population: 1 },
      { stateName: 'Delaware', population: 0 },
    ]);
    expect(totals.has('Connecticut')).toBe(false);
    expect(Object.fromEntries(totals)).toEqual({ Delaware: 1 });
    expect(skipped).toBe(10);
  });

  it('an empty input yields an empty result (the case that would wipe the table)', () => {
    expect(aggregate([]).totals.size).toBe(0);
  });

  it('is stable when re-aggregating the snapshot rows plus the skipped Connecticut records', () => {
    const records = [
      ...SNAPSHOT_ROWS.map((r) => ({ stateName: r.stateName, population: r.population })),
      ...Array.from({ length: 9 }, () => ({ stateName: 'Connecticut', population: null })),
    ];
    const { totals, skipped } = aggregate(records);
    expect(totals.size).toBe(50);
    expect(skipped).toBe(9);
    expect(totals.get('Texas')).toBe(30_506_523);
    expect([...totals.values()].reduce((a, b) => a + b, 0)).toBe(333_859_535);
  });
});

suite('explorer helpers', () => {
  it('sorts by population descending: California, Texas, Florida, New York', () => {
    const top = sortRows(SNAPSHOT_ROWS, 'population', 'desc').slice(0, 4);
    expect(top.map((r) => r.stateName)).toEqual(['California', 'Texas', 'Florida', 'New York']);
  });

  it('sorts by population ascending: Wyoming first', () => {
    expect(sortRows(SNAPSHOT_ROWS, 'population', 'asc')[0]!.stateName).toBe('Wyoming');
  });

  it('sorts by name both ways without mutating the input', () => {
    const before = SNAPSHOT_ROWS.map((r) => r.stateName);
    expect(sortRows(SNAPSHOT_ROWS, 'name', 'asc')[0]!.stateName).toBe('Alabama');
    expect(sortRows(SNAPSHOT_ROWS, 'name', 'desc')[0]!.stateName).toBe('Wyoming');
    expect(SNAPSHOT_ROWS.map((r) => r.stateName)).toEqual(before);
  });

  it('filters by case-insensitive substring or exact abbreviation', () => {
    expect(filterRows(SNAPSHOT_ROWS, 'new').map((r) => r.stateName)).toEqual(['New Hampshire', 'New Jersey', 'New Mexico', 'New York']);
    expect(filterRows(SNAPSHOT_ROWS, 'tx').map((r) => r.stateName)).toEqual(['Texas']);
    expect(filterRows(SNAPSHOT_ROWS, '  ')).toHaveLength(50);
    expect(filterRows(SNAPSHOT_ROWS, 'connecticut')).toHaveLength(0);
  });

  it('formats integers with thousands separators', () => {
    expect(formatInt(30_506_523)).toBe('30,506,523');
    expect(formatInt(700_690)).toBe('700,690');
    expect(formatInt(0)).toBe('0');
  });
});

suite('request helpers', () => {
  it('builds the item path with %20 for spaces and round-trips through route', () => {
    expect(pathForState('Texas')).toBe('/api/states/Texas');
    expect(pathForState('District of Columbia')).toBe('/api/states/District%20of%20Columbia');
    for (const r of SNAPSHOT_ROWS) expect(one(pathForState(r.stateName)).population).toBe(r.population);
    expect(route(pathForState('Connecticut')).status).toBe(404);
  });

  it('extracts the addressed state name from a path', () => {
    expect(stateNameFromPath('/api/states/New%20York')).toBe('New York');
    expect(stateNameFromPath('GET /api/states/Texas?name=Ohio')).toBe('Texas');
    expect(stateNameFromPath('/api/states')).toBeNull();
    expect(stateNameFromPath('/api/states/a/b')).toBeNull();
    expect(stateNameFromPath('/api/states/%ZZ')).toBeNull();
    expect(stateNameFromPath('/nope/Texas')).toBeNull();
  });

  it('maps status codes to a display state', () => {
    expect(statusState(route('/api/states'))).toBe('pass');
    expect(statusState(route('/api/states/texas'))).toBe('warn');
    expect(statusState(route('POST /api/states'))).toBe('warn');
  });
});

suite('metrics', () => {
  const total = 333_859_535;
  const texas = SNAPSHOT_ROWS.find((r) => r.stateName === 'Texas')!;

  it('offers population, records and share', () => {
    expect(METRICS.map((m) => m.id)).toEqual(['population', 'records', 'share']);
  });

  it('computes each metric for Texas (30,506,523 people, 254 records)', () => {
    expect(metricValue(texas, 'population', total)).toBe(30_506_523);
    expect(metricValue(texas, 'records', total)).toBe(254);
    expect(metricValue(texas, 'share', total)).toBeCloseTo(9.1375, 3);
    expect(metricValue(texas, 'share', 0)).toBe(0);
  });

  it('shares of all rows add up to 100 %', () => {
    const sum = SNAPSHOT_ROWS.reduce((a, r) => a + metricValue(r, 'share', total), 0);
    expect(sum).toBeCloseTo(100, 6);
  });

  it('formats values per metric', () => {
    expect(formatMetric(30_506_523, 'population')).toBe('30,506,523');
    expect(formatMetric(254, 'records')).toBe('254');
    expect(formatMetric(9.13754, 'share')).toBe('9.14 %');
  });
});

suite('explorerView', () => {
  it('default view: 50 rows by population, California first at a full bar, Connecticut listed as skipped', () => {
    const v = explorerView(SNAPSHOT_ROWS, DEFAULT_EXPLORER);
    expect(v.shown).toBe(50);
    expect(v.total).toBe(50);
    expect(v.sum).toBe(333_859_535);
    expect(v.rows[0]!.row.stateName).toBe('California');
    expect(v.rows[0]!.label).toBe('39,877,642');
    expect(v.rows[0]!.barPct).toBe(100);
    expect(v.rows[1]!.barPct).toBeCloseTo((30_506_523 / 39_877_642) * 100, 6);
    expect(v.skippedVisible).toBe(true);
    expect(v.empty).toBe(false);
  });

  it('records metric: Texas leads with 254 records and the single-record District of Columbia is last', () => {
    const v = explorerView(SNAPSHOT_ROWS, { ...DEFAULT_EXPLORER, metric: 'records' });
    expect(v.rows[0]!.row.stateName).toBe('Texas');
    expect(v.rows[0]!.label).toBe('254');
    expect(v.rows[0]!.barPct).toBe(100);
    expect(v.rows.at(-1)!.row.stateName).toBe('District of Columbia');
    expect(v.rows.reduce((n, r) => n + r.value, 0)).toBe(3135);
  });

  it('share metric orders like population and labels in percent', () => {
    const v = explorerView(SNAPSHOT_ROWS, { ...DEFAULT_EXPLORER, metric: 'share' });
    expect(v.rows.slice(0, 2).map((r) => r.row.stateName)).toEqual(['California', 'Texas']);
    expect(v.rows[0]!.label).toBe('11.94 %');
  });

  it('filter "new": 4 rows, their population sum, bars still relative to the overall maximum', () => {
    const v = explorerView(SNAPSHOT_ROWS, { ...DEFAULT_EXPLORER, query: 'new' });
    expect(v.shown).toBe(4);
    expect(v.sum).toBe(33_040_914);
    expect(v.rows[0]!.row.stateName).toBe('New York');
    expect(v.rows[0]!.barPct).toBeLessThan(100);
    expect(v.skippedVisible).toBe(false);
  });

  it('filter "conn": no aggregated row, only the skipped state', () => {
    const v = explorerView(SNAPSHOT_ROWS, { ...DEFAULT_EXPLORER, query: 'conn' });
    expect(v.shown).toBe(0);
    expect(v.sum).toBe(0);
    expect(v.skippedVisible).toBe(true);
    expect(v.empty).toBe(false);
  });

  it('a filter that matches nothing is flagged empty', () => {
    expect(explorerView(SNAPSHOT_ROWS, { ...DEFAULT_EXPLORER, query: 'zzz' }).empty).toBe(true);
  });

  it('sorts by name in both directions regardless of metric', () => {
    expect(explorerView(SNAPSHOT_ROWS, { ...DEFAULT_EXPLORER, sortBy: 'name', dir: 'asc', metric: 'records' }).rows[0]!.row.stateName).toBe('Alabama');
    expect(explorerView(SNAPSHOT_ROWS, { ...DEFAULT_EXPLORER, sortBy: 'name', dir: 'desc' }).rows[0]!.row.stateName).toBe('Wyoming');
  });
});
