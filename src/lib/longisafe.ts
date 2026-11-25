/**
 * LongiSafe Lab — TypeScript port of the monitor rules used by the browser demo.
 *
 * Reference: python/longisafe/analysis.py and config.py at revision 12d8247 of
 * github.com/Hyp3rAlex/longisafe-lab. Formulas, thresholds, the 1e-9 time tolerance and the
 * debounce are kept as in the Python reference; tests/unit/longisafe.test.ts checks the port
 * against verdicts computed by that reference.
 *
 * Like the original analysis module, nothing here reads fault truth: the functions take
 * observed signals and a threshold configuration, and nothing else.
 *
 * This is an educational re-implementation on synthetic data. It is not safety tooling.
 */

export interface MonitorConfig {
  nominal_dt_s: number;
  gap_factor: number;
  filter_window_s: number;
  evidence_s: number;
  coherence_mps2: number;
  stale_speed_mps: number;
  motion_accel_mps2: number;
  decel_error_mps2: number;
  response_delay_s: number;
  min_request_mps2: number;
  min_speed_mps: number;
  max_speed_mps: number;
  max_abs_accel_mps2: number;
}

/** python/longisafe/config.py:6-18 */
export const DEFAULT_CONFIG: Readonly<MonitorConfig> = Object.freeze({
  nominal_dt_s: 0.05,
  gap_factor: 3,
  filter_window_s: 0.2,
  evidence_s: 0.3,
  coherence_mps2: 0.7,
  stale_speed_mps: 0.005,
  motion_accel_mps2: 0.5,
  decel_error_mps2: 0.6,
  response_delay_s: 0.2,
  min_request_mps2: 0.2,
  min_speed_mps: 0.2,
  max_speed_mps: 100,
  max_abs_accel_mps2: 20,
});

/** Tolerance applied to every time comparison in the reference. */
export const EPS = 1e-9;

/** python/longisafe/config.py:20-26 — every value finite and > 0, plus two ordering rules. */
export function validateConfig(c: MonitorConfig): MonitorConfig {
  for (const [k, v] of Object.entries(c)) {
    if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) throw new RangeError(`Invalid config: ${k}`);
  }
  if (c.gap_factor <= 1 || c.max_speed_mps <= c.min_speed_mps) throw new RangeError('Invalid config ordering');
  return c;
}

/** Observed signals, columnar. Arrays share one length; time is strictly increasing (the importer guarantees it). */
export interface Signals {
  time_s: readonly number[];
  vehicle_speed_mps: readonly number[];
  accel_long_mps2: readonly number[];
  /** Optional context channel. Absent → MON-005 is NOT_EVALUATED. */
  requested_decel_mps2?: readonly number[];
  brake_pedal_pct?: readonly number[];
  regen_force_N?: readonly number[];
  friction_force_N?: readonly number[];
  /** Header of the source CSV, for the MON-010 context inventory. Defaults to the channels present above. */
  columns?: readonly string[];
}

export type Status = 'PASS' | 'FAIL' | 'WARN' | 'NOT_EVALUATED';
export type RuleId = `MON-0${number}`;

export interface RuleResult {
  rule_id: string;
  status: Status;
  t_start_s: number | null;
  t_end_s: number | null;
  detection_time_s: number | null;
  start_csv_row: number | null;
  end_csv_row: number | null;
  measured_value: number | null;
  threshold: number | string | null;
  units: string;
  rationale: string;
}

export interface MonitorSeries {
  /** MON-003: |Δv/Δt − mean measured acceleration| over the trailing window, m/s². */
  residual: (number | null)[];
  /** MON-004: 1 when speed is near-stationary while measured acceleration says the vehicle is moving. */
  stale: (number | null)[];
  /** MON-005: undershoot of the requested net deceleration, m/s². Null where no request is active. */
  error: (number | null)[];
  eligible: boolean[];
}

export interface Evaluation {
  rules: RuleResult[];
  series: MonitorSeries;
}

