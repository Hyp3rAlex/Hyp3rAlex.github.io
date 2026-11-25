import { describe, expect, it } from 'vitest';
import data from '../../src/data/demo/infraflow.json';
import {
  businessDays,
  computeKpis,
  filterDemands,
  flagsOf,
  isOverdue,
  isStale,
  activePreset,
  barPercent,
  filterFromSelection,
  fmtDays,
  fmtEur,
  fmtInt,
  fmtPct,
  kpiReadout,
  median,
  priorityBand,
  priorityScore,
  sortDemands,
  statusPresets,
  summarise,
  type Demand,
  type KpiValues,
  type Meta,
} from '../../src/lib/infraflow';

const meta = data.meta as unknown as Meta & { funded: Demand['status'][] };
const demands = data.demands as unknown as Demand[];
const fixtures = data.expected.fixtures;

/*
 * Provenance of the expected values
 * ---------------------------------
 * Fixture `all` (50 demands) equals the KPI values in the repository's own committed
 * reports/report_facts.json at revision bf7ebe0 — those are the project's published numbers.
 *
 * The repository defines its KPIs for the full set only. The eight subset fixtures were produced
 * during the audit (25 Nov 2026) by calling the repository's `kpis.compute` on a filtered view:
 * demand, status-event and decision rows restricted to the subset (status AND category), while the
 * finance, capacity and gate results stayed at whole-portfolio level. That filter definition is the
 * auditor's, not the repository's. The site's demo uses exactly the same definition.
 */

describe('scoring', () => {
  it('reproduces the repository test vectors (tests/test_scoring.py)', () => {
    const w = meta.scoreWeights;
    expect(priorityScore([5, 4, 3, 4], w)).toBe(82);
    expect(priorityScore([5, 5, 5, 5], w)).toBe(100);
    expect(priorityScore([0, 0, 0, 0], w)).toBe(0);
    expect(priorityScore([4, 3, 3, 4], w)).toBe(70);
    expect(priorityBand(82, meta.priorityBands)).toBe('Highest');
    expect(priorityBand(70, meta.priorityBands)).toBe('High');
    expect(priorityBand(0, meta.priorityBands)).toBe('Lowest');
  });

  it('returns Unscored instead of guessing when an input is missing or out of range', () => {
    expect(priorityScore([5, null, 3, 4], meta.scoreWeights)).toBeNull();
    expect(priorityScore([6, 4, 3, 4], meta.scoreWeights)).toBeNull();
    expect(priorityBand(null, meta.priorityBands)).toBe('Unscored');
  });

  it('matches the Python score of every one of the 50 records', () => {
    const expected = data.expected.priorityScores as Record<string, number>;
    for (const d of demands) expect(priorityScore(d.scores, meta.scoreWeights), d.id).toBe(expected[d.id]);
  });
});

describe('helpers', () => {
  it('counts working days like kpis.py (tests/test_kpis.py vectors)', () => {
    expect(businessDays('2026-10-05', '2026-10-14')).toBe(7);
    expect(businessDays('2026-11-13', '2026-11-16')).toBe(1);
    expect(businessDays('2026-11-16', '2026-11-16')).toBe(0);
  });

  it('uses the Python median (mean of the two middle values)', () => {
    expect(median([])).toBeNull();
    expect(median([3, 1, 2])).toBe(2);
    expect(median([13, 14, 6, 20])).toBe(13.5);
  });
});

describe('KPI port reproduces every fixture', () => {
  for (const f of fixtures) {
    it(`${f.name} (${f.count} demands)`, () => {
      const rows = filterDemands(demands, f.filter);
      expect(rows.map((d) => d.id).sort()).toEqual(f.ids);

      const { values, idLists } = computeKpis(rows, meta);
      const expected = f.values as unknown as Record<string, unknown>;
      // The repository's 27th portable KPI, open_by_site, is not shipped: site labels are neutralised on this site.
      const ported = data.expected.portableKpis;
      expect(ported).toHaveLength(26);
      for (const k of ported) expect(values[k as keyof KpiValues], k).toEqual(expected[k]);

      for (const [k, list] of Object.entries(f.idLists)) expect(idLists[k], k).toEqual([...list].sort());
    });
  }
});

