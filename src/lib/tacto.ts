/**
 * Tacto Negotiation Arena demo logic. Pure, deterministic, no DOM.
 *
 * Two parts:
 *  1. Replay helpers for the shipped S01 simulator re-run (`src/data/demo/tacto.json`).
 *  2. A TypeScript re-implementation of the must-have guard's rule logic
 *     (`agent/arena_kit/guard.py` @ 700cf95), reduced to one supplier thread and a
 *     simplified cost model. It mirrors the Python control flow; it is not the code
 *     that ran at the hackathon.
 */

/* ------------------------------------------------------------------ */
/* Shared types                                                        */
/* ------------------------------------------------------------------ */

export type Op = '<=' | '<' | '>=' | '>' | '==' | '!=';
export type TermValue = number | string | null;
export type Terms = Record<string, TermValue | undefined>;

export interface MustHave {
  field: string;
  op: Op;
  value: number | string;
}

/* ------------------------------------------------------------------ */
/* Replay                                                              */
/* ------------------------------------------------------------------ */

export interface ReplayCheck {
  check: string;
  ok: boolean;
  field?: string;
  op?: string;
  bound?: number | string | null;
  value?: number | string | null;
}

export interface ReplaySheet {
  termSheetId: string | null;
  terms: Record<string, number | string | null>;
  costEur: number | null;
  mustHavesOk: boolean;
  checks: ReplayCheck[];
  scoreIfAccepted: number | null;
}

export interface RationaleTag {
  tag: string;
  /** `guard_log`: maps 1:1 to a log line emitted by guard.py. `annotation`: derived after the fact. */
  source: 'guard_log' | 'annotation';
}

export interface ReplayEvent {
  step: number;
  round: number;
  actor: 'supplier' | 'buyer';
  status?: string;
  decision?: string;
  acceptedTermSheetId?: string | null;
  movesLeftBefore?: number | null;
  rationale?: RationaleTag[];
  guardLog?: string[];
  text: string;
  termSheets: ReplaySheet[];
}

export interface ReplayRun {
  id: string;
  roundLimit: number;
  events: ReplayEvent[];
  result: { deal: boolean; offer_id: string; c_open: number; c_deal: number; c_best: number; score: number };
}

export interface PricePoint {
  step: number;
  round: number;
  actor: 'supplier' | 'buyer';
  price: number;
}

/** Unit price of the first priced sheet of every message that carries one, in step order. */
export function priceSeries(run: ReplayRun): PricePoint[] {
  const out: PricePoint[] = [];
  for (const e of run.events) {
    const p = e.termSheets[0]?.terms.unit_price;
    if (typeof p === 'number') out.push({ step: e.step, round: e.round, actor: e.actor, price: p });
  }
  return out;
}

/** The buyer's accept event and the supplier sheet it names, or null when the run has no deal. */
export function acceptPoint(run: ReplayRun): { step: number; round: number; price: number; sheet: ReplaySheet } | null {
  const acc = run.events.find((e) => e.actor === 'buyer' && e.decision === 'accept');
  if (!acc) return null;
  for (const e of run.events) {
    const sheet = e.termSheets.find((s) => s.termSheetId !== null && s.termSheetId === acc.acceptedTermSheetId);
    const price = sheet?.terms.unit_price;
    if (sheet && typeof price === 'number') return { step: acc.step, round: acc.round, price, sheet };
  }
  return null;
}

export interface StepState {
  step: number;
  round: number;
  supplierPrice: number | null;
  buyerPrice: number | null;
  gap: number | null;
  /** Simulator score if the supplier's standing sheet were accepted at this step. */
  standingScore: number | null;
  standingCost: number | null;
  supplierStatus: string | null;
  done: boolean;
}