export const RULE_NAMES: Readonly<Record<string, string>> = {
  'MON-001': 'Timing gaps',
  'MON-002': 'Speed / acceleration range',
  'MON-003': 'Speed–acceleration coherence',
  'MON-004': 'Frozen speed signal',
  'MON-005': 'Deceleration-demand tracking',
  'MON-006': 'Pedal plausibility',
  'MON-007': 'Force residual',
  'MON-008': 'Regen/friction transition',
  'MON-009': 'Terminal-stop comfort',
  'MON-010': 'Context inventory',
};

const PLACEHOLDERS: readonly (readonly [string, string])[] = [
  ['MON-006', 'No calibrated pedal-to-force mapping; zero accelerator is not a fault criterion'],
  ['MON-007', 'Force residual monitor reserved for M2'],
  ['MON-008', 'Transition screening monitor reserved for M2; work fraction computed separately'],
  ['MON-009', 'Terminal comfort screening reserved for M2; full-record filtered jerk is available'],
];
const CONTEXT = ['requested_decel_mps2', 'road_grade_rad', 'drive_force_N', 'regen_force_N', 'friction_force_N'] as const;

/**
 * Window quantities for MON-003 / MON-004 (analysis.py:17-27).
 * The window is the shortest span >= filter_window_s that ends at sample i; acceleration is
 * integrated with a zero-order hold on each outgoing interval, so irregular grids are handled.
 */
export function windowQuantities(
  t: readonly number[],
  v: readonly number[],
  a: readonly number[],
  c: MonitorConfig,
): { residual: (number | null)[]; stale: (number | null)[] } {
  const n = t.length;
  const prefix = new Array<number>(n).fill(0);
  for (let i = 1; i < n; i++) prefix[i] = prefix[i - 1] + a[i - 1] * (t[i] - t[i - 1]);
  const residual = new Array<number | null>(n).fill(null);
  const stale = new Array<number | null>(n).fill(null);
  let k = 0;
  for (let i = 1; i < n; i++) {
    while (k + 1 < i && t[i] - t[k + 1] >= c.filter_window_s - EPS) k++;
    const span = t[i] - t[k];
    if (span >= c.filter_window_s - EPS) {
      const av = (prefix[i] - prefix[k]) / span;
      residual[i] = Math.abs((v[i] - v[k]) / span - av);
      stale[i] = Math.abs(v[i] - v[k]) <= c.stale_speed_mps && Math.abs(av) > c.motion_accel_mps2 ? 1 : 0;
    }
  }
  return { residual, stale };
}

/** MON-005 inputs (analysis.py:51-58): undershoot-only error against the net request, with an onset grace period. */
export function decelError(
  t: readonly number[],
  v: readonly number[],
  a: readonly number[],
  req: readonly number[],
  c: MonitorConfig,
): { error: (number | null)[]; eligible: boolean[] } {
  const error: (number | null)[] = [];
  const eligible: boolean[] = [];
  let onset: number | null = null;
  for (let i = 0; i < t.length; i++) {
    if (req[i] > c.min_request_mps2 && v[i] > c.min_speed_mps) {
      if (onset === null) onset = t[i];
      eligible.push(t[i] - onset >= c.response_delay_s - EPS);
      error.push(Math.max(0, req[i] + a[i]));
    } else {
      onset = null;
      eligible.push(false);
      error.push(null);
    }
  }
  return { error, eligible };
}

export interface SustainedEvent {
  start: number;
  end: number;
  det: number;
}
export type SustainedOutcome =
  | { status: 'NOT_EVALUATED' }
  | { status: 'PASS'; peak: number }
  | { status: 'FAIL'; events: (SustainedEvent & { peak: number })[] };

/**
 * Debounce shared by MON-003/004/005 (analysis.py:28-46, without the upstream-gate check).
 * A breach must persist for evidence_s before it counts; shorter runs are discarded; a null or
 * ineligible sample ends a run; there is no hysteresis and no latching across runs.
 */