describe('full set equals the repository report facts', () => {
  const { values, idLists } = computeKpis(demands, meta);

  it('headline counts', () => {
    expect(values.total_demands).toBe(50);
    expect(values.open_demands).toBe(37);
    expect(values.approval_pending).toBe(5);
    expect(values.high_priority_not_approvable).toBe(10);
    expect(values.unassigned_pct).toBe(8.1);
    expect(values.completeness_pct).toBe(91.7);
    expect(values.on_time_delivery_pct).toBe(77.8);
    expect(values.median_triage_business_days).toBe(3);
    expect(values.median_lead_time_days).toBe(49);
  });

  it('trap 1: by_status covers all demands, the other breakdowns only open ones', () => {
    expect(Object.values(values.by_status).reduce((a, b) => a + b, 0)).toBe(50);
    expect(Object.values(values.open_by_priority).reduce((a, b) => a + b, 0)).toBe(37);
    expect(values.open_by_team).toEqual({ PLAT: 19, NET: 8, SEC: 10 });
  });

  it('trap 2: overdue is strict — due on the cutoff day is not overdue', () => {
    expect(idLists.overdue_open).toEqual(['ORION-REQ-012', 'ORION-REQ-015', 'ORION-REQ-029', 'ORION-REQ-040']);
    const sample = { ...demands.find((d) => d.id === 'ORION-REQ-012')! };
    expect(isOverdue({ ...sample, dueAt: meta.asOf }, meta)).toBe(false);
    expect(isOverdue({ ...sample, dueAt: '2026-11-15' }, meta)).toBe(true);
    expect(isOverdue({ ...sample, dueAt: '2026-11-15', status: 'COMPLETE' }, meta)).toBe(false);
  });

  it('trap 3: stale is the 14-day KPI definition, relative to the cutoff, and excludes deferred demands', () => {
    expect(values.stale_open).toBe(8);
    const base = { ...demands.find((d) => d.id === 'ORION-REQ-041')!, status: 'ASSESSMENT' as const };
    const at = (day: string) => ({ ...base, history: [[day, 'ASSESSMENT']] as Demand['history'] });
    expect(isStale(at('2026-11-02'), meta)).toBe(true); // exactly 14 days
    expect(isStale(at('2026-11-03'), meta)).toBe(false); // 13 days: the 7-day Jira filter would flag it, the KPI does not
    expect(isStale({ ...at('2026-10-01'), status: 'DEFERRED' }, meta)).toBe(false);
    expect(isStale({ ...at('2026-10-01'), status: 'COMPLETE' }, meta)).toBe(false);
    expect(isStale({ ...base, history: [] }, meta)).toBe(true);
  });

  it('trap 4: completeness excludes routed-out records', () => {
    expect(idLists.completeness_pct).toEqual(['ORION-REQ-031', 'ORION-REQ-039', 'ORION-REQ-041', 'ORION-REQ-044']);
    expect(values.routed_out).toBe(2);
  });

  it('trap 6: awaiting decision is not the whole review queue', () => {
    expect(values.approval_pending).toBe(values.by_status.READY_FOR_DECISION);
    expect(values.approval_pending).toBeLessThan(values.high_priority_not_approvable);
  });

  it('decision outcomes count decision rows', () => {
    expect(values.decision_outcomes).toEqual({ approved: 21, deferred: 4, rejected: 2 });
  });
});

