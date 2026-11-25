/**
 * Mirrors a subset of `agent/tests/test_guard.py` @ 700cf95 (team hackathon repository) against the
 * TypeScript re-implementation, plus invariants of the shipped S01 replay.
 * The Python tests use the kit's cost function and fixtures derived from practice cases; the values
 * here are synthetic, the structure of each scenario is the same. Each test names its Python original.
 */
import { describe, expect, it } from 'vitest';
import data from '../../src/data/demo/tacto.json';
import {
  acceptPoint,
  checkOffer,
  checksHtml,
  fixSheets,
  guardDecide,
  mustHavesOk,
  priceSeries,
  satisfyMustHaves,
  score,
  stateAt,
  type Delegate,
  type GuardCase,
  type MustHave,
  type ReplayRun,
  type Terms,
  type ThreadState,
} from '../../src/lib/tacto';

const run = data.run as unknown as ReplayRun;

function mkCase(mustHaves: MustHave[], negotiable: string[], termOptions: GuardCase['termOptions'], extra: Partial<GuardCase> = {}): GuardCase {
  return {
    caseId: 'case:T1',
    negotiable,
    termOptions,
    mustHaves,
    plan: {},
    roundLimit: 10,
    cost: { volumePerYear: 1000, interestRate: 0.08, referencePaymentDays: 45 },
    alternative: null,
    ...extra,
  };
}

const PPM = [250, 500, 1000, 2000];
/** Quality case: defect_ppm <= 1000 (same shape as the Python `_p11()` fixture, synthetic values). */
const quality = (extra: Partial<GuardCase> = {}) =>
  mkCase([{ field: 'defect_ppm', op: '<=', value: 1000 }], ['defect_ppm', 'unit_price'], { defect_ppm: PPM }, extra);

/** Thread like Python `_ev(sent=…)`: the supplier keeps repeating a sheet that breaks the must-have. */
const stuck = (over: Partial<ThreadState> = {}): ThreadState => ({
  supplierId: 'sup:A',
  opening: { unit_price: 50, defect_ppm: 4000 },
  standing: { unit_price: 50, defect_ppm: 4000 },
  standingId: 'o1',
  status: 'open',
  buyerMessagesSent: 1,
  guardCountersUsed: 0,
  ...over,
});
/** Thread like Python `_moved()`: opened at 50, now at `now`, compliant quality. */
const moved = (now = 40, over: Partial<ThreadState> = {}): ThreadState => ({
  supplierId: 'sup:A',
  opening: { unit_price: 50, defect_ppm: 500 },
  standing: { unit_price: now, defect_ppm: 500 },
  standingId: 'o1',
  status: 'open',
  buyerMessagesSent: 1,
  guardCountersUsed: 0,
  ...over,
});
const WALK: Delegate = { type: 'walk_away' };
const counter = (price = 42, ppm = 2000): Delegate => ({ type: 'counter', sheets: [{ unit_price: price, defect_ppm: ppm }] });

