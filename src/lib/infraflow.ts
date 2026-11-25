/**
 * InfraFlow Mission Control — TypeScript re-implementation of the repository's portable KPI definitions
 * (src/infraflow/kpis.py `compute` and src/infraflow/scoring.py at revision bf7ebe0).
 *
 * Pure and deterministic: every date comparison is relative to the dataset cutoff passed in `meta.asOf`
 * (2026-11-16 in the shipped data), never to the wall clock. Finance, capacity and gate results are NOT
 * recomputed here; gate outcomes arrive precomputed per record (`gatesFailed`) from the Python model.
 */

export type Status =
  | 'SUBMITTED'
  | 'NEEDS_INFO'
  | 'TRIAGED'
  | 'ASSESSMENT'
  | 'READY_FOR_DECISION'
  | 'DEFERRED'
  | 'APPROVED'
  | 'HANDOFF'
  | 'IN_DELIVERY'
  | 'COMPLETE'
  | 'REJECTED'
  | 'ROUTED_OUT';

export type Band = 'Highest' | 'High' | 'Medium' | 'Low' | 'Lowest' | 'Unscored';

export interface Demand {
  id: string;
  title: string;
  status: Status;
  category: string;
  team: string;
  requestedAt: string | null;
  dueAt: string | null;
  hasOwner: boolean;
  /** impact, urgency, risk reduction, strategic alignment — each 0..5 */
  scores: (number | null)[];
  blocked: boolean;
  nextReviewAt: string | null;
  /** [decided on, outcome] rows of the decision register */
  decisions: [string, string][];
  /** [date, new status] status events up to the cutoff, oldest first */
  history: [string, Status][];
  /** number of mandatory intake fields that are empty */
  missingRequired: number;
  /** failed gates from the Python model; null when the demand is not in the review queue */
  gatesFailed: string[] | null;
}

export interface Meta {
  asOf: string;
  statusOrder: Status[];
  terminal: Status[];
  preDecision: Status[];
  scoreWeights: { impact: number; urgency: number; risk_reduction: number; strategic: number };
  priorityBands: [number, string][];
  staleDays: number;
  teams: Record<string, string>;
}

export interface Filter {
  /** null = no filter on this dimension; an empty array selects nothing */
  statuses: readonly string[] | null;
  categories: readonly string[] | null;
}

export interface KpiValues {
  total_demands: number;
  open_demands: number;
  by_status: Record<string, number>;
  open_by_priority: Record<string, number>;
  open_by_team: Record<string, number>;
  open_by_category: Record<string, number>;
  intake_last_7_days: number;
  intake_by_month: Record<string, number>;
  overdue_open: number;
  blocked_open: number;
  stale_open: number;
  unassigned_open: number;
  unassigned_pct: number | null;
  completeness_pct: number | null;
  approval_pending: number;
  deferred_review_due_30d: number;
  median_triage_business_days: number | null;
  median_lead_time_days: number | null;
  completed_total: number;
  throughput_by_month: Record<string, number>;
  on_time_delivery_pct: number | null;
  stage_ageing_median_days: Record<string, number>;
  stage_ageing_days: Record<string, number>;
  decision_outcomes: Record<string, number>;
  routed_out: number;
  high_priority_not_approvable: number;
}

export interface KpiResult {
  values: KpiValues;
  /** Record ids behind each count, sorted. For the two ratios the list holds the exceptions (incomplete / late). */
  idLists: Record<string, string[]>;
}

/* ---------- date helpers (whole days, UTC, no wall clock) ---------- */

/** Days since the Unix epoch for the date part of an ISO string. */
export function dayNumber(iso: string): number {
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  const d = Number(iso.slice(8, 10));
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000);
}

/** Monday–Friday days strictly after `start` up to and including `end` (kpis.py:19-26). No holiday calendar. */
export function businessDays(start: string, end: string): number {
  const b = dayNumber(end);
  let n = 0;
  // 1970-01-01 was a Thursday: (day + 4) % 7 gives 0 = Sunday … 6 = Saturday.
  for (let a = dayNumber(start) + 1; a <= b; a++) {
    const dow = (((a + 4) % 7) + 7) % 7;
    if (dow !== 0 && dow !== 6) n++;
  }
  return n;
}

