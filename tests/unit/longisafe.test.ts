import { describe, expect, it } from 'vitest';
import raw from '../../src/data/demo/longisafe.json';
import {
  DEFAULT_CONFIG,
  analyze,
  evaluate,
  scenarioSignals,
  validateConfig,
  type DemoDataset,
  type MonitorConfig,
  type RuleResult,
  type Signals,
} from '../../src/lib/longisafe';

const data = raw as unknown as DemoDataset;
const first = (rules: RuleResult[], id: string) => rules.find((r) => r.rule_id === id)!;
const closeOrNull = (actual: number | null, expected: number | null, digits = 9) => {
  if (expected === null) expect(actual).toBeNull();
  else expect(actual).toBeCloseTo(expected, digits);
};

describe('shipped dataset', () => {
  it('keeps every row of the four scenarios at full resolution', () => {
    expect(data.scenarios.map((s) => s.id)).toEqual(['S05', 'S09', 'S10', 'S14']);
    for (const sc of data.scenarios) {
      const s = scenarioSignals(data, sc.id);
      expect(s.time_s).toHaveLength(702);
      expect(s.vehicle_speed_mps).toHaveLength(702);
      expect(s.accel_long_mps2).toHaveLength(702);
    }
  });
  it('ships the reference default thresholds', () => {
    expect(data.config_default).toEqual({ ...DEFAULT_CONFIG });
  });
  it('does not expose fault truth through the monitor input', () => {
    const s = scenarioSignals(data, 'S09') as unknown as Record<string, unknown>;
    expect(Object.keys(s)).not.toContain('truth');
    expect(JSON.stringify(Object.keys(s))).not.toMatch(/truth|fault|clean/);
  });
});

describe('default thresholds reproduce the reference verdicts', () => {
  for (const sc of data.scenarios) {
    it(`${sc.id}: all 10 rule rows (status, evidence times, CSV rows, measured value)`, () => {
      const { rules } = evaluate(scenarioSignals(data, sc.id));
      expect(rules).toHaveLength(sc.expected.rules.length);
      sc.expected.rules.forEach(([id, status, t0, t1, det, row0, row1, measured], i) => {
        const r = rules[i];
        expect(r.rule_id).toBe(id);
        expect(r.status, id).toBe(status);
        closeOrNull(r.t_start_s, t0);
        closeOrNull(r.t_end_s, t1);
        closeOrNull(r.detection_time_s, det);
        expect(r.start_csv_row).toBe(row0);
        expect(r.end_csv_row).toBe(row1);
        // MON-002's expected value is exported at 4 decimals; everything else at full precision.
        closeOrNull(r.measured_value, measured, id === 'MON-002' ? 4 : 9);
      });
    });
  }

  it('matches the figures quoted in the case study', () => {
    const s09 = evaluate(scenarioSignals(data, 'S09')).rules;
    expect(first(s09, 'MON-003').detection_time_s).toBeCloseTo(3.4, 9);
    expect(first(s09, 'MON-005').detection_time_s).toBeCloseTo(3.3, 9);
    const s10 = evaluate(scenarioSignals(data, 'S10')).rules;
    expect(first(s10, 'MON-003').detection_time_s).toBeCloseTo(3.35, 9);
    expect(first(s10, 'MON-004').detection_time_s).toBeCloseTo(3.5, 9);
    const s14 = first(evaluate(scenarioSignals(data, 'S14')).rules, 'MON-005');
    expect([s14.t_start_s, s14.t_end_s, s14.detection_time_s, s14.start_csv_row, s14.end_csv_row]).toEqual([3, 33.3, 3.3, 62, 668]);
  });

  it('MON-006..009 are placeholders that never evaluate', () => {
    for (const sc of data.scenarios) {
      const { rules } = evaluate(scenarioSignals(data, sc.id));
      for (const id of ['MON-006', 'MON-007', 'MON-008', 'MON-009']) expect(first(rules, id).status).toBe('NOT_EVALUATED');
    }
  });
});