describe('satisfy_must_haves', () => {
  it('picks the boundary option (test_satisfy_options)', () => {
    const c = quality();
    const out = satisfyMustHaves(c, { unit_price: 50, defect_ppm: 2000 });
    expect(out.defect_ppm).toBe(1000);
    expect(Object.keys(out).sort()).toEqual([...c.negotiable].sort());
    expect(mustHavesOk(c, out)).toBe(true);

    const lead = mkCase([{ field: 'lead_time_days', op: '<=', value: 35 }], ['unit_price', 'lead_time_days'], { lead_time_days: [21, 28, 35, 49] });
    expect(satisfyMustHaves(lead, { unit_price: 40, lead_time_days: 49 }).lead_time_days).toBe(35);

    const vol = mkCase([{ field: 'volume_per_year', op: '>=', value: 9000 }], ['unit_price', 'volume_per_year'], { volume_per_year: [6000, 8000, 10000] });
    const filled = satisfyMustHaves(vol, { unit_price: 40 }); // field missing from the sheet
    expect(filled.volume_per_year).toBe(10000);
    expect(mustHavesOk(vol, filled)).toBe(true);
  });

  it('handles ==, <, != and fields without options (test_satisfy_eq_noopts_and_nonnegotiable)', () => {
    const neg = ['unit_price', 'payment_days'];
    expect(satisfyMustHaves(mkCase([{ field: 'payment_days', op: '==', value: 60 }], neg, { payment_days: [30, 60] }), { unit_price: 40, payment_days: 30 }).payment_days).toBe(60);
    expect(satisfyMustHaves(mkCase([{ field: 'payment_days', op: '<=', value: 45 }], neg, {}), { unit_price: 40, payment_days: 60 }).payment_days).toBe(45);
    expect(satisfyMustHaves(mkCase([{ field: 'payment_days', op: '<', value: 45 }], neg, {}), { unit_price: 40, payment_days: 60 }).payment_days).toBe(44);
    expect(satisfyMustHaves(mkCase([{ field: 'payment_days', op: '!=', value: 30 }], neg, { payment_days: [30, 60] }), { unit_price: 40, payment_days: 30 }).payment_days).toBe(60);
    // a must-have on a field we cannot negotiate is left alone, and the sheet still fails the check
    const fixed = mkCase([{ field: 'incoterm', op: '==', value: 'EXW' }], neg, {});
    const out = satisfyMustHaves(fixed, { unit_price: 40, payment_days: 30 });
    expect(out).toEqual({ unit_price: 40, payment_days: 30 });
    expect(mustHavesOk(fixed, out)).toBe(false);
  });

  it('snaps before it checks, then re-forces (test_snap_before_check)', () => {
    const lead = mkCase([{ field: 'lead_time_days', op: '<=', value: 55 }], ['unit_price', 'lead_time_days'], { lead_time_days: [28, 60] });
    const a = satisfyMustHaves(lead, { unit_price: 40, lead_time_days: 50 }); // 50 fits as typed but would snap to 60
    expect(a.lead_time_days).toBe(28);
    expect(mustHavesOk(lead, a)).toBe(true);
    const vol = mkCase([{ field: 'volume_per_year', op: '>=', value: 9000 }], ['unit_price', 'volume_per_year'], { volume_per_year: [6000, 8000, 10000] });
    const b = satisfyMustHaves(vol, { unit_price: 40, volume_per_year: 8900 }); // snaps down to 8000
    expect(b.volume_per_year).toBe(10000);
  });
});

describe('fix_sheets', () => {
  it('drops duplicates, caps at three and reports changes (test_fix_sheets_dedup_and_cap)', () => {
    const sheets: Terms[] = [{ unit_price: 40, defect_ppm: 2000 }, { unit_price: 40, defect_ppm: 2000 }, ...[39, 38, 37].map((p) => ({ unit_price: p, defect_ppm: 2000 }))];
    const { sheets: out, changes } = fixSheets(quality(), sheets);
    expect(changes.length).toBeGreaterThan(0);
    expect(changes[0]).toBe('defect_ppm 2000 -> 1000');
    expect(out).toHaveLength(3);
    expect(out.every((s) => s.defect_ppm === 1000)).toBe(true);
  });
});

