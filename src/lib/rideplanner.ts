/**
 * Preference-weighted routing on a small synthetic road graph.
 *
 * A clean-room TypeScript re-implementation of the scoring principle used by the
 * team hackathon project "BMW Motorrad Ride Planner" (audited at dde641f):
 *
 *   cost(e) = time(e) × ( 1 + α·(1 − scenic) + β·risk + h·highway[class] + s·(1 − twist) )
 *
 * Every term inside the bracket is ≥ 0, so cost ≥ time > 0 and plain Dijkstra stays exact.
 * Safety-style constraints are not terms in the sum: excluded edges are removed before the search.
 * Edge costs are memoised per preference signature, mirroring the request-local
 * memoisation of the project's performance layer.
 *
 * Nothing here is ported from the project's Python source; the junction delay,
 * time-of-day and rider-capability terms of the original are deliberately not modelled.
 */

export type RoadClass = 'motorway' | 'primary' | 'secondary' | 'tertiary';

export interface RideNode {
  id: string;
  x: number;
  y: number;
  name?: string;
}

export interface RideEdge {
  id: string;
  a: string;
  b: string;
  lengthKm: number;
  speedKmh: number;
  /** 0 = nothing to look at, 1 = the road you came for. */
  scenic: number;
  /** 0 = benign, 1 = hazardous. */
  risk: number;
  /** 0 = dead straight, 1 = continuous corners. */
  twist: number;
  roadClass: RoadClass;
}

export interface RideGraph {
  nodes: RideNode[];
  edges: RideEdge[];
}

export interface Preferences {
  /** Extra time the rider will trade for a better road. */
  alpha: number;
  /** Risk aversion. */
  beta: number;
  /** Soft penalty coefficient on major-road classes. */
  highway: number;
  /** Soft penalty coefficient on straight roads. */
  straight: number;
  /** Hard exclusion: edges of these classes are removed before the search. */
  exclude: readonly RoadClass[];
}

/** α = β = h = s = 0 and nothing excluded: cost is travel time, so the route is the minimum-time route. */
export const FASTEST: Preferences = Object.freeze({ alpha: 0, beta: 0, highway: 0, straight: 0, exclude: [] });

/**
 * Per-class weight of the soft highway penalty. The two non-zero values follow the
 * team's table for the same classes (their hand-chosen constants, not data).
 */
export const HIGHWAY_WEIGHT: Readonly<Record<RoadClass, number>> = Object.freeze({
  motorway: 5,
  primary: 1,
  secondary: 0,
  tertiary: 0,
});

export const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Travel time of one edge in minutes. */
export function edgeMinutes(e: RideEdge): number {
  return (e.lengthKm / e.speedKmh) * 60;
}

/** The bracket of the cost formula. Always ≥ 1 because negative coefficients are clamped to 0. */
export function costMultiplier(e: RideEdge, p: Preferences): number {
  return (
    1 +
    Math.max(0, p.alpha) * (1 - clamp01(e.scenic)) +
    Math.max(0, p.beta) * clamp01(e.risk) +
    Math.max(0, p.highway) * HIGHWAY_WEIGHT[e.roadClass] +
    Math.max(0, p.straight) * (1 - clamp01(e.twist))
  );
}

export function isExcluded(e: RideEdge, p: Preferences): boolean {
  return p.exclude.includes(e.roadClass);
}

/** Generalised cost in "weighted minutes", or `null` when the edge is excluded. */
export function edgeCost(e: RideEdge, p: Preferences): number | null {
  return isExcluded(e, p) ? null : edgeMinutes(e) * costMultiplier(e, p);
}

/** Stable key for a preference set: equal preferences always produce the same key. */
export function preferenceSignature(p: Preferences): string {
  const n = (v: number) => Math.max(0, v).toFixed(4);
  return [n(p.alpha), n(p.beta), n(p.highway), n(p.straight), [...new Set(p.exclude)].sort().join('+')].join('|');
}

/* ---------- Binary min-heap, ordered by (cost, sequence) so ties resolve deterministically ---------- */

interface HeapItem {
  cost: number;
  seq: number;
  node: number;
}

export class MinHeap {
  private items: HeapItem[] = [];
  private seq = 0;

  get size(): number {
    return this.items.length;
  }