/** Python `statistics.median`: mean of the two middle values for an even count. null for an empty list. */
export function median(xs: readonly number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

const round1 = (x: number): number => Math.round(x * 10) / 10;

/* ---------- scoring (scoring.py:23-34) ---------- */

export function priorityScore(scores: readonly (number | null)[], w: Meta['scoreWeights']): number | null {
  const [impact, urgency, risk, strategic] = scores;
  const vals = [impact, urgency, risk, strategic];
  if (vals.some((v) => v === null || v === undefined || v < 0 || v > 5)) return null;
  const sum = w.impact * impact! + w.urgency * urgency! + w.risk_reduction * risk! + w.strategic * strategic!;
  return round1((100 * sum) / 5);
}

export function priorityBand(score: number | null, bands: Meta['priorityBands']): Band {
  if (score === null) return 'Unscored';
  const hit = bands.find(([floor]) => score >= floor);
  return (hit ? hit[1] : 'Unscored') as Band;
}

/* ---------- per-record predicates ---------- */

export const isOpen = (d: Demand, meta: Meta): boolean => !meta.terminal.includes(d.status);

export function lastActivity(d: Demand): string | null {
  return d.history.length ? d.history[d.history.length - 1]![0] : null;
}

/** Open and required-by date strictly before the cutoff. A demand due on the cutoff day is not overdue. */
export function isOverdue(d: Demand, meta: Meta): boolean {
  return isOpen(d, meta) && d.dueAt !== null && dayNumber(d.dueAt) < dayNumber(meta.asOf);
}

/**
 * The KPI definition of "stale" (kpis.py:69-71): open, not deferred, and no status event for
 * `staleDays` (14) days or more before the cutoff. The repository also has a 7-day Jira filter and a
 * `STALE_DATA` register code with different meanings; those are deliberately not ported.
 */
export function isStale(d: Demand, meta: Meta): boolean {
  if (!isOpen(d, meta) || d.status === 'DEFERRED') return false;
  const last = lastActivity(d);
  return last === null || dayNumber(meta.asOf) - dayNumber(last) >= meta.staleDays;
}

export interface Flags {
  overdue: boolean;
  blocked: boolean;
  stale: boolean;
  unassigned: boolean;
}

export function flagsOf(d: Demand, meta: Meta): Flags {
  const open = isOpen(d, meta);
  return { overdue: isOverdue(d, meta), blocked: open && d.blocked, stale: isStale(d, meta), unassigned: open && !d.hasOwner };
}

/* ---------- filtering ---------- */

/** Status AND category. `null` leaves a dimension unfiltered. */
export function filterDemands<T extends Pick<Demand, 'status' | 'category'>>(rows: readonly T[], f: Filter): T[] {
  return rows.filter(
    (d) => (f.statuses === null || f.statuses.includes(d.status)) && (f.categories === null || f.categories.includes(d.category)),
  );
}

/* ---------- KPI computation (kpis.py:44-129) ---------- */

function countBy<T>(xs: readonly T[], key: (x: T) => string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const k of xs.map(key).sort()) out[k] = (out[k] ?? 0) + 1;
  return out;
}

const ids = (xs: readonly Demand[]): string[] => xs.map((d) => d.id).sort();

function firstEvent(d: Demand, status: Status): string | null {
  const hit = d.history.find(([, s]) => s === status);
  return hit ? hit[0] : null;
}