/** State of the negotiation after the event with the given step number (1-based). */
export function stateAt(run: ReplayRun, step: number): StepState {
  const s: StepState = {
    step,
    round: 0,
    supplierPrice: null,
    buyerPrice: null,
    gap: null,
    standingScore: null,
    standingCost: null,
    supplierStatus: null,
    done: false,
  };
  for (const e of run.events) {
    if (e.step > step) break;
    s.round = e.round;
    const sheet = e.termSheets[0];
    const p = sheet?.terms.unit_price;
    if (e.actor === 'supplier') {
      s.supplierStatus = e.status ?? null;
      if (sheet && typeof p === 'number') {
        s.supplierPrice = p;
        s.standingScore = sheet.scoreIfAccepted;
        s.standingCost = sheet.costEur;
      }
    } else {
      if (typeof p === 'number') s.buyerPrice = p;
      if (e.decision === 'accept' || e.decision === 'walk_away') s.done = true;
    }
  }
  if (s.supplierPrice !== null && s.buyerPrice !== null) s.gap = round2(s.supplierPrice - s.buyerPrice);
  return s;
}

/** The organiser's case score as published in the starter kit (`cost.py:178-183`). */
export function score(cOpen: number, cDeal: number | null, cBest: number): number {
  if (cDeal === null) return 0;
  if (cOpen - cBest <= 0.01) return cDeal <= cBest + 0.01 ? 1 : 0;
  return Math.min(1, Math.max(0, (cOpen - cDeal) / (cOpen - cBest)));
}

export const TAG_LABELS: Record<string, string> = {
  first_offer: 'first offer',
  counter_offer: 'counter-offer',
  multi_sheet_package: 'two sheets in one message',
  accept_standing_sheet: 'accept the standing sheet',
  supplier_status_final_offer: 'supplier said “final offer”',
  supplier_status_agreed: 'supplier agreed',
  last_allowed_message: 'last allowed message',
  walk_away: 'walk away',
  text_only_request: 'text only',
};

export const CHECK_LABELS: Record<string, string> = {
  priced: 'has a unit price',
  not_worse_than_opening: 'cost ≤ opening quote',
  beats_alternative: 'cost < alternative',
  must_have: 'must-have',
};

/* ------------------------------------------------------------------ */
/* Guard re-implementation                                             */
/* ------------------------------------------------------------------ */

export interface CostModel {
  volumePerYear: number;
  interestRate: number;
  referencePaymentDays: number;
}

export interface GuardCase {
  caseId: string;
  negotiable: string[];
  termOptions: Record<string, (number | string)[] | undefined>;
  mustHaves: MustHave[];
  /** Buyer-plan defaults used to fill gaps (the kit derives these from the case's buyer block). */
  plan: Terms;
  roundLimit: number;
  cost: CostModel;
  /** Terms of the buyer's alternative; a unit price makes it a priced alternative. */
  alternative?: Terms | null;
}

export type SupplierStatus = 'open' | 'final_offer' | 'agreed' | 'walked_away' | 'no_bid';

export interface ThreadState {
  supplierId: string;
  /** The supplier's first priced sheet, or null when it never quoted. */
  opening: Terms | null;
  /** The supplier's standing sheet, or null when there is none. */
  standing: Terms | null;
  standingId: string | null;
  status: SupplierStatus;
  buyerMessagesSent: number;
  /** Guard counters already sent on this thread (`GuardedAgent._tried`). */
  guardCountersUsed: number;
}

export type Delegate =
  | { type: 'counter'; sheets: Terms[] }
  | { type: 'accept'; termSheetId: string }
  | { type: 'walk_away' }
  | { type: 'text' }
  | { type: 'crash' };

export type GuardRule =
  | 'pass_through'
  | 'fixed_must_have'
  | 'deferred_round1_accept'
  | 'accept_on_last_move'
  | 'counter_on_last_move'
  | 'accept_safe_sheet'
  | 'counter_at_their_price'
  | 'walk_away_stands'
  | 'closing_move'
  | 'ask_quote';

export interface GuardOutcome {
  action: 'counter' | 'accept' | 'walk_away' | 'text';
  /** The rule that produced the final message. */
  rule: GuardRule;
  termSheetId?: string;
  sheets: Terms[];
  /** Readable must-have fixes, one string per changed sheet (`fix_sheets`). */
  changes: string[];
  /** Log lines in the guard's own wording (guard.py), without the case-id prefix. */
  log: string[];
  /** Why the delegate's output was not usable, when the guard took over. */
  reason?: string;
  guardCountersUsed: number;
}