  push(cost: number, node: number): void {
    const item = { cost, seq: this.seq++, node };
    const a = this.items;
    let i = a.length;
    a.push(item);
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (!MinHeap.less(item, a[parent]!)) break;
      a[i] = a[parent]!;
      i = parent;
    }
    a[i] = item;
  }

  pop(): HeapItem | undefined {
    const a = this.items;
    const top = a[0];
    const last = a.pop();
    if (top === undefined || last === undefined) return undefined;
    if (a.length === 0) return top;
    let i = 0;
    const half = a.length >> 1;
    while (i < half) {
      let child = 2 * i + 1;
      if (child + 1 < a.length && MinHeap.less(a[child + 1]!, a[child]!)) child++;
      if (!MinHeap.less(a[child]!, last)) break;
      a[i] = a[child]!;
      i = child;
    }
    a[i] = last;
    return top;
  }

  private static less(x: HeapItem, y: HeapItem): boolean {
    return x.cost < y.cost || (x.cost === y.cost && x.seq < y.seq);
  }
}

/* ---------- Planner ---------- */

export interface Route {
  nodes: string[];
  edges: RideEdge[];
  /** Sum of generalised edge costs under the preferences used. */
  cost: number;
  minutes: number;
  km: number;
  /** Length-weighted mean scenic score. */
  meanScenic: number;
  /** Time-weighted mean risk. */
  meanRisk: number;
}

export interface CacheStats {
  /** Edge-cost tables currently held. */
  signatures: number;
  /** route() calls served from an existing table. */
  hits: number;
  /** route() calls that had to build a table. */
  misses: number;
}

export function summarise(nodes: string[], edges: RideEdge[], cost: number): Route {
  let minutes = 0;
  let km = 0;
  let scenicKm = 0;
  let riskMin = 0;
  for (const e of edges) {
    const m = edgeMinutes(e);
    minutes += m;
    km += e.lengthKm;
    scenicKm += e.scenic * e.lengthKm;
    riskMin += e.risk * m;
  }
  return {
    nodes,
    edges,
    cost,
    minutes,
    km,
    meanScenic: km > 0 ? scenicKm / km : 0,
    meanRisk: minutes > 0 ? riskMin / minutes : 0,
  };
}

export class RidePlanner {
  readonly graph: RideGraph;
  private readonly index = new Map<string, number>();
  /** Per node: [edge index, far node index]. Built once, like the prebuilt arcs of the original. */
  private readonly arcs: [number, number][][];
  private readonly tables = new Map<string, (number | null)[]>();
  private readonly maxTables: number;
  private hits = 0;
  private misses = 0;

  constructor(graph: RideGraph, maxTables = 64) {
    this.graph = graph;
    this.maxTables = Math.max(1, maxTables);
    graph.nodes.forEach((n, i) => this.index.set(n.id, i));
    this.arcs = graph.nodes.map(() => []);
    graph.edges.forEach((e, i) => {
      const a = this.index.get(e.a);
      const b = this.index.get(e.b);
      if (a === undefined || b === undefined) throw new Error(`Edge ${e.id} references an unknown node`);
      if (!(e.lengthKm > 0) || !(e.speedKmh > 0)) throw new Error(`Edge ${e.id} needs positive length and speed`);
      this.arcs[a]!.push([i, b]);
      this.arcs[b]!.push([i, a]);
    });
  }

  get stats(): CacheStats {
    return { signatures: this.tables.size, hits: this.hits, misses: this.misses };
  }

  /** Edge costs for a preference set, computed once per signature (bounded, oldest evicted first). */
  costTable(p: Preferences): readonly (number | null)[] {
    const key = preferenceSignature(p);
    const cached = this.tables.get(key);
    if (cached) {
      this.hits++;
      return cached;
    }
    this.misses++;
    const table = this.graph.edges.map((e) => edgeCost(e, p));
    if (this.tables.size >= this.maxTables) {
      const oldest = this.tables.keys().next().value;
      if (oldest !== undefined) this.tables.delete(oldest);
    }
    this.tables.set(key, table);
    return table;
  }

