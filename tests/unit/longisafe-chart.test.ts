import { describe, expect, it } from 'vitest';
import raw from '../../src/data/demo/longisafe.json';
import { DEFAULT_CONFIG, type DemoDataset, type MonitorConfig } from '../../src/lib/longisafe';
import { UNDETECTED_NOTE, buildView, fmt, readoutHtml, renderChart, verdictHtml, xMaxFor } from '../../src/lib/longisafe-chart';

const data = raw as unknown as DemoDataset;
const view = (id: string, over: Partial<MonitorConfig> = {}) => buildView(data, id, { ...DEFAULT_CONFIG, ...over });
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const cell = (v: ReturnType<typeof view>, key: string) => v.readout.find((r) => r.k === key)!;
const stripItems = (v: ReturnType<typeof view>) => v.strip.split('</li>').filter(Boolean).map(text);

describe('formatting helpers', () => {
  it('fmt and xMaxFor', () => {
    expect(fmt(3.4)).toBe('3.40');
    expect(fmt(318.588, 1)).toBe('318.6');
    expect(xMaxFor(9.248)).toBe(10);
    expect(xMaxFor(33.4965)).toBe(35);
  });
  it('verdictHtml carries the verdict as text and a state attribute, not colour alone', () => {
    expect(verdictHtml('FAIL')).toContain('data-state="fail"');
    expect(text(verdictHtml('FAIL'))).toBe('✕ FAIL');
    expect(text(verdictHtml('PASS'))).toBe('✓ PASS');
    expect(text(verdictHtml('NOT_EVALUATED'))).toBe('– NOT EVALUATED');
    expect(verdictHtml('SOMETHING_ELSE')).toContain('data-state="na"');
  });
  it('readoutHtml renders one dt/dd pair per item', () => {
    const html = readoutHtml([{ k: 'A', v: '1', note: 'n' }, { k: 'B', v: '2' }]);
    expect(html.match(/<dt>/g)).toHaveLength(2);
    expect(html).toContain('<small>n</small>');
  });
});

describe('buildView read-outs at default thresholds', () => {
  it('S09: two FAILs, first detection by MON-005, latency against the truth file, KPIs withheld', () => {
    const v = view('S09');
    const [m3, m4, m5] = stripItems(v);
    expect(m3).toMatch(/MON-003 .*FAIL .*3\.40 s .*\+0\.40 s/);
    expect(m4).toMatch(/MON-004 .*PASS no sustained breach/);
    expect(m5).toMatch(/MON-005 .*FAIL .*3\.30 s .*\+0\.30 s/);
    expect(cell(v, 'First detection')).toMatchObject({ v: '3.30 s', note: 'MON-005' });
    expect(cell(v, 'Latency vs. truth').v).toBe('+0.30 s');
    expect(cell(v, 'Stop distance').v).toBe('withheld');
    expect(cell(v, 'Regen share of work').v).toBe('withheld');
    expect(v.status).toContain('default thresholds');
    expect(v.status).toContain('KPIs withheld.');
  });
  it('S10: MON-003 at 3.35 s and MON-004 at 3.50 s', () => {
    const [m3, m4, m5] = stripItems(view('S10'));
    expect(m3).toMatch(/FAIL .*3\.35 s .*\+0\.35 s/);
    expect(m4).toMatch(/FAIL .*3\.50 s .*\+0\.50 s/);
    expect(m5).toMatch(/PASS/);
  });
  it('S05 and S14 report the stop metrics and regen share quoted on the page', () => {
    const s05 = view('S05');
    expect(cell(s05, 'Stop distance')).toMatchObject({ v: '102.06 m', note: 'in 8.25 s from brake onset' });
    expect(cell(s05, 'Regen share of work').v).toBe('4.6 %');
    expect(cell(s05, 'First detection').v).toBe('—');
    const s14 = view('S14');
    expect(cell(s14, 'Stop distance')).toMatchObject({ v: '318.59 m', note: 'in 32.50 s from brake onset' });
    expect(cell(s14, 'Regen share of work').v).toBe('26.1 %');
    expect(cell(s14, 'Latency vs. truth').v).toBe('+0.30 s');
  });
  it('verdict table: one row per rule, placeholders collapsed, limits taken from the config', () => {
    const v = view('S09');
    const rows = v.verdictRows.split('</tr>').filter(Boolean).map(text);
    expect(rows).toHaveLength(7);
    expect(rows[1]).toContain('100 m/s; 20 m/s²');
    expect(rows[2]).toMatch(/MON-003 .* FAIL 0\.70 m\/s² 1\.519 3\.10–5\.15 s 3\.40 s \+0\.40 s/);
    expect(rows[5]).toMatch(/MON-006…009 .*NOT EVALUATED/);
    expect(text(view('S09', { max_speed_mps: 80 }).verdictRows)).toContain('80 m/s; 20 m/s²');
  });
  it('data table marks the truth window and covers the plotted range', () => {
    const rows = view('S09').dataRows.split('</tr>').filter(Boolean).map(text);
    expect(rows).toHaveLength(41); // 0–10 s every 0.25 s
    expect(rows[12]).toMatch(/^3\.00 .* yes$/);
    expect(rows[11]).toMatch(/^2\.75 .* no$/);
    expect(rows[21]).toMatch(/^5\.25 .* no$/);
  });
});