export const MAX_COUNTERS = 2;
export const EARLY_ACCEPT = 0.97;
const ENDED: ReadonlySet<string> = new Set(['walked_away', 'no_bid']);

const round2 = (x: number) => Math.round(x * 100) / 100;
const isNum = (v: unknown): v is number => typeof v === 'number' && !Number.isNaN(v);

/** `_fits`: null never fits; ordering a number against a string is a failure, as Python's TypeError is. */
export function fits(m: MustHave, value: TermValue | undefined): boolean {
  if (value === null || value === undefined) return false;
  if (m.op === '==') return value === m.value;
  if (m.op === '!=') return value !== m.value;
  if (typeof value !== typeof m.value) return false;
  switch (m.op) {
    case '<=':
      return value <= m.value;
    case '<':
      return value < m.value;
    case '>=':
      return value >= m.value;
    case '>':
      return value > m.value;
  }
}

/** `snap` (kit, cost.py): the allowed option closest to `value`; ties go to the lower option. */
export function snap(c: GuardCase, field: string, value: TermValue | undefined): TermValue | undefined {
  const options = c.termOptions[field];
  if (!options || options.length === 0 || value === null || value === undefined || options.includes(value)) return value;
  if (isNum(value) && options.every(isNum)) {
    return [...(options as number[])].sort((a, b) => Math.abs(a - value) - Math.abs(b - value) || a - b)[0];
  }
  return options[0];
}

/** `complete_offer` (kit, cost.py): exactly the negotiable fields, gaps from the plan, values snapped. */
export function completeOffer(c: GuardCase, terms: Terms): Terms {
  const out: Terms = {};
  for (const field of c.negotiable) {
    let value = field in terms ? terms[field] : c.plan[field];
    const options = c.termOptions[field];
    if ((value === null || value === undefined) && options && options.length > 0) value = options[0];
    value = snap(c, field, value);
    out[field] = field === 'unit_price' && isNum(value) ? round2(value) : (value ?? null);
  }
  return out;
}

/** `_must_have_value`: a value for the field that satisfies the must-have, or `current` when none can. */
export function mustHaveValue(c: GuardCase, m: MustHave, current: TermValue | undefined): TermValue | undefined {
  const { op, value: bound } = m;
  const options = (c.termOptions[m.field] ?? []).filter((o) => o !== null);
  if (options.length > 0) {
    const ok = options.filter((o) => fits(m, o));
    if (ok.length === 0) return current;
    if (op === '<=' || op === '<') return (ok as number[]).reduce((a, b) => (b > a ? b : a));
    if (op === '>=' || op === '>') return (ok as number[]).reduce((a, b) => (b < a ? b : a));
    if (op === '!=') return fits(m, current) ? current : ok[0];
    return bound;
  }
  if (op === '<=' || op === '>=' || op === '==') return bound;
  if (op === '!=') return fits(m, current) ? current : isNum(bound) ? bound + 1 : current;
  if (!isNum(bound)) return current;
  const step = Number.isInteger(bound) ? 1 : 0.01;
  return op === '<' ? bound - step : bound + step;
}

/** Closing terms, reduced: the sheet over the buyer plan (no supplier standard terms, no fixed terms). */
function closingTerms(c: GuardCase, terms: Terms): Terms {
  const t: Terms = { ...c.plan };
  for (const [k, v] of Object.entries(terms)) {
    if ((v !== null && v !== undefined) || !(k in c.plan)) t[k] = v;
  }
  return t;
}

/** `must_haves_ok` (kit, cost.py:186-194) on the reduced closing terms. */
export function mustHavesOk(c: GuardCase, terms: Terms): boolean {
  const t = closingTerms(c, terms);
  return c.mustHaves.every((m) => {
    const v = t[m.field];
    if ((v === null || v === undefined) && m.op !== '==' && m.op !== '!=') return false;
    return fits(m, v) || (m.op === '!=' && (v === null || v === undefined));
  });
}

/**
 * Simplified buyer-side total cost: price × volume plus interest on the payment-term difference.
 * The kit's `total_cost` has eleven parts; this keeps two so the sandbox stays readable.
 */