export function computeKpis(input: readonly Demand[], meta: Meta): KpiResult {
  const asOf = dayNumber(meta.asOf);
  const rows = input.filter((d) => d.requestedAt === null || dayNumber(d.requestedAt) <= asOf);
  const open = rows.filter((d) => isOpen(d, meta));
  const L: Record<string, string[]> = {};
  const bandOf = (d: Demand) => priorityBand(priorityScore(d.scores, meta.scoreWeights), meta.priorityBands);

  L.open_demands = ids(open);

  // by_status counts ALL demands; every other breakdown counts open demands only.
  const by_status: Record<string, number> = {};
  for (const s of meta.statusOrder) by_status[s] = rows.filter((d) => d.status === s).length;

  const open_by_priority: Record<string, number> = {};
  for (const [, name] of meta.priorityBands) open_by_priority[name] = open.filter((d) => bandOf(d) === name).length;

  const open_by_team: Record<string, number> = {};
  for (const t of Object.keys(meta.teams)) open_by_team[t] = open.filter((d) => d.team === t).length;

  const intake = rows.filter((d) => d.requestedAt !== null && dayNumber(d.requestedAt) >= asOf - 6);
  L.intake_last_7_days = ids(intake);

  const overdue = open.filter((d) => isOverdue(d, meta));
  L.overdue_open = ids(overdue);
  const blocked = open.filter((d) => d.blocked);
  L.blocked_open = ids(blocked);
  const stale = open.filter((d) => isStale(d, meta));
  L.stale_open = ids(stale);
  const unassigned = open.filter((d) => !d.hasOwner);
  L.unassigned_open = ids(unassigned);

  const scope = rows.filter((d) => d.status !== 'ROUTED_OUT');
  const incomplete = scope.filter((d) => d.missingRequired > 0);
  L.completeness_pct = ids(incomplete);

  const pending = open.filter((d) => d.status === 'READY_FOR_DECISION');
  L.approval_pending = ids(pending);
  const reviewDue = open.filter(
    (d) => d.status === 'DEFERRED' && d.nextReviewAt !== null && dayNumber(d.nextReviewAt) <= asOf + 30,
  );
  L.deferred_review_due_30d = ids(reviewDue);

  const triage: number[] = [];
  const lead: number[] = [];
  const onTime: [string, boolean][] = [];
  const done: Demand[] = [];
  const doneMonths: string[] = [];
  for (const d of rows) {
    const submitted = firstEvent(d, 'SUBMITTED');
    const triaged = firstEvent(d, 'TRIAGED');
    const completed = firstEvent(d, 'COMPLETE');
    if (submitted && triaged) triage.push(businessDays(submitted, triaged));
    if (d.status === 'COMPLETE' && submitted && completed) {
      lead.push(dayNumber(completed) - dayNumber(submitted));
      done.push(d);
      doneMonths.push(completed.slice(0, 7));
      if (d.dueAt) onTime.push([d.id, dayNumber(completed) <= dayNumber(d.dueAt)]);
    }
  }
  L.completed_total = ids(done);
  L.on_time_delivery_pct = onTime
    .filter(([, ok]) => !ok)
    .map(([id]) => id)
    .sort();

  const stage_ageing_days: Record<string, number> = {};
  const ageByStatus: Record<string, number[]> = {};
  for (const d of open) {
    const same = d.history.filter(([, s]) => s === d.status);
    if (!same.length) continue;
    const age = asOf - dayNumber(same[same.length - 1]![0]);
    stage_ageing_days[d.id] = age;
    (ageByStatus[d.status] ??= []).push(age);
  }
  const stage_ageing_median_days: Record<string, number> = {};
  for (const [s, xs] of Object.entries(ageByStatus)) stage_ageing_median_days[s] = median(xs)!;

  // Counts decision ROWS dated on or before the cutoff, not demands.
  const decision_outcomes: Record<string, number> = { approved: 0, deferred: 0, rejected: 0 };
  for (const d of rows)
    for (const [on, outcome] of d.decisions)
      if (dayNumber(on) <= asOf) decision_outcomes[outcome] = (decision_outcomes[outcome] ?? 0) + 1;

  const routed = rows.filter((d) => d.status === 'ROUTED_OUT');
  L.routed_out = ids(routed);

  const notApprovable = rows.filter((d) => {
    const inQueue = meta.preDecision.includes(d.status) || d.status === 'DEFERRED';
    const band = bandOf(d);
    return inQueue && (band === 'Highest' || band === 'High') && (d.gatesFailed?.length ?? 0) > 0;
  });
  L.high_priority_not_approvable = ids(notApprovable);

  const values: KpiValues = {
    total_demands: rows.length,
    open_demands: open.length,
    by_status,
    open_by_priority,
    open_by_team,
    open_by_category: countBy(open, (d) => d.category),
    intake_last_7_days: intake.length,
    intake_by_month: countBy(
      rows.filter((d) => d.requestedAt !== null),
      (d) => d.requestedAt!.slice(0, 7),
    ),
    overdue_open: overdue.length,
    blocked_open: blocked.length,
    stale_open: stale.length,
    unassigned_open: unassigned.length,
    unassigned_pct: open.length ? round1((100 * unassigned.length) / open.length) : null,
    completeness_pct: scope.length ? round1((100 * (scope.length - incomplete.length)) / scope.length) : null,
    approval_pending: pending.length,
    deferred_review_due_30d: reviewDue.length,
    median_triage_business_days: median(triage),
    median_lead_time_days: median(lead),
    completed_total: done.length,
    throughput_by_month: countBy(doneMonths, (m) => m),
    on_time_delivery_pct: onTime.length ? round1((100 * onTime.filter(([, ok]) => ok).length) / onTime.length) : null,
    stage_ageing_median_days,
    stage_ageing_days,
    decision_outcomes,
    routed_out: routed.length,
    high_priority_not_approvable: notApprovable.length,
  };
  return { values, idLists: L };
}

/* ---------- table sorting ---------- */

export type SortKey = 'id' | 'title' | 'status' | 'category' | 'team' | 'score' | 'due';
export type SortDir = 'asc' | 'desc';

/** Stable sort for the record table; ties fall back to the record id. Null scores and dates sort last. */
export function sortDemands(rows: readonly Demand[], key: SortKey, dir: SortDir, meta: Meta): Demand[] {
  const sign = dir === 'asc' ? 1 : -1;
  const value = (d: Demand): string | number | null => {
    switch (key) {
      case 'id':
        return d.id;
      case 'title':
        return d.title.toLowerCase();
      case 'status':
        return meta.statusOrder.indexOf(d.status);
      case 'category':
        return d.category;
      case 'team':
        return d.team;
      case 'score':
        return priorityScore(d.scores, meta.scoreWeights);
      case 'due':
        return d.dueAt;
    }
  };
  return [...rows].sort((a, b) => {
    const va = value(a);
    const vb = value(b);
    if (va === vb) return a.id < b.id ? -1 : 1;
    if (va === null) return 1;
    if (vb === null) return -1;
    return (va < vb ? -1 : 1) * sign;
  });
}

