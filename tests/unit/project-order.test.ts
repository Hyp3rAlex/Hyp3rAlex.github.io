import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { FILTER_PRIORITY, NARROW_ALL, orderTable, prioritise } from '../../src/lib/project-order';

const dir = 'src/content/projects';
const projects = readdirSync(dir)
  .filter((f) => f.endsWith('.mdx'))
  .map((f) => {
    const fm = readFileSync(`${dir}/${f}`, 'utf8').split('---')[1];
    const get = (k: string) => fm.match(new RegExp(`^${k}:\\s*(.+)$`, 'm'))?.[1] ?? '';
    return {
      id: f.replace(/\.mdx$/, ''),
      order: Number(get('order')),
      categories: [get('category'), ...get('alsoIn').replace(/[[\]\s]/g, '').split(',').filter(Boolean)],
    };
  })
  .sort((a, b) => a.order - b.order);
const canonical = projects.map((p) => p.id);
const inCategory = (c: string) => new Set(projects.filter((p) => p.categories.includes(c)).map((p) => p.id));
const filters = ['all', 'software', 'data', 'engineering', 'team', 'solo'];
const table = orderTable(canonical, filters);

describe('project presentation order', () => {
  it('keeps the canonical order on wide layouts', () => {
    expect(canonical).toEqual([
      'longisafe-lab',
      'demographics-service',
      'infraflow-mission-control',
      'bmw-ride-planner',
      'tacto-negotiation-arena',
      'portfolio',
    ]);
    expect(table.wide.all).toEqual(canonical);
  });

  it('leads with the phone-friendly visuals on narrow layouts', () => {
    expect(table.narrow.all).toEqual([...NARROW_ALL]);
    expect([...NARROW_ALL].sort()).toEqual([...canonical].sort());
  });

  it('orders the Software filter the same on every layout', () => {
    const visible = (o: string[]) => o.filter((id) => inCategory('software').has(id));
    const expected = [
      'demographics-service',
      'tacto-negotiation-arena',
      'bmw-ride-planner',
      'portfolio',
      'infraflow-mission-control',
    ];
    expect(visible(table.wide.software)).toEqual(expected);
    expect(visible(table.narrow.software)).toEqual(expected);
  });

  it('orders the Data & automation filter the same on every layout', () => {
    const visible = (o: string[]) => o.filter((id) => inCategory('data').has(id));
    const expected = ['longisafe-lab', 'infraflow-mission-control', 'demographics-service', 'tacto-negotiation-arena'];
    expect(visible(table.wide.data)).toEqual(expected);
    expect(visible(table.narrow.data)).toEqual(expected);
  });

  it('leaves the other filters in canonical order on every layout', () => {
    for (const f of ['engineering', 'team', 'solo']) {
      expect(table.wide[f]).toEqual(canonical);
      expect(table.narrow[f]).toEqual(canonical);
    }
  });

  it('only prioritises projects that are members of the category', () => {
    for (const [f, ids] of Object.entries(FILTER_PRIORITY)) for (const id of ids) expect(inCategory(f).has(id)).toBe(true);
  });

  it('never drops or duplicates a project', () => {
    for (const set of [table.wide, table.narrow])
      for (const f of filters) expect([...set[f]].sort()).toEqual([...canonical].sort());
    expect(prioritise(['a', 'b', 'c'], ['c', 'x', 'c'])).toEqual(['c', 'a', 'b']);
  });
});