export function totalCost(c: GuardCase, terms: Terms): number {
  const t = closingTerms(c, terms);
  const price = t.unit_price;
  if (!isNum(price)) return Infinity;
  const pay = isNum(t.payment_days) ? t.payment_days : c.cost.referencePaymentDays;
  return c.cost.volumePerYear * price * (1 + (c.cost.interestRate * (c.cost.referencePaymentDays - pay)) / 365);
}

/** `satisfy_must_haves` (guard.py:54-69): force every must-have on a negotiable field, complete, re-force. */
export function satisfyMustHaves(c: GuardCase, terms: Terms): Terms {
  const must = c.mustHaves.filter((m) => c.negotiable.includes(m.field));
  let result: Terms = { ...terms };
  for (const m of must) {
    let cur = result[m.field];
    if (cur !== null && cur !== undefined) cur = snap(c, m.field, cur);
    result[m.field] = fits(m, cur) ? cur : mustHaveValue(c, m, cur);
  }
  result = completeOffer(c, result);
  for (const m of must) {
    // a gap filled from the plan, or a snap, may have broken it again
    if (!fits(m, result[m.field])) result[m.field] = mustHaveValue(c, m, result[m.field]) ?? null;
  }
  return result;
}

const show = (v: TermValue | undefined) => (v === null || v === undefined ? 'None' : String(v));

/** `fix_sheets` (guard.py:72-83): fix each sheet, drop exact duplicates, keep at most three. */
export function fixSheets(c: GuardCase, sheets: Terms[]): { sheets: Terms[]; changes: string[] } {
  const out: Terms[] = [];
  const changes: string[] = [];
  const seen = new Set<string>();
  for (const old of sheets) {
    const fixed = satisfyMustHaves(c, old);
    const change = Object.entries(fixed)
      .filter(([k, v]) => (old[k] ?? null) !== (v ?? null))
      .map(([k, v]) => `${k} ${show(old[k])} -> ${show(v)}`)
      .join(', ');
    if (change) changes.push(change);
    const key = JSON.stringify(fixed);
    if (!seen.has(key)) {
      seen.add(key);
      out.push(fixed);
    }
  }
  return { sheets: out.slice(0, 3), changes };
}

export interface Violation {
  field: string;
  op: Op;
  bound: number | string;
  value: TermValue;
}

/**
 * Check one draft sheet against the must-haves, as written (before any snapping).
 * `action` is what the guard does with an outgoing sheet: pass it, or fix it.
 */
export function checkOffer(offer: Terms, mustHaves: MustHave[]): { ok: boolean; violations: Violation[]; action: 'pass' | 'fix' } {
  const violations: Violation[] = [];
  for (const m of mustHaves) {
    const value = offer[m.field] ?? null;
    if (!fits(m, value)) violations.push({ field: m.field, op: m.op, bound: m.value, value });
  }
  return { ok: violations.length === 0, violations, action: violations.length === 0 ? 'pass' : 'fix' };
}

export const movesLeft = (c: GuardCase, th: ThreadState) => c.roundLimit - th.buyerMessagesSent;

function altCost(c: GuardCase): number {
  return isNum(c.alternative?.unit_price) ? totalCost(c, c.alternative ?? {}) : Infinity;
}

/** `case_c_open` for one thread: C of the opening sheet when it keeps the must-haves, else infinity. */
function openCost(c: GuardCase, th: ThreadState): number {
  return th.opening && isNum(th.opening.unit_price) && mustHavesOk(c, th.opening) ? totalCost(c, th.opening) : Infinity;
}

/** `closing_move` (kit, play.py:136-151) for one thread: accept a safe standing sheet, else walk away. */
export function closingMove(c: GuardCase, th: ThreadState): { action: 'accept' | 'walk_away'; termSheetId?: string } {
  if (!ENDED.has(th.status) && th.standing && th.standingId && mustHavesOk(c, th.standing)) {
    const cost = totalCost(c, th.standing);
    if (cost < altCost(c) && cost <= openCost(c, th)) return { action: 'accept', termSheetId: th.standingId };
  }
  return { action: 'walk_away' };
}