  /** Dijkstra from `from` to `to`. Returns `null` when no path avoids the excluded edges. */
  route(from: string, to: string, p: Preferences): Route | null {
    const s = this.index.get(from);
    const t = this.index.get(to);
    if (s === undefined || t === undefined) throw new Error('Unknown start or end node');
    const weights = this.costTable(p);
    const n = this.graph.nodes.length;
    const dist = new Array<number>(n).fill(Infinity);
    const prevEdge = new Array<number>(n).fill(-1);
    const prevNode = new Array<number>(n).fill(-1);
    const heap = new MinHeap();
    dist[s] = 0;
    heap.push(0, s);
    while (heap.size > 0) {
      const top = heap.pop()!;
      const u = top.node;
      if (top.cost > dist[u]!) continue; // stale entry
      if (u === t) break;
      for (const [ei, v] of this.arcs[u]!) {
        const w = weights[ei];
        if (w === null || w === undefined) continue; // hard exclusion
        const nd = top.cost + w;
        if (nd < dist[v]!) {
          dist[v] = nd;
          prevEdge[v] = ei;
          prevNode[v] = u;
          heap.push(nd, v);
        }
      }
    }
    if (dist[t] === Infinity) return null;
    const nodes: string[] = [];
    const edges: RideEdge[] = [];
    for (let cur = t; cur !== s; cur = prevNode[cur]!) {
      nodes.push(this.graph.nodes[cur]!.id);
      edges.push(this.graph.edges[prevEdge[cur]!]!);
    }
    nodes.push(this.graph.nodes[s]!.id);
    return summarise(nodes.reverse(), edges.reverse(), dist[t]!);
  }

  /** The reference route: pure travel time, nothing excluded. */
  fastest(from: string, to: string): Route | null {
    return this.route(from, to, FASTEST);
  }

  /**
   * Preferred route with the two-pass rule for hard exclusions: try with the exclusion,
   * and only if that leaves no path, search again without it and flag the result.
   */
  plan(from: string, to: string, p: Preferences): { route: Route | null; fallback: boolean } {
    const strict = this.route(from, to, p);
    if (strict || p.exclude.length === 0) return { route: strict, fallback: false };
    return { route: this.route(from, to, { ...p, exclude: [] }), fallback: true };
  }

  /**
   * Values of α (on a grid of `step`) at which the chosen route changes, other preferences fixed.
   * Each entry is the first grid value where the new route applies.
   */
  alphaBreakpoints(from: string, to: string, base: Preferences, max = 10, step = 0.1): { alpha: number; route: Route }[] {
    const out: { alpha: number; route: Route }[] = [];
    let last = '';
    const steps = Math.round(max / step);
    for (let i = 0; i <= steps; i++) {
      const alpha = Number((i * step).toFixed(6));
      const { route } = this.plan(from, to, { ...base, alpha });
      if (!route) continue;
      const key = routeKey(route);
      if (key !== last) {
        out.push({ alpha, route });
        last = key;
      }
    }
    return out;
  }
}

export const routeKey = (r: Route): string => r.edges.map((e) => e.id).join('>');

/* ---------- Geometry (pure, shared by the card visual and the demo) ---------- */

/**
 * SVG path for an edge. Straight roads are straight lines; twisty roads get a
 * deterministic number of alternating bends whose amplitude grows with `twist`.
 */
export function edgePath(a: RideNode, b: RideNode, twist: number, scale = 1): string {
  const f = (v: number) => (Math.round(v * scale * 10) / 10).toString();
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  const t = clamp01(twist);
  if (len === 0 || t < 0.12) return `M${f(a.x)} ${f(a.y)}L${f(b.x)} ${f(b.y)}`;
  const bends = Math.max(1, Math.round((len / 34) * (0.35 + t)));
  const amp = Math.min(len / (bends * 1.6), 4 + 13 * t);
  const nx = -dy / len;
  const ny = dx / len;
  let d = `M${f(a.x)} ${f(a.y)}`;
  for (let i = 0; i < bends; i++) {
    const side = i % 2 === 0 ? 1 : -1;
    const mid = (i + 0.5) / bends;
    const end = (i + 1) / bends;
    const cx = a.x + dx * mid + nx * amp * 2 * side;
    const cy = a.y + dy * mid + ny * amp * 2 * side;
    d += `Q${f(cx)} ${f(cy)} ${f(a.x + dx * end)} ${f(a.y + dy * end)}`;
  }
  return d;
}

/** Path for a whole route, following each edge in travel direction. */
export function routePath(graph: RideGraph, route: Route, scale = 1): string {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  return route.edges
    .map((e, i) => {
      const forward = route.nodes[i] === e.a;
      // Always trace the edge from its own `a` so the bends coincide with the base network,
      // then walk it backwards when travelling b → a.
      const d = edgePath(byId.get(e.a)!, byId.get(e.b)!, e.twist, scale);
      return forward ? d : reversePath(d);
    })
    .map((d, i) => (i === 0 ? d : d.replace(/^M[^LQ]+/, '')))
    .join('');
}