/* ---------- formatting shared by the server render and the client ---------- */

export const fmtInt = (n: number): string => n.toLocaleString('en-GB');
export const fmtPct = (n: number | null): string => (n === null ? 'n/a' : `${n.toFixed(1)} %`);
export const fmtDays = (n: number | null): string => (n === null ? 'n/a' : `${Number.isInteger(n) ? n : n.toFixed(1)} d`);

export interface ReadoutItem {
  key: string;
  label: string;
  value: string;
}

/** The KPI tiles of the demo, in display order. Used by the server render and by the client update. */
export function kpiReadout(v: KpiValues): ReadoutItem[] {
  return [
    { key: 'total_demands', label: 'Demands', value: fmtInt(v.total_demands) },
    { key: 'open_demands', label: 'Open', value: fmtInt(v.open_demands) },
    { key: 'approval_pending', label: 'Awaiting decision', value: fmtInt(v.approval_pending) },
    { key: 'high_priority_not_approvable', label: 'High priority, gate failed', value: fmtInt(v.high_priority_not_approvable) },
    { key: 'overdue_open', label: 'Overdue', value: fmtInt(v.overdue_open) },
    { key: 'blocked_open', label: 'Blocked', value: fmtInt(v.blocked_open) },
    { key: 'stale_open', label: 'Stale, 14 d+', value: fmtInt(v.stale_open) },
    { key: 'unassigned_open', label: 'No owner', value: fmtInt(v.unassigned_open) },
    { key: 'completeness_pct', label: 'Intake complete', value: fmtPct(v.completeness_pct) },
    { key: 'median_triage_business_days', label: 'Median triage, working days', value: fmtDays(v.median_triage_business_days) },
    { key: 'median_lead_time_days', label: 'Median lead time', value: fmtDays(v.median_lead_time_days) },
    { key: 'on_time_delivery_pct', label: 'Delivered on time', value: fmtPct(v.on_time_delivery_pct) },
  ];
}

/** One-sentence summary for the live region. */
export function summarise(v: KpiValues, totalInDataset: number): string {
  if (v.total_demands === 0) return `No demands match this filter (0 of ${totalInDataset}).`;
  return `${v.total_demands} of ${totalInDataset} demands shown: ${v.open_demands} open, ${v.approval_pending} awaiting decision, ${v.overdue_open} overdue.`;
}

/* ---------- filter controls ---------- */

export interface StatusPreset {
  id: 'all' | 'open' | 'board' | 'funded';
  label: string;
  statuses: Status[];
}

/** The four status presets of the demo, in lifecycle order. `funded` is the repository's FUNDED set. */
export function statusPresets(meta: Meta & { funded: Status[] }): StatusPreset[] {
  const inOrder = (xs: readonly Status[]) => meta.statusOrder.filter((s) => xs.includes(s));
  return [
    { id: 'all', label: 'All', statuses: [...meta.statusOrder] },
    { id: 'open', label: 'Open', statuses: meta.statusOrder.filter((s) => !meta.terminal.includes(s)) },
    { id: 'board', label: 'Decision board', statuses: inOrder(['READY_FOR_DECISION', 'DEFERRED']) },
    { id: 'funded', label: 'Funded', statuses: inOrder(meta.funded) },
  ];
}

/**
 * Maps the state of the controls to a filter: all status boxes ticked means "no status filter" (null),
 * none ticked selects nothing, and an empty category value means "all categories".
 */
export function filterFromSelection(checkedStatuses: readonly string[], statusCount: number, category: string): Filter {
  return {
    statuses: checkedStatuses.length === statusCount ? null : [...checkedStatuses],
    categories: category ? [category] : null,
  };
}

/** Id of the preset whose status set equals the ticked boxes, if any. */
export function activePreset(checkedStatuses: readonly string[], presets: readonly StatusPreset[]): StatusPreset['id'] | null {
  const key = [...checkedStatuses].sort().join(',');
  return presets.find((p) => [...p.statuses].sort().join(',') === key)?.id ?? null;
}

/** Width of the filled bar as a percentage of its track (selected / all for one status). */
export function barPercent(selected: number, all: number): number {
  return all > 0 ? (selected / all) * 100 : 0;
}

export const fmtEur = (n: number): string => `€${fmtInt(n)}`;