export function sustained(
  t: readonly number[],
  values: readonly (number | null)[],
  limit: number,
  evidence_s: number,
  eligible?: readonly boolean[],
): SustainedOutcome {
  const n = t.length;
  const ok = (i: number) => values[i] !== null && (eligible === undefined || eligible[i]);
  let first = -1;
  let last = -1;
  for (let i = 0; i < n; i++) {
    if (ok(i)) {
      if (first < 0) first = i;
      last = i;
    }
  }
  // A single sample cannot justify PASS for a sustained monitor.
  if (first < 0 || t[last] - t[first] < evidence_s - EPS) return { status: 'NOT_EVALUATED' };
  const events: (SustainedEvent & { peak: number })[] = [];
  let start: number | null = null;
  let det: number | null = null;
  for (let i = 0; i <= n; i++) {
    const hit = i < n && ok(i) && (values[i] as number) > limit;
    if (hit) {
      if (start === null) start = i;
      if (det === null && t[i] - t[start] >= evidence_s - EPS) det = i;
    } else if (start !== null) {
      if (det !== null) {
        let peak = -Infinity;
        for (let j = start; j < i; j++) peak = Math.max(peak, values[j] as number);
        events.push({ start, end: i - 1, det, peak });
      }
      start = null;
      det = null;
    }
  }
  if (events.length > 0) return { status: 'FAIL', events };
  let peak = -Infinity;
  for (let i = 0; i < n; i++) if (ok(i)) peak = Math.max(peak, values[i] as number);
  return { status: 'PASS', peak };
}

/** Port of analysis.evaluate: MON-001..010, one row per rule (one row per event for FAILs). */
export function evaluate(s: Signals, config: MonitorConfig = DEFAULT_CONFIG): Evaluation {
  const c = validateConfig(config);
  const t = s.time_s;
  const v = s.vehicle_speed_mps;
  const a = s.accel_long_mps2;
  const n = t.length;
  if (n < 2 || v.length !== n || a.length !== n) throw new RangeError('At least two rows of equal-length signals required');
  const rules: RuleResult[] = [];
  const push = (
    rule_id: string,
    status: Status,
    rationale: string,
    threshold: number | string | null = null,
    measured_value: number | null = null,
    units = '',
    start: number | null = null,
    end: number | null = null,
    det: number | null = null,
  ) =>
    rules.push({
      rule_id,
      status,
      t_start_s: start === null ? null : t[start],
      t_end_s: end === null ? null : t[end],
      detection_time_s: det === null ? null : t[det],
      start_csv_row: start === null ? null : start + 2,
      end_csv_row: end === null ? null : end + 2,
      measured_value,
      threshold,
      units,
      rationale,
    });

  // MON-001 timing gap
  const gapLimit = c.gap_factor * c.nominal_dt_s;
  const gaps: number[] = [];
  let maxDt = -Infinity;
  for (let i = 1; i < n; i++) {
    const dt = t[i] - t[i - 1];
    if (dt > gapLimit + EPS) gaps.push(i);
    maxDt = Math.max(maxDt, dt);
  }
  if (gaps.length) push('MON-001', 'WARN', 'Large timing gap; downstream analysis withheld', gapLimit, maxDt, 's', gaps[0] - 1, gaps[gaps.length - 1]);
  else push('MON-001', 'PASS', 'Strict timing accepted; no large gaps', gapLimit, maxDt, 's');

  // MON-002 range
  const bad: number[] = [];
  let maxAbsA = -Infinity;
  for (let i = 0; i < n; i++) {
    if (v[i] > c.max_speed_mps || Math.abs(a[i]) > c.max_abs_accel_mps2) bad.push(i);
    maxAbsA = Math.max(maxAbsA, Math.abs(a[i]));
  }
  const rangeText = `speed<=${c.max_speed_mps}; |accel|<=${c.max_abs_accel_mps2}`;
  if (bad.length) push('MON-002', 'FAIL', 'Configured speed/acceleration range exceeded', rangeText, maxAbsA, 'SI', bad[0], bad[bad.length - 1]);
  else push('MON-002', 'PASS', 'Parser/range checks evaluated', rangeText, maxAbsA, 'SI');

  const gated = gaps.length > 0 || bad.length > 0;
  const { residual, stale } = windowQuantities(t, v, a, c);
  const run = (id: string, values: readonly (number | null)[], limit: number, reason: string, units: string, eligible?: readonly boolean[]) => {
    if (gated) return push(id, 'NOT_EVALUATED', 'Invalid timing/range prevents evaluation', limit, null, units);
    const r = sustained(t, values, limit, c.evidence_s, eligible);
    if (r.status === 'NOT_EVALUATED') return push(id, 'NOT_EVALUATED', 'Prerequisites or usable duration absent', limit, null, units);
    if (r.status === 'PASS') return push(id, 'PASS', 'Evaluated; no sustained threshold breach', limit, r.peak, units);
    for (const e of r.events) push(id, 'FAIL', reason, limit, e.peak, units, e.start, e.end, e.det);
  };
  run('MON-003', residual, c.coherence_mps2, 'Speed change contradicts integrated measured acceleration', 'm/s^2');
  // The 0.5 limit on the 0/1 flag is hard-coded in the reference.
  run('MON-004', stale, 0.5, 'Near-stationary speed signal with independent measured acceleration', 'boolean');

  let error: (number | null)[] = new Array<number | null>(n).fill(null);
  let eligible: boolean[] = new Array<boolean>(n).fill(false);
  if (s.requested_decel_mps2) {
    ({ error, eligible } = decelError(t, v, a, s.requested_decel_mps2, c));
    run('MON-005', error, c.decel_error_mps2, 'Requested net deceleration undershoot; cause not diagnosed', 'm/s^2', eligible);
  } else {
    push('MON-005', 'NOT_EVALUATED', 'Missing requested net deceleration; pedal is not a force request', c.decel_error_mps2, null, 'm/s^2');
  }

  // MON-006..009 are explicit placeholders in the M1 release.
  for (const [id, reason] of PLACEHOLDERS) push(id, 'NOT_EVALUATED', reason);

  const present = new Set<string>(s.columns ?? Object.keys(s).filter((k) => k !== 'columns' && s[k as keyof Signals] !== undefined));
  const missing = CONTEXT.filter((x) => !present.has(x));
  if (missing.length) push('MON-010', 'NOT_EVALUATED', 'Missing optional context: ' + missing.join(','));
  else push('MON-010', 'PASS', 'M1 context channels present; M2 monitors still unimplemented');

  return { rules, series: { residual, stale, error, eligible } };
}