/** Reverse a path made of one M followed by L or Q segments. */
export function reversePath(d: string): string {
  const nums = (s: string) => s.trim().split(/[ ,]+/).map(Number);
  const m = /^M([^LQ]+)(.*)$/.exec(d);
  if (!m) return d;
  const pts: { ctrl?: [number, number]; to: [number, number] }[] = [];
  const start = nums(m[1]!) as [number, number];
  for (const seg of m[2]!.matchAll(/([LQ])([^LQ]+)/g)) {
    const v = nums(seg[2]!);
    if (seg[1] === 'L') pts.push({ to: [v[0]!, v[1]!] });
    else pts.push({ ctrl: [v[0]!, v[1]!], to: [v[2]!, v[3]!] });
  }
  let out = `M${pts.length ? pts[pts.length - 1]!.to.join(' ') : start.join(' ')}`;
  for (let i = pts.length - 1; i >= 0; i--) {
    const to = i === 0 ? start : pts[i - 1]!.to;
    const c = pts[i]!.ctrl;
    out += c ? `Q${c.join(' ')} ${to.join(' ')}` : `L${to.join(' ')}`;
  }
  return out;
}

export const formatMinutes = (m: number): string => `${Math.round(m)} min`;
export const formatKm = (km: number): string => `${km.toFixed(1)} km`;

/* ---------- Procedural terrain for the card visual (decoration only, not data) ---------- */

export interface Hill {
  x: number;
  y: number;
  /** Peak height; negative values make a basin. */
  h: number;
  sx: number;
  sy: number;
}

/** A smooth synthetic height field: a sum of Gaussian hills. */
export function heightField(hills: readonly Hill[]): (x: number, y: number) => number {
  return (x, y) => {
    let z = 0;
    for (const k of hills) z += k.h * Math.exp(-(((x - k.x) / k.sx) ** 2 + ((y - k.y) / k.sy) ** 2));
    return z;
  };
}

/**
 * Contour line of `field` at `level` inside a box, by marching squares with linear interpolation.
 * Returns one SVG path made of independent segments (ambiguous saddle cells are split consistently).
 */
export function contourPath(
  field: (x: number, y: number) => number,
  level: number,
  box: { x0: number; y0: number; x1: number; y1: number },
  step: number,
): string {
  const f = (v: number) => (Math.round(v * 10) / 10).toString();
  const cols = Math.ceil((box.x1 - box.x0) / step);
  const rows = Math.ceil((box.y1 - box.y0) / step);
  const z: number[][] = [];
  for (let j = 0; j <= rows; j++) {
    const row: number[] = [];
    for (let i = 0; i <= cols; i++) row.push(field(box.x0 + i * step, box.y0 + j * step) - level);
    z.push(row);
  }
  let d = '';
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const x = box.x0 + i * step;
      const y = box.y0 + j * step;
      const a = z[j]![i]!; // top-left
      const b = z[j]![i + 1]!; // top-right
      const c = z[j + 1]![i + 1]!; // bottom-right
      const e = z[j + 1]![i]!; // bottom-left
      const pts: string[] = [];
      // Crossing points on the four cell edges, in the order top, right, bottom, left.
      if (a > 0 !== b > 0) pts.push(`${f(x + (step * a) / (a - b))} ${f(y)}`);
      if (b > 0 !== c > 0) pts.push(`${f(x + step)} ${f(y + (step * b) / (b - c))}`);
      if (e > 0 !== c > 0) pts.push(`${f(x + (step * e) / (e - c))} ${f(y + step)}`);
      if (a > 0 !== e > 0) pts.push(`${f(x)} ${f(y + (step * a) / (a - e))}`);
      if (pts.length === 2) d += `M${pts[0]}L${pts[1]}`;
      else if (pts.length === 4) {
        // Saddle: pair by the sign of the cell centre so neighbouring cells agree.
        const centre = (a + b + c + e) / 4 > 0;
        const [t, r, bo, l] = pts as [string, string, string, string];
        d += centre === a > 0 ? `M${t}L${r}M${bo}L${l}` : `M${t}L${l}M${r}L${bo}`;
      }
    }
  }
  return d;
}