describe('empty selection', () => {
  it('trap 7: ratios and medians are null, never 0 or NaN', () => {
    const { values } = computeKpis([], meta);
    expect(values.total_demands).toBe(0);
    expect(values.unassigned_pct).toBeNull();
    expect(values.completeness_pct).toBeNull();
    expect(values.on_time_delivery_pct).toBeNull();
    expect(values.median_triage_business_days).toBeNull();
    expect(values.median_lead_time_days).toBeNull();
    expect(Object.keys(values.by_status)).toHaveLength(12);
  });

  it('an empty array selects nothing, null selects everything', () => {
    expect(filterDemands(demands, { statuses: [], categories: null })).toHaveLength(0);
    expect(filterDemands(demands, { statuses: null, categories: null })).toHaveLength(50);
  });
});

describe('record table helpers', () => {
  it('flags agree with the KPI id lists', () => {
    const { idLists } = computeKpis(demands, meta);
    const flagged = (k: 'overdue' | 'blocked' | 'stale' | 'unassigned') =>
      demands
        .filter((d) => flagsOf(d, meta)[k])
        .map((d) => d.id)
        .sort();
    expect(flagged('overdue')).toEqual(idLists.overdue_open);
    expect(flagged('blocked')).toEqual(idLists.blocked_open);
    expect(flagged('stale')).toEqual(idLists.stale_open);
    expect(flagged('unassigned')).toEqual(idLists.unassigned_open);
  });

  it('sorts by score in both directions without mutating the input', () => {
    const before = demands.map((d) => d.id);
    const desc = sortDemands(demands, 'score', 'desc', meta);
    const asc = sortDemands(demands, 'score', 'asc', meta);
    const s = (d: Demand) => priorityScore(d.scores, meta.scoreWeights)!;
    expect(s(desc[0]!)).toBeGreaterThanOrEqual(s(desc[49]!));
    expect(s(asc[0]!)).toBeLessThanOrEqual(s(asc[49]!));
    expect(demands.map((d) => d.id)).toEqual(before);
    expect(sortDemands(demands, 'status', 'asc', meta)[0]!.status).toBe('SUBMITTED');
  });
});

describe('shipped dataset', () => {
  it('carries no site names or sector-specific wording from the source titles', () => {
    expect(JSON.stringify(data)).not.toMatch(/Munich|Toulouse|Madrid|Bremen|flight|avionic|satellite|hangar|programme/i);
    expect(data.provenance.neutralised).toMatch(/all numeric and categorical fields unchanged/);
  });

  it('carries provenance and stays small', () => {
    expect(data.provenance.sourceCommit).toBe('bf7ebe0');
    expect(data.provenance.asOf).toBe('2026-11-16');
    expect(data.provenance.notice).toMatch(/synthetic/i);
    expect(JSON.stringify(data).length).toBeLessThan(80_000);
  });

  it('exception register: 19 entries, 6 critical, so the report state is provisional', () => {
    expect(data.portfolio.exceptions).toHaveLength(19);
    expect(data.portfolio.exceptions.filter((e) => e.severity === 'CRITICAL')).toHaveLength(6);
    expect(data.portfolio.exceptionCounts).toEqual({ CRITICAL: 6, WARNING: 12, INFO: 1 });
    expect(data.portfolio.provisional).toBe(true);
  });
});