/** `_supplier_moved`: the standing sheet costs at most EARLY_ACCEPT × the opening sheet. */
export function supplierMoved(c: GuardCase, th: ThreadState): boolean {
  if (!th.opening || !isNum(th.opening.unit_price)) return true;
  return totalCost(c, th.standing ?? {}) <= EARLY_ACCEPT * totalCost(c, th.opening);
}

/**
 * `GuardedAgent._decide` and its helpers (guard.py:128-298) for a single supplier thread.
 * Returns what the guard sends instead of, or as, the delegate's decision.
 */
export function guardDecide(c: GuardCase, thread: ThreadState, delegate: Delegate): GuardOutcome {
  const th = { ...thread };
  const sid = th.supplierId;
  const log: string[] = [];
  let changes: string[] = [];
  const left = movesLeft(c, th);
  const standingPrice = th.standing?.unit_price;

  const out = (o: Omit<GuardOutcome, 'log' | 'changes' | 'guardCountersUsed'>): GuardOutcome => ({
    ...o,
    log,
    changes,
    guardCountersUsed: th.guardCountersUsed,
  });
  const fromClose = (rule: GuardRule, reason?: string): GuardOutcome => {
    const close = closingMove(c, th);
    return out({ action: close.action, termSheetId: close.termSheetId, sheets: [], rule, reason });
  };
  const counter = (rule: GuardRule, reason?: string): GuardOutcome => {
    th.guardCountersUsed += 1;
    if (!th.standing || !isNum(standingPrice)) return out({ action: 'text', sheets: [], rule: 'ask_quote', reason });
    return out({ action: 'counter', sheets: [satisfyMustHaves(c, { ...th.standing })], rule, reason });
  };
  const eligible = (): boolean => {
    const cap = th.status === 'final_offer' ? 1 : MAX_COUNTERS;
    return !ENDED.has(th.status) && th.status !== 'agreed' && left >= 1 && th.guardCountersUsed < cap;
  };
  const hopeless = (): boolean => {
    const cAlt = altCost(c);
    if (cAlt === Infinity) return false;
    if (ENDED.has(th.status)) return true;
    if (th.status !== 'final_offer' && left >= 1) return false;
    if (th.standing && isNum(standingPrice) && totalCost(c, satisfyMustHaves(c, { ...th.standing })) < cAlt) return false;
    return true;
  };
  /** Rule d: never walk while something sensible is left. */
  const keepGoing = (reason: string): GuardOutcome => {
    const close = closingMove(c, th);
    if (close.action === 'walk_away' && reason === 'delegate wanted to walk' && hopeless()) {
      log.push('guard: walk away stands (every thread is final, no counter beats the alternative)');
      return out({ action: 'walk_away', sheets: [], rule: 'walk_away_stands', reason });
    }
    if (close.action === 'accept' && (left <= 1 || !eligible() || supplierMoved(c, th))) {
      log.push(`guard: accept a safe standing sheet (${reason})`);
      return out({ action: 'accept', termSheetId: close.termSheetId, sheets: [], rule: 'accept_safe_sheet', reason });
    }
    if (!eligible()) {
      log.push(`guard: closing move, no thread left to continue (${reason})`);
      return fromClose('closing_move', reason);
    }
    log.push(`guard: counter at their price on ${sid} (${reason})`);
    return counter('counter_at_their_price', reason);
  };
  /** Rule e: on the last allowed message, a price push the supplier will refuse is replaced. */
  const lastMove = (pass: GuardOutcome): GuardOutcome => {
    if (left > 1) return pass;
    if (left < 1) {
      log.push(`guard: closing move (no messages left on ${sid})`);
      return fromClose('closing_move');
    }
    const prices = pass.sheets.map((s) => s.unit_price).filter(isNum);
    if (!isNum(standingPrice) || prices.length === 0 || Math.min(...prices) >= standingPrice) return pass;
    const close = closingMove(c, th);
    if (close.action === 'accept') {
      log.push('guard: accept on last move (a lower counter would be refused)');
      return out({ action: 'accept', termSheetId: close.termSheetId, sheets: [], rule: 'accept_on_last_move' });
    }
    log.push('guard: must-have counter at their price on last move');
    return counter('counter_on_last_move');
  };

  if (delegate.type === 'accept') {
    const safe =
      !ENDED.has(th.status) &&
      th.standing !== null &&
      th.standingId !== null &&
      th.standingId === delegate.termSheetId &&
      mustHavesOk(c, th.standing) &&
      totalCost(c, th.standing) < altCost(c);
    if (!safe) return keepGoing('delegate accept is not safe');
    if (th.buyerMessagesSent === 0 && left > 1 && !supplierMoved(c, th)) {
      log.push(`guard: deferred round-1 accept on ${sid} (unmoved opening offer)`);
      return counter('deferred_round1_accept');
    }
    return out({ action: 'accept', termSheetId: delegate.termSheetId, sheets: [], rule: 'pass_through' });
  }
  if (delegate.type === 'counter' && delegate.sheets.length > 0) {
    const fixed = fixSheets(c, delegate.sheets);
    changes = fixed.changes;
    for (const ch of changes) log.push(`guard: fixed sheet (must-have): ${ch}`);
    return lastMove(out({ action: 'counter', sheets: fixed.sheets, rule: changes.length > 0 ? 'fixed_must_have' : 'pass_through' }));
  }
  if (delegate.type === 'text' || delegate.type === 'counter') {
    return lastMove(out({ action: 'text', sheets: [], rule: 'pass_through' }));
  }
  if (delegate.type === 'crash') log.push('guard: delegate crashed');
  return keepGoing(delegate.type === 'crash' ? 'delegate crashed' : 'delegate wanted to walk');
}