describe('GuardedAgent.decide (single thread)', () => {
  it('fixes the must-have in a delegate counter (test_counter_sheets_fixed)', () => {
    const o = guardDecide(quality(), stuck(), counter(42, 2000));
    expect(o.action).toBe('counter');
    expect(o.sheets[0]).toMatchObject({ unit_price: 42, defect_ppm: 1000 });
    expect(o.log).toEqual(['guard: fixed sheet (must-have): defect_ppm 2000 -> 1000']);
  });

  it('turns a walk-away into a counter twice, then lets the closing move walk (test_walk_becomes_counter_twice_then_closing)', () => {
    const c = quality();
    let th = stuck();
    for (let i = 0; i < 2; i++) {
      const o = guardDecide(c, th, WALK);
      expect(o.action).toBe('counter');
      expect(o.sheets[0]).toMatchObject({ unit_price: 50, defect_ppm: 1000 });
      expect(o.log[0]).toBe('guard: counter at their price on sup:A (delegate wanted to walk)');
      th = { ...th, guardCountersUsed: o.guardCountersUsed };
    }
    const last = guardDecide(c, th, WALK);
    expect(last.action).toBe('walk_away');
    expect(last.rule).toBe('closing_move');
  });

  it('treats a crash like a walk-away (test_exception_treated_as_walk)', () => {
    const o = guardDecide(quality(), stuck(), { type: 'crash' });
    expect(o.sheets[0].defect_ppm).toBe(1000);
    expect(o.reason).toBe('delegate crashed');
  });

  it('accepts a safe standing sheet instead of walking (test_walk_with_safe_sheet_accepts)', () => {
    const o = guardDecide(quality(), moved(), WALK);
    expect(o).toMatchObject({ action: 'accept', termSheetId: 'o1', rule: 'accept_safe_sheet' });
  });

  it('allows one guard counter after a final offer (test_final_offer_one_guard_counter_then_closing)', () => {
    const c = quality();
    const th = stuck({ status: 'final_offer' });
    const first = guardDecide(c, th, WALK);
    expect(first.sheets[0].defect_ppm).toBe(1000);
    expect(guardDecide(c, { ...th, guardCountersUsed: first.guardCountersUsed }, WALK).action).toBe('walk_away');
  });

  it('never ends on a price push (test_last_move_rule)', () => {
    const lastMsg = quality({ roundLimit: 2 }); // one message sent, one left
    const o = guardDecide(lastMsg, stuck(), counter(42));
    expect(o.rule).toBe('counter_on_last_move');
    expect(o.sheets[0]).toMatchObject({ unit_price: 50, defect_ppm: 1000 }); // their price, must-have fixed
    expect(guardDecide(lastMsg, moved(), counter(30)).action).toBe('accept');
    const done = quality({ roundLimit: 1 }); // no message left
    expect(guardDecide(done, moved(), counter(30)).action).toBe('accept');
    expect(guardDecide(done, stuck(), counter(30)).action).toBe('walk_away');
  });

  it('rejects unsafe delegate accepts (test_unsafe_delegate_accepts_are_not_accepts)', () => {
    const acc = (id = 'o1'): Delegate => ({ type: 'accept', termSheetId: id });
    expect(guardDecide(quality(), moved(40, { standing: { unit_price: 40, defect_ppm: 2000 } }), acc()).action).not.toBe('accept'); // must-have broken
    expect(guardDecide(quality(), moved(50), acc('o0')).action).not.toBe('accept'); // stale sheet id
    expect(guardDecide(quality({ alternative: { unit_price: 30 } }), moved(), acc()).action).not.toBe('accept'); // not better than the alternative
    expect(guardDecide(quality(), moved(), acc())).toMatchObject({ action: 'accept', termSheetId: 'o1', rule: 'pass_through' });
  });

  it('accepts early only once the supplier has moved 3% (test_early_accept_rule)', () => {
    const fresh = moved(50, { standingId: 'o0', buyerMessagesSent: 0 });
    const o = guardDecide(quality(), fresh, WALK);
    expect(o.action).toBe('counter');
    expect(o.sheets[0].unit_price).toBe(50);
    expect(guardDecide(quality(), moved(50 * 0.95), WALK).action).toBe('accept');
    expect(guardDecide(quality(), moved(50 * 0.98), WALK).action).toBe('counter');
    expect(guardDecide(quality({ roundLimit: 2 }), moved(50 * 0.98), WALK).action).toBe('accept');
  });

  it('defers a round-one accept of an unmoved opening quote (test_round_one_accept_deferred)', () => {
    const fresh = moved(50, { standingId: 'o0', buyerMessagesSent: 0 });
    const o = guardDecide(quality(), fresh, { type: 'accept', termSheetId: 'o0' });
    expect(o.action).toBe('counter');
    expect(o.sheets[0].unit_price).toBe(50);
    expect(o.guardCountersUsed).toBe(1);
    expect(o.log[0]).toContain('deferred round-1 accept');
    // moved, but we never wrote: the accept passes
    expect(guardDecide(quality(), moved(47.5, { buyerMessagesSent: 0 }), { type: 'accept', termSheetId: 'o1' }).action).toBe('accept');
    // only one message allowed: the accept passes
    expect(guardDecide(quality({ roundLimit: 1 }), fresh, { type: 'accept', termSheetId: 'o0' }).action).toBe('accept');
  });

  it('does not return an accept on an ended thread (test_accept_on_ended_thread_is_not_returned)', () => {
    for (const status of ['walked_away', 'no_bid'] as const) {
      expect(guardDecide(quality(), moved(40, { status }), { type: 'accept', termSheetId: 'o1' }).action).not.toBe('accept');
    }
  });

  it('asks for a quote when there is no priced sheet (test_no_quote_asks_for_one)', () => {
    const th = stuck({ opening: null, standing: null, standingId: null, buyerMessagesSent: 0 });
    expect(guardDecide(quality(), th, WALK)).toMatchObject({ action: 'text', rule: 'ask_quote' });
  });

  it('lets a walk-away stand only when it is hopeless (guard.py:252-269)', () => {
    const c = quality({ alternative: { unit_price: 45 } });
    const o = guardDecide(c, stuck({ status: 'final_offer' }), WALK); // fixed sheet at 50 costs more than the alternative
    expect(o).toMatchObject({ action: 'walk_away', rule: 'walk_away_stands' });
  });
});