describe('buildView under changed thresholds (the claims made in the guided steps and prose)', () => {
  it('S10: evidence 1.0 s moves both detections 0.70 s later', () => {
    const [m3, m4] = stripItems(view('S10', { evidence_s: 1 }));
    expect(m3).toMatch(/FAIL .*4\.05 s .*\+1\.05 s/);
    expect(m4).toMatch(/FAIL .*4\.20 s .*\+1\.20 s/);
  });
  it('S10 still fails at 2.1 s and clears from 2.2 s; S09 already clears at 2.1 s', () => {
    expect(stripItems(view('S10', { evidence_s: 2.1 }))[0]).toMatch(/MON-003 .*FAIL/);
    expect(stripItems(view('S10', { evidence_s: 2.1 }))[1]).toMatch(/MON-004 .*PASS/);
    for (const item of stripItems(view('S10', { evidence_s: 2.2 }))) expect(item).toMatch(/PASS/);
    for (const item of stripItems(view('S09', { evidence_s: 2.1 }))) expect(item).toMatch(/PASS/);
    expect(stripItems(view('S09', { evidence_s: 2 }))[0]).toMatch(/FAIL/);
  });
  it('KPIs that appear after a sensor fault goes undetected are labelled as such', () => {
    const s10 = view('S10', { evidence_s: 2.5 });
    expect(cell(s10, 'Stop distance')).toMatchObject({ v: '108.21 m', note: UNDETECTED_NOTE });
    expect(cell(s10, 'Regen share of work').note).toBe(UNDETECTED_NOTE);
    expect(s10.status).toContain('undetected injected fault');
    const s09 = view('S09', { coherence_mps2: 1.6 });
    expect(cell(s09, 'Stop distance').note).toBe(UNDETECTED_NOTE);
    // Plant events are not sensor faults: no such label on S05 / S14.
    expect(cell(view('S14'), 'Stop distance').note).not.toBe(UNDETECTED_NOTE);
    expect(cell(view('S05'), 'Stop distance').note).not.toBe(UNDETECTED_NOTE);
  });
  it('S09: MON-003 flips between coherence limits 1.4 and 1.6; S14 persists at evidence 2.5 s', () => {
    expect(stripItems(view('S09', { coherence_mps2: 1.4 }))[0]).toMatch(/FAIL/);
    expect(stripItems(view('S09', { coherence_mps2: 1.6 }))[0]).toMatch(/PASS/);
    expect(stripItems(view('S14', { evidence_s: 2.5 }))[2]).toMatch(/FAIL .*5\.50 s .*\+2\.50 s/);
  });
  it('a breach split into several runs yields one table row per event', () => {
    for (const sc of data.scenarios) {
      for (const coherence_mps2 of [0.3, 0.7, 1.5, 2]) {
        const v = view(sc.id, { coherence_mps2 });
        const events = v.model.analysis.rules.filter((r) => r.rule_id === 'MON-003').length;
        const rows = v.verdictRows.split('</tr>').filter((r) => r.includes('>MON-003<')).length;
        expect(rows).toBe(events);
      }
    }
  });
});

describe('renderChart', () => {
  it('is deterministic, labelled and sized to the requested width', () => {
    const v = view('S09');
    const a = renderChart(v.model, 760);
    expect(renderChart(v.model, 760)).toBe(a);
    expect(a).toMatch(/^<svg class="ls-chart" viewBox="0 0 760 \d+"/);
    expect(a).toContain('role="img"');
    expect(a).toContain('MON-003 FAIL detected at 3.40 s');
    expect(a).toContain('first detection 3.30 s');
    expect(a).toContain('MON-003 limit 0.70');
    expect(a).not.toMatch(/NaN|undefined/);
  });
  it('re-lays out for narrow screens and for every scenario without invalid numbers', () => {
    for (const sc of data.scenarios) {
      const svg = renderChart(view(sc.id).model, 330);
      expect(svg).toContain('viewBox="0 0 330 ');
      expect(svg).not.toMatch(/NaN|undefined/);
    }
    expect(renderChart(view('S10').model, 760)).toContain('off scale, peak 30');
    expect(renderChart(view('S05').model, 760)).not.toContain('first detection');
  });
});