/** Length-weighted mean twist of a route: the "curvature" figure shown on the card visual. */
export function meanTwist(r: Route): number {
  return r.km > 0 ? r.edges.reduce((sum, e) => sum + e.twist * e.lengthKm, 0) / r.km : 0;
}

/* ---------- Demo view (pure string builders, used for the server render and in the browser) ---------- */

export interface DemoState {
  from: string;
  to: string;
  alpha: number;
  beta: number;
  /** Soft penalty: h = 1 on major-road classes. */
  softHighway: boolean;
  /** Hard exclusion of the motorway class. */
  avoidMotorways: boolean;
  /** Soft penalty: s = 2.5 on straight roads. */
  softStraight: boolean;
}

export interface DemoView {
  svg: string;
  readout: string;
  table: string;
  status: string;
}

export function demoPreferences(s: DemoState): Preferences {
  return {
    alpha: s.alpha,
    beta: s.beta,
    highway: s.softHighway ? 1 : 0,
    straight: s.softStraight ? 2.5 : 0,
    exclude: s.avoidMotorways ? ['motorway'] : [],
  };
}

const CLASS_LABEL: Readonly<Record<RoadClass, string>> = {
  motorway: 'Motorway',
  primary: 'Primary',
  secondary: 'Secondary',
  tertiary: 'Minor',
};

/** Node labels sit above their node, except on the two southern corridors, where they hang below. */
const labelBelow = (id: string): boolean => id.startsWith('L') || id.startsWith('M') || id === 'S';

const cell = (k: string, v: string, sub: string) => `<div><dt>${k}</dt><dd>${v}</dd><dd class="rp-sub">${sub}</dd></div>`;

/**
 * Everything the demo shows for one state. `planner` is the long-lived planner whose cache statistics
 * are displayed, so it only ever sees the preferred-route request. `scan` is a separate planner for the
 * fixed fastest route and the α sweep, which would otherwise register as reuse on every update.
 */
