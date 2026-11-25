/**
 * SVG string builder for the LongiSafe demo plot. Pure and deterministic, so the same function
 * renders the default scenario at build time (no-JS state) and every update in the browser.
 *
 * Fault truth enters here only as a display overlay; the verdicts it draws were computed by
 * src/lib/longisafe.ts from observed signals alone.
 */
import { RULE_NAMES, analyze, scenarioSignals } from './longisafe';
import type { Analysis, DemoDataset, DemoFault, MonitorConfig, RuleResult, Signals } from './longisafe';

export interface ChartModel {
  uid: string;
  scenarioId: string;
  signals: Signals;
  analysis: Analysis;
  config: MonitorConfig;
  /** Display-only overlay from the truth file. */
  fault: DemoFault;
  stopTime: number;
}

const CHAR = 6.7; // approximate advance of the 11 px mono face
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const f1 = (n: number) => (Math.round(n * 10) / 10).toString();
export const fmt = (n: number, d = 2) => n.toFixed(d);

export function xMaxFor(stopTime: number): number {
  return Math.ceil((stopTime + 0.75) / 5) * 5;
}

interface LegendItem {
  cls: string;
  label: string;
}

/** Height the chart needs at a given width (legends wrap on narrow screens). */
export function renderChart(m: ChartModel, width = 760): string {
  const W = Math.max(300, Math.round(width));
  const narrow = W < 520;
  const ML = narrow ? 42 : 58;
  const MR = narrow ? 8 : 14;
  const PW = W - ML - MR;
  const { time_s: t, vehicle_speed_mps: v, accel_long_mps2: a } = m.signals;
  const req = m.signals.requested_decel_mps2;
  const xMax = xMaxFor(m.stopTime);
  const x = (s: number) => ML + (Math.min(Math.max(s, 0), xMax) / xMax) * PW;
  let nView = t.length;
  for (let i = 0; i < t.length; i++) {
    if (t[i] > xMax + 1e-9) {
      nView = i;
      break;
    }
  }

  const out: string[] = [];
  let y0 = 0;

  const path = (vals: ArrayLike<number | null>, y: (n: number) => number, cls: string, from = 0, to = nView) => {
    let d = '';
    let pen = false;
    for (let i = from; i < to; i++) {
      const val = vals[i];
      if (val === null || val === undefined) {
        pen = false;
        continue;
      }
      d += `${pen ? 'L' : 'M'}${x(t[i]).toFixed(1)} ${y(val).toFixed(1)}`;
      pen = true;
    }
    return d ? `<path class="${cls}" d="${d}"/>` : '';
  };

  const header = (title: string, unit: string, legend: LegendItem[]) => {
    const titleText = `${title} · ${unit}`;
    const itemW = (l: LegendItem) => 24 + l.label.length * CHAR + 12;
    const total = legend.reduce((s, l) => s + itemW(l), 0);
    const oneLine = titleText.length * CHAR + 16 + total <= PW;
    out.push(`<text class="ch-text ls-ptitle" x="${ML}" y="${y0 + 12}">${esc(titleText)}</text>`);
    let lx = oneLine ? ML + PW - total + 12 : ML;
    let ly = oneLine ? y0 + 12 : y0 + 28;
    for (const l of legend) {
      if (!oneLine && lx + itemW(l) - 12 > ML + PW && lx > ML) {
        lx = ML;
        ly += 16;
      }
      out.push(`<line class="${l.cls}" x1="${lx}" x2="${lx + 18}" y1="${ly - 4}" y2="${ly - 4}"/><text class="ch-text" x="${lx + 24}" y="${ly}">${esc(l.label)}</text>`);
      lx += itemW(l);
    }
    y0 = (legend.length === 0 || oneLine ? y0 + 20 : ly + 8);
  };

  interface Panel {
    top: number;
    h: number;
    y: (n: number) => number;
  }
  const panel = (h: number, lo: number, hi: number, ticks: number[]): Panel => {
    const top = y0;
    const y = (n: number) => top + h - ((n - lo) / (hi - lo)) * h;
    for (const tk of ticks) {
      out.push(`<line class="ch-grid" x1="${ML}" x2="${ML + PW}" y1="${y(tk).toFixed(1)}" y2="${y(tk).toFixed(1)}"/>`);
      out.push(`<text class="ch-text" x="${ML - 6}" y="${(y(tk) + 4).toFixed(1)}" text-anchor="end">${tk}</text>`);
    }
    out.push(`<rect class="ch-axis" x="${ML}" y="${top}" width="${PW}" height="${h}"/>`);
    y0 = top + h + 14;
    return { top, h, y };
  };
  const clip = (p: Panel, id: string, body: string) =>
    `<clipPath id="${m.uid}-${id}"><rect x="${ML}" y="${p.top}" width="${PW}" height="${p.h}"/></clipPath><g clip-path="url(#${m.uid}-${id})">${body}</g>`;

  const PH = narrow ? 96 : 112;
  const fault = m.fault;
  const fx0 = x(fault.t_start_s);
  const fx1 = x(fault.t_end_s ?? m.stopTime);
  const truthBand = (p: Panel) =>
    `<rect class="ls-truth" x="${fx0.toFixed(1)}" y="${p.top}" width="${(fx1 - fx0).toFixed(1)}" height="${p.h}"/>` +
    `<line class="ls-truth-edge" x1="${fx0.toFixed(1)}" x2="${fx0.toFixed(1)}" y1="${p.top}" y2="${p.top + p.h}"/>` +
    `<line class="ls-truth-edge" x1="${fx1.toFixed(1)}" x2="${fx1.toFixed(1)}" y1="${p.top}" y2="${p.top + p.h}"/>`;

  const cleanFrom = (fault.first_csv_row ?? 2) - 2;
  const cleanArr = (signal: string): (number | null)[] | null => {
    if (fault.signal !== signal || !fault.clean_values) return null;
    const arr = new Array<number | null>(t.length).fill(null);
    fault.clean_values.forEach((val, j) => (arr[cleanFrom + j] = val));
    return arr;
  };

  // ---- Panel 1: speed
  const cleanV = cleanArr('vehicle_speed_mps');
  header('Vehicle speed', 'm/s', [{ cls: 'ch-line', label: 'observed' }, ...(cleanV ? [{ cls: 'ch-line ls-clean', label: 'un-faulted (truth)' }] : [])]);
  const p1 = panel(PH, 0, 27, [0, 10, 20]);
  out.push(truthBand(p1));
  out.push(clip(p1, 'c1', (cleanV ? path(cleanV, p1.y, 'ch-line ls-clean') : '') + path(v, p1.y, 'ch-line')));

  // ---- Panel 2: acceleration vs request
  const cleanA = cleanArr('accel_long_mps2');
  const reqNeg = req ? req.map((r) => -r) : null;
  header('Longitudinal acceleration', 'm/s²', [
    { cls: 'ch-line', label: 'measured' },
    ...(reqNeg ? [{ cls: 'ch-line ch-line--2 ch-line--dash', label: '−requested decel' }] : []),
    ...(cleanA ? [{ cls: 'ch-line ls-clean', label: 'un-faulted (truth)' }] : []),
  ]);
  const p2 = panel(PH, -4, 1, [-4, -3, -2, -1, 0]);
  out.push(truthBand(p2));
  out.push(clip(p2, 'c2', (reqNeg ? path(reqNeg, p2.y, 'ch-line ch-line--2 ch-line--dash') : '') + (cleanA ? path(cleanA, p2.y, 'ch-line ls-clean') : '') + path(a, p2.y, 'ch-line')));

  // ---- Panel 3: monitor quantities with adjustable limits
  const { residual, error, eligible } = m.analysis.series;
  const errEligible = error.map((e, i) => (eligible[i] ? e : null));
  const R_MAX = 3.5;
  header('Monitor quantities', 'm/s²', [
    { cls: 'ch-line', label: 'MON-003 residual' },
    { cls: 'ch-line ch-line--3 ls-m5', label: 'MON-005 undershoot' },
    { cls: 'ls-limit', label: 'limits' },
  ]);
  const p3 = panel(PH + 16, 0, R_MAX, [0, 1, 2, 3]);
  out.push(truthBand(p3));
  out.push(clip(p3, 'c3', path(errEligible, p3.y, 'ch-line ch-line--3 ls-m5') + path(residual, p3.y, 'ch-line')));
  const limit = (val: number, label: string, cls: string, above: boolean) => {
    if (val > R_MAX) return;
    const ly = p3.y(val);
    out.push(`<line class="ls-limit ${cls}" x1="${ML}" x2="${ML + PW}" y1="${ly.toFixed(1)}" y2="${ly.toFixed(1)}"/>`);
    out.push(`<text class="ch-text ls-limit-label ${cls}" x="${ML + PW - 4}" y="${(above ? ly - 4 : ly + 12).toFixed(1)}" text-anchor="end">${esc(label)}</text>`);
  };
  const c = m.config;
  const close = Math.abs(c.coherence_mps2 - c.decel_error_mps2) < 0.75;
  const cohAbove = !close || c.coherence_mps2 >= c.decel_error_mps2;
  limit(c.coherence_mps2, `${narrow ? 'M03' : 'MON-003'} limit ${fmt(c.coherence_mps2)}`, 'ls-limit--3', cohAbove);
  limit(c.decel_error_mps2, `${narrow ? 'M05' : 'MON-005'} limit ${fmt(c.decel_error_mps2)}`, 'ls-limit--5', !close || !cohAbove);
  let peakI = -1;
  for (let i = 0; i < nView; i++) {
    const r = residual[i];
    if (r !== null && r > R_MAX && (peakI < 0 || r > (residual[peakI] as number))) peakI = i;
  }
  if (peakI >= 0) {
    const px = x(t[peakI]);
    out.push(`<text class="ch-text ls-note" x="${(px + 6).toFixed(1)}" y="${p3.top + 12}">↑ off scale, peak ${f1(residual[peakI] as number)}</text>`);
  }

  // ---- Event lanes
  y0 += 2;
  out.push(`<text class="ch-text ls-ptitle" x="${ML}" y="${y0 + 12}">Evidence windows</text>`);
  y0 += 20;
  const lane = (label: string, text: string, state: string, bar: null | { x0: number; x1: number; det?: number }, open = false) => {
    out.push(`<text class="ch-text ls-lane-id" x="${ML - 6}" y="${y0 + 17}" text-anchor="end">${esc(label)}</text>`);
    out.push(`<line class="ch-grid" x1="${ML}" x2="${ML + PW}" y1="${y0 + 13}" y2="${y0 + 13}"/>`);
    if (bar) {
      const bw = Math.max(2, bar.x1 - bar.x0);
      out.push(`<rect class="ls-bar" data-state="${state}" x="${bar.x0.toFixed(1)}" y="${y0 + 8}" width="${bw.toFixed(1)}" height="10"/>`);
      if (open) out.push(`<path class="ls-bar-open" data-state="${state}" d="M${(bar.x1 + 1).toFixed(1)} ${y0 + 8}l5 5l-5 5z"/>`);
      if (bar.det !== undefined) out.push(`<path class="ls-det" d="M${bar.det.toFixed(1)} ${y0 + 7}l-4.5 -7h9z"/>`);
    }
    out.push(`<text class="ch-text ls-lane-text" data-state="${state}" x="${ML + 4}" y="${y0 + 32}">${esc(text)}</text>`);
    y0 += 42;
  };
  const kind = ({ bias: 'bias', stuck_at: 'held value', regen_capacity_loss: narrow ? 'regen loss' : 'regen capacity loss' } as Record<string, string>)[fault.kind] ?? fault.kind;
  const truthLabel =
    fault.t_end_s === null
      ? `${kind} from ${f1(fault.t_start_s)} s, ${fault.compensated ? 'compensated' : 'uncompensated'}`
      : `${kind} on ${narrow ? 'signal' : fault.signal} ${fmt(fault.t_start_s, 1)}–${fmt(fault.t_end_s, 1)} s`;
  lane('TRUTH', truthLabel, 'truth', { x0: fx0, x1: fx1 }, fault.t_end_s === null);
  const shortId = (id: string) => (narrow ? id.replace('MON-0', 'M') : id);
  const dets: number[] = [];
  for (const id of ['MON-003', 'MON-004', 'MON-005']) {
    const rows: RuleResult[] = m.analysis.rules.filter((r) => r.rule_id === id);
    const r = rows[0];
    if (r.status === 'FAIL' && r.t_start_s !== null && r.t_end_s !== null && r.detection_time_s !== null) {
      dets.push(r.detection_time_s);
      const more = rows.length > 1 ? ` (+${rows.length - 1} more)` : '';
      lane(shortId(id), `FAIL ${fmt(r.t_start_s)}–${fmt(r.t_end_s)} s · ${narrow ? 'det.' : 'detected'} ${fmt(r.detection_time_s)} s${more}`, 'fail', {
        x0: x(r.t_start_s),
        x1: x(r.t_end_s),
        det: x(r.detection_time_s),
      });
    } else if (r.status === 'PASS') lane(shortId(id), 'PASS · no sustained breach', 'pass', null);
    else lane(shortId(id), 'NOT EVALUATED', 'na', null);
  }
  // First detection marker through all panels.
  if (dets.length) {
    const d = Math.min(...dets);
    const dx = x(d).toFixed(1);
    out.push(`<line class="ls-detline" x1="${dx}" x2="${dx}" y1="${p1.top}" y2="${p3.top + p3.h}"/>`);
    const right = x(d) + 8 + 22 * CHAR < ML + PW;
    out.push(`<text class="ch-text ls-detlabel" x="${right ? x(d) + 6 : x(d) - 6}" y="${p1.top + 13}" text-anchor="${right ? 'start' : 'end'}">first detection ${fmt(d)} s</text>`);
  }

  // ---- Time axis
  const step = xMax <= 10 ? (narrow ? 2 : 1) : 5;
  out.push(`<line class="ch-axis" x1="${ML}" x2="${ML + PW}" y1="${y0}" y2="${y0}"/>`);
  for (let s = 0; s <= xMax + 1e-9; s += step) {
    out.push(`<line class="ch-axis" x1="${x(s).toFixed(1)}" x2="${x(s).toFixed(1)}" y1="${y0}" y2="${y0 + 4}"/>`);
    out.push(`<text class="ch-text" x="${x(s).toFixed(1)}" y="${y0 + 16}" text-anchor="${s === 0 ? 'start' : s >= xMax ? 'end' : 'middle'}">${s}</text>`);
  }
  out.push(`<text class="ch-text" x="${ML + PW}" y="${y0 + 32}" text-anchor="end">time · s</text>`);
  const H = y0 + 38;

  const failed = m.analysis.rules.filter((r) => r.status === 'FAIL').map((r) => `${r.rule_id} FAIL detected at ${fmt(r.detection_time_s ?? 0)} s`);
  const title = `Scenario ${m.scenarioId}: speed, acceleration and monitor quantities over 0–${xMax} s. ${failed.length ? failed.join('; ') : 'No monitor fails'}.`;
  return `<svg class="ls-chart" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(title).replace(/"/g, '&quot;')}" data-w="${W}">${out.join('')}</svg>`;
}