describe('checkOffer', () => {
  it('lists violations and the action', () => {
    const must = data.guardCase.mustHaves as MustHave[];
    const bad = checkOffer({ unit_price: 22.5, lead_time_days: 49, payment_days: 30, defect_ppm: 2000 }, must);
    expect(bad.ok).toBe(false);
    expect(bad.action).toBe('fix');
    expect(bad.violations.map((v) => v.field)).toEqual(['lead_time_days', 'payment_days', 'defect_ppm']);
    expect(checkOffer({ lead_time_days: 35, payment_days: 45, defect_ppm: 1000 }, must)).toMatchObject({ ok: true, action: 'pass' });
  });
});

describe('synthetic sandbox case', () => {
  const g = data.guardCase;
  const c = g as unknown as GuardCase;
  const thread = (sheet: keyof typeof g.supplierSheets, over: Partial<ThreadState> = {}): ThreadState => ({
    supplierId: g.supplierId,
    opening: g.supplierSheets[sheet].opening,
    standing: g.supplierSheets[sheet].standing,
    standingId: 'offer:SYN-4',
    status: 'open',
    buyerMessagesSent: 4,
    guardCountersUsed: 0,
    ...over,
  });

  it('is marked synthetic and its default state shows a fix', () => {
    expect(g.synthetic).toBe(true);
    const o = guardDecide(c, thread('breaks'), { type: 'counter', sheets: [g.defaults.draft] });
    expect(o.rule).toBe('fixed_must_have');
    expect(o.sheets[0]).toEqual({ unit_price: 22.5, lead_time_days: 35, payment_days: 45, defect_ppm: 1000 });
    expect(mustHavesOk(c, o.sheets[0])).toBe(true);
  });

  it('every supplier sheet is cheaper than the alternative, so only must-haves decide', () => {
    for (const k of Object.keys(g.supplierSheets) as (keyof typeof g.supplierSheets)[]) {
      const o = guardDecide(c, thread(k), { type: 'walk_away' });
      expect(o.action).toBe(k === 'breaks' ? 'counter' : k === 'complies' ? 'accept' : 'counter');
    }
  });
});