export function buildDemoView(graph: RideGraph, planner: RidePlanner, scan: RidePlanner, s: DemoState): DemoView {
  const prefs = demoPreferences(s);
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const fast = scan.fastest(s.from, s.to);
  const { route: pref, fallback } = planner.plan(s.from, s.to, prefs);
  const flips = scan.alphaBreakpoints(s.from, s.to, prefs, 6, 0.1).slice(1);
  const stats = planner.stats;

  /* --- SVG --- */
  const net = graph.edges
    .map((e) => {
      const d = edgePath(byId.get(e.a)!, byId.get(e.b)!, e.twist);
      const off = isExcluded(e, prefs) && !fallback;
      if (e.roadClass !== 'motorway') return `<path class="rp-e rp-e--${e.roadClass}" d="${d}"/>`;
      const a = byId.get(e.a)!;
      const b = byId.get(e.b)!;
      const cross = off ? `<path class="rp-x" d="M${(a.x + b.x) / 2 - 5} ${(a.y + b.y) / 2 - 5}l10 10m-10 0l10 -10"/>` : '';
      return `<path class="rp-e rp-mw-out${off ? ' is-off' : ''}" d="${d}"/><path class="rp-e rp-mw-in" d="${d}"/>${cross}`;
    })
    .join('');
  const routes =
    (fast && fast.edges.length ? `<path class="rp-fast" d="${routePath(graph, fast)}"/>` : '') +
    (pref && pref.edges.length ? `<path class="rp-pref" d="${routePath(graph, pref)}"/>` : '');
  const nodes = graph.nodes
    .map((n) => {
      const below = labelBelow(n.id);
      const end = n.id === s.from ? ' rp-n--from' : n.id === s.to ? ' rp-n--to' : '';
      const mark =
        n.id === s.from
          ? `<rect class="rp-n${end}" x="${n.x - 6}" y="${n.y - 6}" width="12" height="12"/>`
          : `<circle class="rp-n${end}" cx="${n.x}" cy="${n.y}" r="${n.id === s.to ? 7 : 3.5}"/>`;
      return `${mark}<text class="rp-l${end ? ' rp-l--end' : ''}${below ? ' rp-l--below' : ''}" x="${n.x}" y="${n.y + (below ? 10 : -10)}">${n.id}</text>`;
    })
    .join('');
  const svg = `<g>${net}</g>${routes}<g>${nodes}</g>`;

  /* --- Readout, table, status --- */
  const name = (r: Route) => r.nodes.join(' → ');
  if (!fast || !pref) {
    const msg = `No route exists between ${s.from} and ${s.to} on this graph.`;
    return { svg, readout: cell('Result', 'No route', msg), table: '', status: msg };
  }
  if (pref.edges.length === 0) {
    const msg = 'Start and destination are the same node: nothing to route.';
    return { svg, readout: cell('Result', '0 min', msg), table: '', status: msg };
  }
  const extra = pref.minutes - fast.minutes;
  const pct = fast.minutes > 0 ? Math.round((extra / fast.minutes) * 100) : 0;
  const same = routeKey(pref) === routeKey(fast);
  const readout =
    cell('Time', formatMinutes(pref.minutes), same ? 'same as fastest' : `fastest ${formatMinutes(fast.minutes)} · +${pct}%`) +
    cell('Distance', formatKm(pref.km), same ? 'same as fastest' : `fastest ${formatKm(fast.km)}`) +
    cell('Mean scenic', pref.meanScenic.toFixed(2), `fastest ${fast.meanScenic.toFixed(2)} · length-weighted`) +
    cell('Mean risk', pref.meanRisk.toFixed(2), `fastest ${fast.meanRisk.toFixed(2)} · time-weighted`) +
    cell('Route changes at <span class="rp-lc">α</span>', flips.length ? flips.map((f) => f.alpha.toFixed(1)).join(' · ') : 'never', 'for this β and these switches, α 0–6') +
    cell('Edge-cost tables', `${stats.misses} built · ${stats.hits} reused`, `${stats.signatures} held, one per preference signature`);

  const rows = (label: string, r: Route) => {
    let cost = 0;
    let anyOff = false;
    const body = r.edges
      .map((e, i) => {
        const c = edgeCost(e, prefs);
        if (c === null) anyOff = true;
        else cost += c;
        const m = edgeMinutes(e);
        return `<tr><td>${r.nodes[i]} → ${r.nodes[i + 1]}</td><td>${CLASS_LABEL[e.roadClass]}</td><td class="num">${e.lengthKm.toFixed(1)}</td><td class="num">${m.toFixed(1)}</td><td class="num">${e.scenic.toFixed(2)}</td><td class="num">${e.risk.toFixed(2)}</td><td class="num">${c === null ? 'excluded' : '× ' + costMultiplier(e, prefs).toFixed(2)}</td><td class="num">${c === null ? '—' : c.toFixed(1)}</td></tr>`;
      })
      .join('');
    return `<tbody><tr class="rp-group"><th colspan="8" scope="rowgroup">${label}: ${name(r)}</th></tr>${body}<tr class="rp-total"><th scope="row" colspan="2">Total</th><td class="num">${r.km.toFixed(1)}</td><td class="num">${r.minutes.toFixed(1)}</td><td class="num">${r.meanScenic.toFixed(2)}</td><td class="num">${r.meanRisk.toFixed(2)}</td><td></td><td class="num">${anyOff ? 'not allowed' : cost.toFixed(1)}</td></tr></tbody>`;
  };
  const table =
    `<table><caption class="visually-hidden">Edges of the preferred and the fastest route, with the cost of each edge under the current preferences</caption>` +
    `<thead><tr><th scope="col">Edge</th><th scope="col">Class</th><th scope="col" class="num">km</th><th scope="col" class="num">min</th><th scope="col" class="num">Scenic</th><th scope="col" class="num">Risk</th><th scope="col" class="num">Multiplier</th><th scope="col" class="num">Cost</th></tr></thead>` +
    rows('Preferred', pref) +
    rows('Fastest', fast) +
    `</table>`;

  const status =
    (fallback ? `No motorway-free route reaches ${s.to}, so motorways were allowed again (motorway required). ` : '') +
    (same
      ? `Preferred route equals the fastest route: ${name(pref)}, ${formatMinutes(pref.minutes)}, ${formatKm(pref.km)}.`
      : `Preferred route ${name(pref)}: ${formatMinutes(pref.minutes)}, ${formatKm(pref.km)}, mean scenic ${pref.meanScenic.toFixed(2)}. That is ${formatMinutes(extra)} longer than the fastest route (${formatMinutes(fast.minutes)}, mean scenic ${fast.meanScenic.toFixed(2)}).`);
  return { svg, readout, table, status };
}