export interface Kpis {
  withheld: boolean;
  /** Seconds from first brake application to standstill; null if withheld or no complete stop. */
  stop_time_s: number | null;
  stop_distance_m: number | null;
  /** Share of mechanical retarding work done by regenerative braking (not battery energy). */
  regen_work_fraction: number | null;
}

/** analysis.py:84-95 — stop time/distance from brake onset, with a partial final interval. */
export function stopMetrics(s: Signals, c: MonitorConfig = DEFAULT_CONFIG): { stop_time_s: number | null; stop_distance_m: number | null } {
  const t = s.time_s;
  const v = s.vehicle_speed_mps;
  const a = s.accel_long_mps2;
  const brake = s.brake_pedal_pct;
  const none = { stop_time_s: null, stop_distance_m: null };
  if (!brake) return none;
  const n = t.length;
  let start = -1;
  for (let i = 0; i < n; i++) {
    if (brake[i] > 0 && v[i] > c.min_speed_mps) {
      start = i;
      break;
    }
  }
  if (start < 0) return none;
  let stop = -1;
  for (let i = start + 1; i < n; i++) {
    if (v[i] <= 1e-9) {
      stop = i;
      break;
    }
  }
  if (stop < 0) return none;
  let distance = 0;
  for (let i = start; i < stop - 1; i++) distance += 0.5 * (v[i] + v[i + 1]) * (t[i + 1] - t[i]);
  const j = stop - 1;
  const h = t[stop] - t[j];
  // A zero endpoint may include a standstill tail: infer the crossing from the incoming acceleration.
  const tau = a[j] < 0 ? Math.min(h, v[j] / -a[j]) : h;
  distance += 0.5 * v[j] * tau;
  return { stop_time_s: t[j] + tau - t[start], stop_distance_m: distance };
}

