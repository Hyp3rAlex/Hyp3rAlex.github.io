import { describe, expect, it } from 'vitest';
import data from '../../src/data/demo/rideplanner.json';
import {
  FASTEST,
  MinHeap,
  RidePlanner,
  buildDemoView,
  demoPreferences,
  formatKm,
  formatMinutes,
  type DemoState,
  contourPath,
  heightField,
  meanTwist,
  costMultiplier,
  edgeCost,
  edgeMinutes,
  edgePath,
  preferenceSignature,
  reversePath,
  routeKey,
  routePath,
  type Preferences,
  type RideEdge,
  type RideGraph,
} from '../../src/lib/rideplanner';

const graph = data as unknown as RideGraph;
const prefs = (p: Partial<Preferences>): Preferences => ({ ...FASTEST, ...p });

/** Every simple path from → to, by depth-first enumeration. Independent of the heap and of Dijkstra. */
function allSimplePaths(g: RideGraph, from: string, to: string): RideEdge[][] {
  const out: RideEdge[][] = [];
  const seen = new Set<string>([from]);
  const walk = (node: string, trail: RideEdge[]) => {
    if (node === to) {
      out.push([...trail]);
      return;
    }
    for (const e of g.edges) {
      const next = e.a === node ? e.b : e.b === node ? e.a : null;
      if (next === null || seen.has(next)) continue;
      seen.add(next);
      trail.push(e);
      walk(next, trail);
      trail.pop();
      seen.delete(next);
    }
  };
  walk(from, []);
  return out;
}

function bruteForceBest(g: RideGraph, from: string, to: string, p: Preferences): { cost: number; key: string } | null {
  let best: { cost: number; key: string } | null = null;
  for (const path of allSimplePaths(g, from, to)) {
    let cost = 0;
    let ok = true;
    for (const e of path) {
      const c = edgeCost(e, p);
      if (c === null) {
        ok = false;
        break;
      }
      cost += c;
    }
    if (ok && (best === null || cost < best.cost)) best = { cost, key: path.map((e) => e.id).join('>') };
  }
  return best;
}