/* ------------------------------------------------------------------ */
/* Sandbox presentation (shared by the server render and the client)    */
/* ------------------------------------------------------------------ */

export const RULE_TEXT: Record<GuardRule, string> = {
  pass_through: 'Passed through unchanged. The guard had nothing to correct.',
  fixed_must_have: 'Sheet rewritten, then sent: values are snapped to the allowed options and every must-have is forced in.',
  deferred_round1_accept: 'Accept deferred: the supplier has not moved from its opening quote and we have not written yet. One counter at its own price is sent first.',
  accept_on_last_move: 'Last allowed message: a lower counter would be refused and end without a deal, so the safe standing sheet is accepted instead.',
  counter_on_last_move: 'Last allowed message: the price push is replaced by the supplier’s own price with the must-haves satisfied.',
  accept_safe_sheet: 'The delegate’s output was not usable, and a safe standing sheet exists: it is accepted.',
  counter_at_their_price: 'The delegate’s output was not usable. Instead of ending the case, the guard counters at the supplier’s own price with the must-haves satisfied.',
  walk_away_stands: 'The walk-away stands: the supplier is at its final offer and even the must-have-fixed sheet costs no less than the alternative.',
  closing_move: 'Nothing left to try on this thread: the kit’s closing move decides (accept a safe standing sheet, else walk away).',
  ask_quote: 'No priced sheet to counter: the guard asks for a quote.',
};

export const ACTION_TEXT: Record<GuardOutcome['action'], string> = {
  counter: 'Send counter-offer',
  accept: 'Accept standing sheet',
  walk_away: 'Walk away',
  text: 'Send text-only message',
};

const esc = (s: string) => s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch] ?? ch);

export const FIELD_LABELS: Record<string, string> = {
  unit_price: 'Unit price',
  lead_time_days: 'Lead time',
  payment_days: 'Payment term',
  defect_ppm: 'Defect rate',
};
const UNITS: Record<string, string> = { unit_price: 'EUR', lead_time_days: 'days', payment_days: 'days', defect_ppm: 'ppm' };

export function formatTerm(field: string, v: TermValue | undefined): string {
  if (v === null || v === undefined) return 'not set';
  const val = field === 'unit_price' && isNum(v) ? v.toFixed(2) : String(v);
  return UNITS[field] ? `${val} ${UNITS[field]}` : val;
}