/** analysis.py:96-105 — regen share as a work fraction (force × distance), not a sample-count share. */
export function regenWorkFraction(s: Signals): number | null {
  const { time_s: t, vehicle_speed_mps: v, accel_long_mps2: a, regen_force_N: fr, friction_force_N: ff } = s;
  if (!fr || !ff) return null;
  let wr = 0;
  let wf = 0;
  for (let i = 0; i < t.length - 1; i++) {
    let h = t[i + 1] - t[i];
    if (v[i + 1] <= 1e-9 && v[i] > 0 && a[i] < 0) h = Math.min(h, v[i] / -a[i]);
    const ds = 0.5 * (v[i] + v[i + 1]) * h;
    wr += fr[i] * ds;
    wf += ff[i] * ds;
  }
  return wr + wf > 0 ? wr / (wr + wf) : null;
}

export interface Analysis extends Evaluation {
  kpis: Kpis;
}

/** analysis.analyze: KPIs are withheld when MON-001..004 raised a concern (a MON-005 FAIL does not withhold them). */
export function analyze(s: Signals, config: MonitorConfig = DEFAULT_CONFIG): Analysis {
  const ev = evaluate(s, config);
  const withheld = ev.rules.some((r) => ['MON-001', 'MON-002', 'MON-003', 'MON-004'].includes(r.rule_id) && (r.status === 'WARN' || r.status === 'FAIL'));
  const kpis: Kpis = withheld
    ? { withheld, stop_time_s: null, stop_distance_m: null, regen_work_fraction: null }
    : { withheld, ...stopMetrics(s, config), regen_work_fraction: regenWorkFraction(s) };
  return { ...ev, kpis };
}

/* ---------- Shipped dataset helpers (src/data/demo/longisafe.json) ---------- */

export interface DemoFault {
  kind: string;
  signal: string;
  t_start_s: number;
  t_end_s: number | null;
  description: string;
  compensated?: boolean;
  first_csv_row?: number;
  last_csv_row?: number;
  injected_samples?: number;
  clean_values?: number[];
}
export type ExpectedRule = [id: string, status: string, tStart: number | null, tEnd: number | null, det: number | null, startRow: number | null, endRow: number | null, measured: number | null];
export type SweepRule = [id: string, status: string, tStart: number | null, tEnd: number | null, det: number | null];
export type SweepCase = [key: string, value: number, rules: SweepRule[]];
export interface DemoScenario {
  id: string;
  title: string;
  description: string;
  rows: number;
  source_csv: string;
  source_csv_sha256: string;
  manifest_expected: string;
  truth: { fault: DemoFault; exact_stop: { time_s: number; distance_m: number } };
  expected: { rules: ExpectedRule[]; kpis_withheld: boolean; stop_time_s: number | null; stop_distance_m: number | null; regen_work_fraction: number | null };
  sweeps: SweepCase[];
  data: Record<string, string>;
}
export interface DemoDataset {
  provenance: Record<string, string>;
  config_default: MonitorConfig;
  config_units: Record<string, string>;
  csv_columns: string[];
  series: Record<string, number[]>;
  scenarios: DemoScenario[];
}

/**
 * Resolve a shipped scenario to observed signals. Truth is deliberately not part of the result.
 * brake_pedal_pct was omitted from the shipped file; in these four scenarios it is 40 % exactly
 * where a deceleration request is active (identity verified during the audit), so it is rebuilt here.
 */
export function scenarioSignals(d: DemoDataset, id: string): Signals {
  const sc = d.scenarios.find((x) => x.id === id);
  if (!sc) throw new RangeError(`Unknown scenario ${id}`);
  const col = (k: string) => d.series[sc.data[k]];
  const req = col('requested_decel_mps2');
  return {
    time_s: col('time_s'),
    vehicle_speed_mps: col('vehicle_speed_mps'),
    accel_long_mps2: col('accel_long_mps2'),
    requested_decel_mps2: req,
    brake_pedal_pct: req.map((x) => (x > 0 ? 40 : 0)),
    regen_force_N: col('regen_force_N'),
    friction_force_N: col('friction_force_N'),
    columns: d.csv_columns,
  };
}