describe('synthetic graph fixture', () => {
  it('is labelled synthetic and is internally consistent', () => {
    expect(data.provenance.kind).toBe('synthetic');
    expect(graph.nodes.length).toBeGreaterThanOrEqual(18);
    expect(graph.nodes.length).toBeLessThanOrEqual(30);
    const ids = new Set(graph.nodes.map((n) => n.id));
    expect(ids.size).toBe(graph.nodes.length);
    for (const e of graph.edges) {
      expect(ids.has(e.a) && ids.has(e.b)).toBe(true);
      expect(e.lengthKm).toBeGreaterThan(0);
      expect(e.speedKmh).toBeGreaterThan(0);
      for (const v of [e.scenic, e.risk, e.twist]) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
    expect(graph.edges.some((e) => e.roadClass === 'motorway')).toBe(true);
  });
});

describe('cost function', () => {
  const e = graph.edges.find((x) => x.id === 'N2-N3')!;

  it('reduces to travel time when every coefficient is zero', () => {
    expect(costMultiplier(e, FASTEST)).toBe(1);
    expect(edgeCost(e, FASTEST)).toBeCloseTo(edgeMinutes(e), 12);
  });

  it('follows time × (1 + α(1 − scenic) + β·risk + h·highway + s·(1 − twist))', () => {
    const p = prefs({ alpha: 2, beta: 3, highway: 1, straight: 0.5 });
    // N2-N3: scenic 0.97, risk 0.35, twist 0.9, tertiary (highway weight 0)
    expect(costMultiplier(e, p)).toBeCloseTo(1 + 2 * 0.03 + 3 * 0.35 + 0 + 0.5 * 0.1, 12);
    const m = graph.edges.find((x) => x.roadClass === 'motorway')!;
    expect(costMultiplier(m, prefs({ highway: 1 }))).toBeCloseTo(6, 12);
  });

  it('never drops below travel time, even for negative coefficients', () => {
    for (const edge of graph.edges) {
      for (const p of [prefs({ alpha: 10, beta: 4 }), prefs({ alpha: -3, beta: -1, highway: -2, straight: -5 })]) {
        expect(edgeCost(edge, p)!).toBeGreaterThanOrEqual(edgeMinutes(edge));
      }
    }
  });

  it('returns null for an excluded class instead of a large number', () => {
    const m = graph.edges.find((x) => x.roadClass === 'motorway')!;
    expect(edgeCost(m, prefs({ exclude: ['motorway'] }))).toBeNull();
  });
});

describe('Dijkstra against brute-force enumeration', () => {
  const planner = new RidePlanner(graph);

  it('α = 0 with no penalties returns the minimum-time path', () => {
    const paths = allSimplePaths(graph, 'A', 'B');
    expect(paths.length).toBeGreaterThan(100);
    const best = bruteForceBest(graph, 'A', 'B', FASTEST)!;
    const route = planner.fastest('A', 'B')!;
    expect(routeKey(route)).toBe(best.key);
    expect(route.minutes).toBeCloseTo(best.cost, 9);
    expect(route.cost).toBeCloseTo(route.minutes, 9);
    expect(route.nodes).toEqual(['A', 'M1', 'M2', 'S', 'M3', 'M4', 'B']);
  });

  it('matches brute force over a sweep of preferences and endpoints', () => {
    const cases: Preferences[] = [];
    for (const alpha of [0, 0.5, 1.4, 2, 3, 4.5, 6]) {
      for (const beta of [0, 1, 2.5]) {
        cases.push(prefs({ alpha, beta }));
        cases.push(prefs({ alpha, beta, highway: 1 }));
        cases.push(prefs({ alpha, beta, straight: 2.5, exclude: ['motorway'] }));
      }
    }
    for (const [from, to] of [
      ['A', 'B'],
      ['N3', 'L3'],
      ['P2', 'L5'],
    ] as const) {
      for (const p of cases) {
        const best = bruteForceBest(graph, from, to, p)!;
        const route = planner.route(from, to, p)!;
        expect(route.cost).toBeCloseTo(best.cost, 9);
        expect(routeKey(route)).toBe(best.key);
      }
    }
  });
});

describe('preferences change the route', () => {
  const planner = new RidePlanner(graph);
  const via = (p: Partial<Preferences>) => planner.route('A', 'B', prefs(p))!.nodes.join('>');
  const MOTORWAY = 'A>M1>M2>S>M3>M4>B';
  const PRIMARY = 'A>P1>P2>P3>P4>B';
  const LAKE = 'A>L1>L2>L3>L4>L5>B';
  const PASS = 'A>N1>N2>N3>N4>N5>B';

  it('raising α at β = 1 moves motorway → primary road → lake road → mountain pass', () => {
    expect(via({ alpha: 0, beta: 1 })).toBe(MOTORWAY);
    expect(via({ alpha: 2, beta: 1 })).toBe(PRIMARY);
    expect(via({ alpha: 3, beta: 1 })).toBe(LAKE);
    expect(via({ alpha: 5, beta: 1 })).toBe(PASS);
  });

  it('the scenic route is slower and more scenic than the fastest one', () => {
    const fast = planner.fastest('A', 'B')!;
    const scenic = planner.route('A', 'B', prefs({ alpha: 3, beta: 1 }))!;
    expect(scenic.minutes).toBeGreaterThan(fast.minutes);
    expect(scenic.meanScenic).toBeGreaterThan(fast.meanScenic + 0.4);
  });

  it('risk aversion turns the pass back into the lake road at the same α', () => {
    expect(via({ alpha: 3, beta: 0 })).toBe(PASS);
    expect(via({ alpha: 3, beta: 1 })).toBe(LAKE);
  });

  it('the soft highway penalty and the hard exclusion give different answers at α = 0', () => {
    expect(via({ exclude: ['motorway'] })).toBe(PRIMARY);
    expect(via({ highway: 1 })).toBe(LAKE);
  });

  it('reports the α values where the route flips', () => {
    const flips = planner.alphaBreakpoints('A', 'B', prefs({ beta: 1 }), 6, 0.1);
    expect(flips.map((f) => f.alpha)).toEqual([0, 1.4, 2.7, 4.5]);
    expect(flips.map((f) => f.route.nodes.join('>'))).toEqual([MOTORWAY, PRIMARY, LAKE, PASS]);
  });
});

describe('hard exclusion', () => {
  const planner = new RidePlanner(graph);

  it('never returns an excluded edge, for any α and β', () => {
    for (let alpha = 0; alpha <= 6; alpha += 0.5) {
      for (let beta = 0; beta <= 4; beta += 1) {
        for (const to of ['B', 'M3', 'L4', 'N4']) {
          const route = planner.route('A', to, prefs({ alpha, beta, exclude: ['motorway'] }));
          expect(route).not.toBeNull();
          expect(route!.edges.every((e) => e.roadClass !== 'motorway')).toBe(true);
        }
      }
    }
  });

  it('returns null for a target only reachable over excluded edges', () => {
    expect(planner.route('A', 'S', prefs({ exclude: ['motorway'] }))).toBeNull();
    expect(planner.route('A', 'S', prefs({ alpha: 6, beta: 4, exclude: ['motorway'] }))).toBeNull();
  });

  it('plan() falls back without the exclusion and says so', () => {
    const blocked = planner.plan('A', 'S', prefs({ alpha: 2, exclude: ['motorway'] }));
    expect(blocked.fallback).toBe(true);
    expect(blocked.route!.nodes.at(-1)).toBe('S');
    expect(blocked.route!.edges.some((e) => e.roadClass === 'motorway')).toBe(true);
    const fine = planner.plan('A', 'B', prefs({ exclude: ['motorway'] }));
    expect(fine.fallback).toBe(false);
  });

  it('handles a disconnected node and a zero-length request', () => {
    const island: RideGraph = { nodes: [...graph.nodes, { id: 'Z', x: 0, y: 0 }], edges: graph.edges };
    const p = new RidePlanner(island);
    expect(p.route('A', 'Z', FASTEST)).toBeNull();
    expect(p.plan('A', 'Z', prefs({ exclude: ['motorway'] }))).toEqual({ route: null, fallback: true });
    const same = p.route('A', 'A', FASTEST)!;
    expect(same.edges).toHaveLength(0);
    expect(same.minutes).toBe(0);
    expect(same.meanScenic).toBe(0);
    expect(() => p.route('A', 'nope', FASTEST)).toThrow();
  });
});

describe('memoised edge costs', () => {
  it('builds one table per preference signature and reuses it', () => {
    const planner = new RidePlanner(graph);
    const p = prefs({ alpha: 3, beta: 1 });
    const first = planner.route('A', 'B', p)!;
    expect(planner.stats).toEqual({ signatures: 1, hits: 0, misses: 1 });
    const second = planner.route('A', 'B', { ...p, exclude: [] })!;
    const third = planner.route('N1', 'L5', p)!;
    expect(planner.stats).toEqual({ signatures: 1, hits: 2, misses: 1 });
    expect(second).toEqual(first);
    expect(planner.costTable(p)).toBe(planner.costTable(p));
    expect(third.cost).toBeGreaterThan(0);
  });

  it('gives the same routes as an uncached planner', () => {
    const warm = new RidePlanner(graph);
    for (let round = 0; round < 2; round++) {
      for (let alpha = 0; alpha <= 6; alpha += 0.75) {
        const p = prefs({ alpha, beta: 1 });
        expect(warm.route('A', 'B', p)).toEqual(new RidePlanner(graph).route('A', 'B', p));
      }
    }
    expect(warm.stats.hits).toBe(warm.stats.misses);
  });

  it('signature distinguishes every preference field and ignores exclusion order', () => {
    const base = prefs({ alpha: 1, beta: 1 });
    const sigs = new Set([
      preferenceSignature(base),
      preferenceSignature({ ...base, alpha: 1.1 }),
      preferenceSignature({ ...base, beta: 0 }),
      preferenceSignature({ ...base, highway: 1 }),
      preferenceSignature({ ...base, straight: 1 }),
      preferenceSignature({ ...base, exclude: ['motorway'] }),
    ]);
    expect(sigs.size).toBe(6);
    expect(preferenceSignature({ ...base, exclude: ['primary', 'motorway'] })).toBe(
      preferenceSignature({ ...base, exclude: ['motorway', 'primary', 'motorway'] }),
    );
  });

  it('is bounded: the oldest table is evicted first', () => {
    const planner = new RidePlanner(graph, 3);
    for (const alpha of [0, 1, 2, 3]) planner.route('A', 'B', prefs({ alpha }));
    expect(planner.stats.signatures).toBe(3);
    planner.route('A', 'B', prefs({ alpha: 0 }));
    expect(planner.stats.misses).toBe(5);
  });
});

describe('heap and geometry helpers', () => {
  it('pops in cost order and breaks ties by insertion order', () => {
    const heap = new MinHeap();
    const input = [5, 1, 4, 1, 9, 2, 6, 5, 3, 5, 0, 7];
    input.forEach((c, i) => heap.push(c, i));
    const out: [number, number][] = [];
    while (heap.size > 0) {
      const item = heap.pop()!;
      out.push([item.cost, item.node]);
    }
    const expected = input.map((c, i) => [c, i] as [number, number]).sort((x, y) => x[0] - y[0] || x[1] - y[1]);
    expect(out).toEqual(expected);
    expect(heap.pop()).toBeUndefined();
  });

  it('draws straight roads as lines and twisty roads as curves, deterministically', () => {
    const a = { id: 'a', x: 0, y: 0 };
    const b = { id: 'b', x: 100, y: 0 };
    expect(edgePath(a, b, 0)).toBe('M0 0L100 0');
    const curvy = edgePath(a, b, 0.9);
    expect(curvy).toMatch(/^M0 0(Q[-\d. ]+)+$/);
    expect(curvy.endsWith('100 0')).toBe(true);
    expect(edgePath(a, b, 0.9)).toBe(curvy);
    expect(reversePath(reversePath(curvy))).toBe(curvy);
    expect(reversePath(curvy).startsWith('M100 0')).toBe(true);
  });

  it('builds one continuous path for a route', () => {
    const planner = new RidePlanner(graph);
    const d = routePath(graph, planner.route('B', 'A', { ...FASTEST, alpha: 3, beta: 1 })!);
    expect(d.match(/M/g)).toHaveLength(1);
    expect(d.startsWith('M676 180')).toBe(true);
    expect(d.endsWith('48 196')).toBe(true);
  });
});

describe('card-visual helpers', () => {
  it('contours of a single round hill lie on a circle of the expected radius', () => {
    const field = heightField([{ x: 100, y: 100, h: 1, sx: 50, sy: 50 }]);
    const level = Math.exp(-1); // reached at distance 50 from the peak
    const d = contourPath(field, level, { x0: 0, y0: 0, x1: 200, y1: 200 }, 10);
    const pts = [...d.matchAll(/[ML]([-\d.]+) ([-\d.]+)/g)].map((m) => Math.hypot(Number(m[1]) - 100, Number(m[2]) - 100));
    expect(pts.length).toBeGreaterThan(40);
    for (const r of pts) expect(Math.abs(r - 50)).toBeLessThan(1.5);
    expect(contourPath(field, 2, { x0: 0, y0: 0, x1: 200, y1: 200 }, 10)).toBe('');
  });

  it('mean twist is length-weighted and higher on the scenic route', () => {
    const planner = new RidePlanner(graph);
    const fast = planner.fastest('A', 'B')!;
    const scenic = planner.route('A', 'B', prefs({ alpha: 3, beta: 1 }))!;
    const expected = fast.edges.reduce((s, e) => s + e.twist * e.lengthKm, 0) / fast.km;
    expect(meanTwist(fast)).toBeCloseTo(expected, 12);
    expect(meanTwist(scenic)).toBeGreaterThan(meanTwist(fast) + 0.3);
    expect(meanTwist(planner.route('A', 'A', FASTEST)!)).toBe(0);
  });
});

describe('demo view', () => {
  const base: DemoState = { from: 'A', to: 'B', alpha: 3, beta: 1, softHighway: false, avoidMotorways: false, softStraight: false };
  const view = (s: Partial<DemoState>, planner = new RidePlanner(graph)) => buildDemoView(graph, planner, new RidePlanner(graph, 128), { ...base, ...s });

  it('maps the controls onto preferences', () => {
    expect(demoPreferences(base)).toEqual({ alpha: 3, beta: 1, highway: 0, straight: 0, exclude: [] });
    expect(demoPreferences({ ...base, softHighway: true, avoidMotorways: true, softStraight: true })).toEqual({
      alpha: 3,
      beta: 1,
      highway: 1,
      straight: 2.5,
      exclude: ['motorway'],
    });
  });

  it('formats times and distances', () => {
    expect(formatMinutes(47.3)).toBe('47 min');
    expect(formatMinutes(79.5)).toBe('80 min');
    expect(formatKm(95.66)).toBe('95.7 km');
  });

  it('renders the default state: lake road against the motorway', () => {
    const v = view({});
    expect(v.status).toContain('A → L1 → L2 → L3 → L4 → L5 → B: 79 min, 95.7 km, mean scenic 0.69');
    expect(v.status).toContain('32 min longer than the fastest route (47 min');
    expect(v.readout).toContain('fastest 47 min · +67%');
    expect(v.readout).toContain('1.4 · 2.7 · 4.5');
    expect(v.svg.match(/class="rp-fast"/g)).toHaveLength(1);
    expect(v.svg.match(/class="rp-pref"/g)).toHaveLength(1);
    expect(v.svg.match(/<text /g)).toHaveLength(graph.nodes.length);
    expect(v.svg).not.toContain('rp-x');
    // 6 preferred edges + 6 fastest edges, each with a total row and a group row
    expect(v.table.match(/<tr>/g)).toHaveLength(1 + 12);
    expect(v.table.match(/class="rp-total"/g)).toHaveLength(2);
  });

  it('says when the preferred route is the fastest route', () => {
    const v = view({ alpha: 0 });
    expect(v.status).toContain('equals the fastest route');
    expect(v.readout).toContain('same as fastest');
  });

  it('marks excluded motorway edges and reports the fallback', () => {
    const blocked = view({ alpha: 0, avoidMotorways: true });
    expect(blocked.svg.match(/class="rp-x"/g)).toHaveLength(4);
    expect(blocked.status).toContain('A → P1 → P2 → P3 → P4 → B');
    expect(blocked.table).toContain('excluded');
    expect(blocked.table).toContain('not allowed');
    const fallback = view({ to: 'S', avoidMotorways: true });
    expect(fallback.status).toContain('motorway required');
    expect(fallback.svg).not.toContain('rp-x');
  });

  it('applies the straight-road penalty', () => {
    expect(view({ alpha: 1 }).status).toContain('equals the fastest route');
    expect(view({ alpha: 1, softStraight: true }).status).toContain('N3');
  });

  it('handles identical start and destination', () => {
    const v = view({ to: 'A' });
    expect(v.status).toContain('same node');
    expect(v.table).toBe('');
  });

  it('counts reuse only when a preference signature is revisited', () => {
    const planner = new RidePlanner(graph);
    expect(view({}, planner).readout).toContain('1 built · 0 reused');
    expect(view({ alpha: 4 }, planner).readout).toContain('2 built · 0 reused');
    expect(view({ alpha: 5 }, planner).readout).toContain('3 built · 0 reused');
    expect(view({ alpha: 4 }, planner).readout).toContain('3 built · 1 reused');
  });
});