/** HTML for the must-have check list of a draft sheet (value as typed, then as snapped). */
export function checksHtml(c: GuardCase, draft: Terms, who = 'draft'): string {
  const snappedTerms: Terms = {};
  for (const m of c.mustHaves) snappedTerms[m.field] = snap(c, m.field, draft[m.field]);
  const failed = new Set(checkOffer(snappedTerms, c.mustHaves).violations.map((v) => v.field));
  const rows = c.mustHaves.map((m) => {
    const raw = draft[m.field];
    const snapped = snappedTerms[m.field];
    const ok = !failed.has(m.field);
    const snapNote = snapped !== raw && raw !== null && raw !== undefined ? ` <span class="tq-dim">snaps to ${esc(formatTerm(m.field, snapped))}</span>` : '';
    return (
      `<li><span class="verdict" data-state="${ok ? 'pass' : 'fail'}"><span aria-hidden="true">${ok ? '✓' : '✕'}</span> ${ok ? 'pass' : 'fail'}</span>` +
      `<span class="tq-rule"><code>${esc(m.field)} ${esc(m.op)} ${esc(String(m.value))}</code></span>` +
      `<span class="tq-val">${esc(who)}: ${esc(formatTerm(m.field, raw))}${snapNote}</span></li>`
    );
  });
  return rows.join('');
}

/** HTML for the guard's outcome panel. */
export function outcomeHtml(c: GuardCase, o: GuardOutcome, draftSheets: Terms[] = []): string {
  const parts: string[] = [];
  const state = o.rule === 'pass_through' ? 'pass' : o.action === 'walk_away' ? 'fail' : 'warn';
  const verdict = o.rule === 'pass_through' ? 'no intervention' : 'guard intervened';
  parts.push(
    `<p class="tq-head"><span class="verdict" data-state="${state}"><span aria-hidden="true">${state === 'pass' ? '✓' : state === 'fail' ? '✕' : '▲'}</span> ${verdict}</span>` +
      `<strong>${esc(ACTION_TEXT[o.action])}${o.termSheetId ? ` <code>${esc(o.termSheetId)}</code>` : ''}</strong></p>`,
  );
  parts.push(`<p class="tq-why">${esc(RULE_TEXT[o.rule])}${o.reason ? ` <span class="tq-dim">Reason logged: “${esc(o.reason)}”.</span>` : ''}</p>`);
  if (o.sheets.length > 0) {
    const before = draftSheets[0];
    const rows = c.negotiable
      .map((f) => {
        const v = o.sheets[0][f];
        const changed = before !== undefined && o.rule !== 'counter_at_their_price' && o.rule !== 'counter_on_last_move' && o.rule !== 'deferred_round1_accept' && (before[f] ?? null) !== (v ?? null);
        return `<tr><th scope="row">${esc(FIELD_LABELS[f] ?? f)}</th><td>${esc(formatTerm(f, v))}${changed ? ` <span class="tq-chg">changed from ${esc(formatTerm(f, before[f]))}</span>` : ''}</td></tr>`;
      })
      .join('');
    const ok = mustHavesOk(c, o.sheets[0]);
    parts.push(
      `<table class="tq-sheet"><caption>Sheet the guard sends · <span class="verdict" data-state="${ok ? 'pass' : 'fail'}"><span aria-hidden="true">${ok ? '✓' : '✕'}</span> must-haves ${ok ? 'hold' : 'broken'}</span></caption><tbody>${rows}</tbody></table>`,
    );
  }
  if (o.log.length > 0) {
    parts.push(`<p class="tq-loglabel">Guard log line${o.log.length > 1 ? 's' : ''} (wording of guard.py)</p><pre class="tq-log">${o.log.map(esc).join('\n')}</pre>`);
  } else {
    parts.push('<p class="tq-loglabel">Guard log: no line emitted</p>');
  }
  return parts.join('');
}

/** One-sentence plain-text summary for the live region. */
export function outcomeSummary(o: GuardOutcome): string {
  const what = ACTION_TEXT[o.action].toLowerCase();
  return o.rule === 'pass_through' ? `Guard passes the decision through: ${what}.` : `Guard intervenes: ${what}. ${RULE_TEXT[o.rule]}`;
}