/* ---------- Tables and readouts shared by the server-rendered state and the custom element ---------- */


const STATE: Record<string, { state: string; glyph: string; text: string }> = {
  PASS: { state: 'pass', glyph: '✓', text: 'PASS' },
  FAIL: { state: 'fail', glyph: '✕', text: 'FAIL' },
  WARN: { state: 'warn', glyph: '!', text: 'WARN' },
  NOT_EVALUATED: { state: 'na', glyph: '–', text: 'NOT EVALUATED' },
};
export const verdictHtml = (status: string) => {
  const s = STATE[status] ?? STATE.NOT_EVALUATED;
  return `<span class="verdict" data-state="${s.state}"><span aria-hidden="true">${s.glyph}</span> ${s.text}</span>`;
};

/** Truth kinds that corrupt an observed signal (as opposed to plant events such as regen loss). */
const SENSOR_FAULTS = ['bias', 'stuck_at'];
export const UNDETECTED_NOTE = 'from a signal with an undetected injected fault';

export interface DemoView {
  model: ChartModel;
  verdictRows: string;
  dataRows: string;
  readout: { k: string; v: string; note?: string }[];
  /** Compact per-monitor verdict strip shown next to the controls. */
  strip: string;
  status: string;
  description: string;
}

export function buildView(d: DemoDataset, scenarioId: string, config: MonitorConfig, uid = 'ls'): DemoView {
  const sc = d.scenarios.find((s) => s.id === scenarioId) ?? d.scenarios[0];
  const signals = scenarioSignals(d, sc.id);
  const analysis = analyze(signals, config);
  const fault = sc.truth.fault;
  const model: ChartModel = { uid, scenarioId: sc.id, signals, analysis, config, fault, stopTime: sc.truth.exact_stop.time_s };
  const dash = '<span class="dim">—</span>';
  const num = (n: number | null, digits = 2) => (n === null ? dash : fmt(n, digits));

  const byId = new Map<string, RuleResult[]>();
  for (const r of analysis.rules) byId.set(r.rule_id, [...(byId.get(r.rule_id) ?? []), r]);
  const PLACEHOLDER_IDS = ['MON-006', 'MON-007', 'MON-008', 'MON-009'];
  const verdictRows = [...byId.entries()]
    .filter(([id]) => !PLACEHOLDER_IDS.slice(1).includes(id))
    .map(([id, rows]) => {
      if (id === 'MON-006')
        return `<tr><th scope="row"><span class="ls-rid">MON-006…009</span> <span class="ls-rname">Reserved for M2 <span class="dim">(not implemented)</span></span></th><td>${verdictHtml('NOT_EVALUATED')}</td><td class="num">${dash}</td><td class="num">${dash}</td><td class="num">${dash}</td><td class="num">${dash}</td><td class="num">${dash}</td></tr>`;
      // One table row per event, so a threshold that splits a breach into several runs shows all of them.
      return rows
        .map((r, n) => {
          const limit =
            id === 'MON-002'
              ? `${config.max_speed_mps} m/s; ${config.max_abs_accel_mps2} m/s²`
              : id === 'MON-004'
                ? 'flag'
                : typeof r.threshold === 'number'
                  ? `${fmt(r.threshold)} ${r.units.replace('^2', '²')}`
                  : dash;
          const peak = id === 'MON-004' || r.measured_value === null ? dash : fmt(r.measured_value, r.measured_value >= 10 ? 1 : 3);
          const win = r.t_start_s !== null && r.t_end_s !== null ? `${fmt(r.t_start_s)}–${fmt(r.t_end_s)} s` : dash;
          const det = r.detection_time_s !== null ? `${fmt(r.detection_time_s)} s` : dash;
          const lat = r.detection_time_s !== null ? `+${fmt(r.detection_time_s - fault.t_start_s)} s` : dash;
          const event = rows.length > 1 ? ` <span class="dim">event ${n + 1} of ${rows.length}</span>` : '';
          return `<tr><th scope="row"><span class="ls-rid">${id}</span> <span class="ls-rname">${RULE_NAMES[id] ?? ''}${event}</span></th><td>${verdictHtml(r.status)}</td><td class="num">${limit}</td><td class="num">${peak}</td><td class="num">${win}</td><td class="num">${det}</td><td class="num">${lat}</td></tr>`;
        })
        .join('');
    })
    .join('');

  const fails = analysis.rules.filter((r) => r.status === 'FAIL' && r.detection_time_s !== null);
  const firstDet = fails.length ? fails.reduce((m, r) => (r.detection_time_s! < m.detection_time_s! ? r : m)) : null;
  const k = analysis.kpis;
  // Display-only use of truth: flag KPIs that the reference logic reports although a sensor fault was injected.
  const undetected = !k.withheld && SENSOR_FAULTS.includes(fault.kind);
  const readout = [
    { k: 'First detection', v: firstDet ? `${fmt(firstDet.detection_time_s!)} s` : '—', note: firstDet ? firstDet.rule_id : 'no monitor failed' },
    { k: 'Latency vs. truth', v: firstDet ? `+${fmt(firstDet.detection_time_s! - fault.t_start_s)} s` : '—', note: `event at ${fmt(fault.t_start_s, 1)} s` },
    {
      k: 'Stop distance',
      v: k.withheld ? 'withheld' : k.stop_distance_m === null ? '—' : `${fmt(k.stop_distance_m)} m`,
      note: k.withheld ? 'signal integrity in doubt' : undetected ? UNDETECTED_NOTE : k.stop_time_s === null ? '' : `in ${fmt(k.stop_time_s)} s from brake onset`,
    },
    { k: 'Regen share of work', v: k.withheld ? 'withheld' : k.regen_work_fraction === null ? '—' : `${fmt(k.regen_work_fraction * 100, 1)} %`, note: undetected ? UNDETECTED_NOTE : 'mechanical, not battery energy' },
  ];

  const SHORT: Record<string, string> = { 'MON-003': 'Coherence', 'MON-004': 'Frozen speed', 'MON-005': 'Decel tracking' };
  const strip = Object.keys(SHORT)
    .map((id) => {
      const r = byId.get(id)![0];
      const detail = r.detection_time_s !== null ? `<span><i class="ls-long">detected</i><i class="ls-short" aria-hidden="true">det.</i> ${fmt(r.detection_time_s)} s</span> <span><i class="ls-long">latency </i>+${fmt(r.detection_time_s - fault.t_start_s)} s</span>` : r.status === 'PASS' ? 'no sustained breach' : 'not evaluated';
      return `<li data-state="${STATE[r.status].state}"><span class="ls-sid">${id} <span>${SHORT[id]}</span></span>${verdictHtml(r.status)}<small>${detail}</small></li>`;
    })
    .join('');

  const xMax = xMaxFor(model.stopTime);
  const { residual, error, eligible } = analysis.series;
  const stride = xMax <= 10 ? 5 : 20;
  let dataRows = '';
  for (let i = 0; i < signals.time_s.length && signals.time_s[i] <= xMax + 1e-9; i += stride) {
    const inTruth = signals.time_s[i] >= fault.t_start_s - 1e-9 && signals.time_s[i] <= (fault.t_end_s ?? model.stopTime) + 1e-9;
    dataRows += `<tr><td class="num">${fmt(signals.time_s[i])}</td><td class="num">${fmt(signals.vehicle_speed_mps[i], 3)}</td><td class="num">${fmt(signals.accel_long_mps2[i], 3)}</td><td class="num">${fmt(signals.requested_decel_mps2?.[i] ?? 0, 1)}</td><td class="num">${num(residual[i], 3)}</td><td class="num">${eligible[i] ? num(error[i], 3) : dash}</td><td>${inTruth ? 'yes' : 'no'}</td></tr>`;
  }

  const changed = (Object.keys(config) as (keyof MonitorConfig)[]).filter((key) => config[key] !== d.config_default[key]);
  const verdicts = ['MON-003', 'MON-004', 'MON-005']
    .map((id) => {
      const r = byId.get(id)![0];
      return `${id} ${STATE[r.status].text}${r.detection_time_s !== null ? ` detected at ${fmt(r.detection_time_s)} s, ${fmt(r.detection_time_s - fault.t_start_s)} s after the event` : ''}`;
    })
    .join('; ');
  const status = `${sc.id}, ${changed.length ? changed.map((key) => `${key} ${config[key]}`).join(', ') : 'default thresholds'}: ${verdicts}. ${k.withheld ? 'KPIs withheld.' : undetected ? 'KPIs are reported from a signal with an undetected injected fault.' : ''}`;

  return { model, verdictRows, dataRows, readout, strip, status, description: `${sc.title}. ${sc.description}`.replace(/\^2/g, '²') };
}

export const readoutHtml = (items: DemoView['readout']) =>
  items.map((r) => `<div><dt>${r.k}</dt><dd>${r.v}${r.note ? `<small>${r.note}</small>` : ''}</dd></div>`).join('');