describe('threshold sweeps computed with the Python reference', () => {
  for (const sc of data.scenarios) {
    for (const [key, value, expected] of sc.sweeps) {
      it(`${sc.id}: ${key} = ${value}`, () => {
        const cfg: MonitorConfig = { ...DEFAULT_CONFIG, [key]: value };
        const { rules } = evaluate(scenarioSignals(data, sc.id), cfg);
        for (const [id, status, t0, t1, det] of expected) {
          const r = first(rules, id);
          expect(r.status, id).toBe(status);
          closeOrNull(r.t_start_s, t0);
          closeOrNull(r.t_end_s, t1);
          closeOrNull(r.detection_time_s, det);
        }
      });
    }
  }
});

describe('KPI withholding and reference metrics', () => {
  for (const sc of data.scenarios) {
    it(`${sc.id}: withheld = ${sc.expected.kpis_withheld}`, () => {
      const { kpis } = analyze(scenarioSignals(data, sc.id));
      expect(kpis.withheld).toBe(sc.expected.kpis_withheld);
      if (sc.expected.kpis_withheld) {
        expect(kpis.stop_distance_m).toBeNull();
        expect(kpis.stop_time_s).toBeNull();
      } else {
        // Reference metrics were computed on unrounded input; tolerances are those of the repo's Excel cross-checker.
        expect(Math.abs(kpis.stop_time_s! - sc.expected.stop_time_s!)).toBeLessThan(0.003);
        expect(Math.abs(kpis.stop_distance_m! - sc.expected.stop_distance_m!)).toBeLessThan(0.02);
        expect(Math.abs(kpis.regen_work_fraction! - sc.expected.regen_work_fraction!)).toBeLessThan(1e-5);
      }
    });
  }
  it('a MON-005 FAIL alone does not withhold KPIs (S14)', () => {
    const r = analyze(scenarioSignals(data, 'S14'));
    expect(first(r.rules, 'MON-005').status).toBe('FAIL');
    expect(r.kpis.withheld).toBe(false);
    expect(r.kpis.stop_distance_m).toBeCloseTo(318.59, 1);
  });
});

describe('cases mirrored from the repository test suite', () => {
  const cut = (s: Signals, keep: (i: number) => boolean): Signals => {
    const f = <T,>(arr: readonly T[] | undefined) => arr?.filter((_, i) => keep(i));
    return {
      time_s: f(s.time_s)!,
      vehicle_speed_mps: f(s.vehicle_speed_mps)!,
      accel_long_mps2: f(s.accel_long_mps2)!,
      requested_decel_mps2: f(s.requested_decel_mps2),
      columns: s.columns,
    };
  };
  it('three rows are not enough evidence for a sustained monitor (tests/test_m1.py:114-115)', () => {
    const { rules } = evaluate(cut(scenarioSignals(data, 'S05'), (i) => i < 3));
    expect(first(rules, 'MON-003').status).toBe('NOT_EVALUATED');
  });
  it('a 10-row gap gives MON-001 WARN and gates MON-003..005 (tests/test_m1.py:89-91)', () => {
    const r = analyze(cut(scenarioSignals(data, 'S05'), (i) => i < 100 || i >= 110));
    expect(first(r.rules, 'MON-001').status).toBe('WARN');
    for (const id of ['MON-003', 'MON-004', 'MON-005']) expect(first(r.rules, id).status).toBe('NOT_EVALUATED');
    expect(r.kpis.withheld).toBe(true);
  });
  it('constant speed with 1.5 m/s² measured acceleration fails MON-003 and MON-004 (tests/test_independent_oracles.py:30-34)', () => {
    const n = 30;
    const s: Signals = {
      time_s: Array.from({ length: n }, (_, i) => i * 0.05),
      vehicle_speed_mps: new Array<number>(n).fill(10),
      accel_long_mps2: new Array<number>(n).fill(1.5),
    };
    const { rules } = evaluate(s);
    expect(first(rules, 'MON-003').status).toBe('FAIL');
    expect(first(rules, 'MON-004').status).toBe('FAIL');
    expect(first(rules, 'MON-005').status).toBe('NOT_EVALUATED');
    expect(first(rules, 'MON-010').status).toBe('NOT_EVALUATED');
  });
  it('rejects invalid thresholds like the reference config validation', () => {
    expect(() => validateConfig({ ...DEFAULT_CONFIG, evidence_s: 0 })).toThrow();
    expect(() => validateConfig({ ...DEFAULT_CONFIG, gap_factor: 1 })).toThrow();
    expect(() => validateConfig({ ...DEFAULT_CONFIG, coherence_mps2: Number.NaN })).toThrow();
  });
});