describe('port against outputs of the original guard.py (700cf95)', () => {
  const fx = data.guardFixtures;
  const c = data.guardCase as unknown as GuardCase;

  it.each(fx.guardDecide.map((s) => [s.name, s] as const))('GuardedAgent.decide: %s', (_name, s) => {
    let thread = s.thread as ThreadState;
    for (const want of s.expected as { action: string; termSheetId?: string; sheets: Terms[]; log: string[] }[]) {
      const got = guardDecide(c, thread, s.delegate as Delegate);
      expect(got.action).toBe(want.action);
      expect(got.termSheetId).toBe(want.termSheetId);
      expect(got.sheets).toEqual(want.sheets);
      expect(got.log).toEqual(want.log);
      thread = { ...thread, guardCountersUsed: got.guardCountersUsed }; // the Python object keeps this count between calls
    }
  });

  it.each(fx.satisfyMustHaves.map((s) => [JSON.stringify(s.terms), s] as const))('satisfy_must_haves / fix_sheets: %s', (_name, s) => {
    expect(satisfyMustHaves(c, s.terms as Terms)).toEqual(s.satisfied);
    expect(fixSheets(c, [s.terms as Terms]).changes).toEqual(s.changes);
  });

  it('the rendered must-have verdicts agree with checkOffer on the snapped draft', () => {
    const html = checksHtml(c, data.guardCase.defaults.draft);
    expect(html.match(/data-state="fail"/g)).toHaveLength(3);
    expect(html).toContain('snaps to 49 days');
    const ok = checksHtml(c, { unit_price: 22.5, lead_time_days: 30, payment_days: 60, defect_ppm: 500 });
    expect(ok.match(/data-state="pass"/g)).toHaveLength(3);
    expect(ok).not.toContain('data-state="fail"');
  });
});

describe('S01 replay invariants', () => {
  it('alternates supplier and buyer and ends with an accept of the standing sheet', () => {
    expect(run.events).toHaveLength(12);
    run.events.forEach((e, i) => {
      expect(e.step).toBe(i + 1);
      expect(e.actor).toBe(i % 2 === 0 ? 'supplier' : 'buyer');
    });
    const last = run.events[run.events.length - 1];
    expect(last.decision).toBe('accept');
    expect(last.acceptedTermSheetId).toBe(run.events[run.events.length - 2].termSheets[0].termSheetId);
    expect(run.events[run.events.length - 2].status).toBe('final_offer');
  });

  it('prices converge monotonically and never cross', () => {
    const pts = priceSeries(run);
    const sup = pts.filter((p) => p.actor === 'supplier').map((p) => p.price);
    const buy = pts.filter((p) => p.actor === 'buyer').map((p) => p.price);
    expect(sup).toEqual([17.47, 17.12, 16.77, 16.42, 16.07, 15.72]);
    expect(buy).toEqual([13.98, 14.92, 15.57, 15.6, 15.62]);
    expect(Math.max(...buy)).toBeLessThan(Math.min(...sup));
  });

  it('every sheet passes its recorded checks; rationale tags are annotations, no guard line was logged', () => {
    for (const e of run.events) {
      for (const s of e.termSheets) expect(s.checks.every((ch) => ch.ok)).toBe(true);
      expect(e.guardLog ?? []).toEqual([]);
      for (const t of e.rationale ?? []) expect(t.source).toBe('annotation');
    }
  });

  it('the recorded score follows from the recorded costs', () => {
    const r = run.result;
    expect(score(r.c_open, r.c_deal, r.c_best)).toBeCloseTo(r.score, 4);
    const acc = acceptPoint(run);
    expect(acc).toMatchObject({ step: 12, round: 5, price: 15.72 });
    expect(acc?.sheet.costEur).toBe(r.c_deal);
    for (const e of run.events) {
      for (const s of e.termSheets) {
        if (e.actor === 'supplier' && s.costEur !== null) expect(score(r.c_open, s.costEur, r.c_best)).toBeCloseTo(s.scoreIfAccepted ?? -1, 3);
      }
    }
  });

  it('stateAt tracks the gap', () => {
    expect(stateAt(run, 1)).toMatchObject({ round: 0, supplierPrice: 17.47, buyerPrice: null, gap: null, done: false });
    expect(stateAt(run, 2)).toMatchObject({ round: 1, buyerPrice: 13.98, gap: 3.49 });
    expect(stateAt(run, 11)).toMatchObject({ supplierPrice: 15.72, buyerPrice: 15.62, gap: 0.1, supplierStatus: 'final_offer' });
    expect(stateAt(run, 12).done).toBe(true);
  });
});