describe('filter controls', () => {
  const presets = statusPresets(meta);
  const fixture = (name: string) => data.expected.fixtures.find((f) => f.name === name)!;

  it('presets select the same records as the audit fixtures', () => {
    const idsFor = (id: string) =>
      filterDemands(demands, filterFromSelection(presets.find((p) => p.id === id)!.statuses, 12, ''))
        .map((d) => d.id)
        .sort();
    expect(idsFor('all')).toEqual(fixture('all').ids);
    expect(idsFor('open')).toEqual(fixture('open_only').ids);
    expect(idsFor('board')).toEqual(fixture('decision_board').ids);
    expect(idsFor('funded')).toEqual(fixture('delivery').ids);
  });

  it('maps the controls to a filter', () => {
    expect(filterFromSelection(meta.statusOrder, 12, '')).toEqual({ statuses: null, categories: null });
    expect(filterFromSelection([], 12, '')).toEqual({ statuses: [], categories: null });
    expect(filterFromSelection(['ASSESSMENT'], 12, 'security')).toEqual({ statuses: ['ASSESSMENT'], categories: ['security'] });
    const rows = filterDemands(demands, filterFromSelection(['ASSESSMENT'], 12, 'security'));
    expect(rows.map((d) => d.id)).toEqual(fixture('assessment_x_security').ids);
  });

  it('recognises which preset is active', () => {
    expect(activePreset(meta.statusOrder, presets)).toBe('all');
    expect(activePreset(['DEFERRED', 'READY_FOR_DECISION'], presets)).toBe('board');
    expect(activePreset(['DEFERRED'], presets)).toBeNull();
  });

  it('bar width is selected over all, and 0 for an empty status', () => {
    expect(barPercent(2, 4)).toBe(50);
    expect(barPercent(9, 9)).toBe(100);
    expect(barPercent(0, 0)).toBe(0);
  });
});

describe('read-out and formatting', () => {
  it('formats numbers, percentages, days and euros', () => {
    expect(fmtInt(1050000)).toBe('1,050,000');
    expect(fmtEur(936700)).toBe('€936,700');
    expect(fmtPct(91.7)).toBe('91.7 %');
    expect(fmtPct(100)).toBe('100.0 %');
    expect(fmtPct(null)).toBe('n/a');
    expect(fmtDays(49)).toBe('49 d');
    expect(fmtDays(13.5)).toBe('13.5 d');
    expect(fmtDays(null)).toBe('n/a');
  });

  it('builds the twelve tiles for the full set', () => {
    const tiles = kpiReadout(computeKpis(demands, meta).values);
    expect(tiles).toHaveLength(12);
    const byKey = Object.fromEntries(tiles.map((t) => [t.key, t.value]));
    expect(byKey).toMatchObject({
      total_demands: '50',
      open_demands: '37',
      approval_pending: '5',
      high_priority_not_approvable: '10',
      overdue_open: '4',
      blocked_open: '3',
      stale_open: '8',
      unassigned_open: '3',
      completeness_pct: '91.7 %',
      median_triage_business_days: '3 d',
      median_lead_time_days: '49 d',
      on_time_delivery_pct: '77.8 %',
    });
    expect(Object.keys(data.expected.definitions)).toEqual(expect.arrayContaining(tiles.map((t) => t.key)));
  });

  it('shows n/a, not zero, for an empty selection', () => {
    const byKey = Object.fromEntries(kpiReadout(computeKpis([], meta).values).map((t) => [t.key, t.value]));
    expect(byKey.total_demands).toBe('0');
    expect(byKey.completeness_pct).toBe('n/a');
    expect(byKey.median_lead_time_days).toBe('n/a');
  });

  it('summarises a selection for the live region', () => {
    expect(summarise(computeKpis(demands, meta).values, 50)).toBe('50 of 50 demands shown: 37 open, 5 awaiting decision, 4 overdue.');
    expect(summarise(computeKpis([], meta).values, 50)).toBe('No demands match this filter (0 of 50).');
  });

  it('sorts by every column key', () => {
    const first = (key: Parameters<typeof sortDemands>[1], dir: 'asc' | 'desc') => sortDemands(demands, key, dir, meta)[0]!;
    expect(first('id', 'asc').id).toBe('ORION-REQ-001');
    expect(first('id', 'desc').id).toBe('ORION-REQ-050');
    expect(first('category', 'asc').category).toBe('access');
    expect(first('team', 'asc').team).toBe('NET');
    expect(first('status', 'desc').status).toBe('ROUTED_OUT');
    const titles = sortDemands(demands, 'title', 'asc', meta).map((d) => d.title.toLowerCase());
    expect(titles).toEqual([...titles].sort());
    const due = sortDemands(demands, 'due', 'asc', meta).map((d) => d.dueAt!);
    expect(due).toEqual([...due].sort());
  });
});
