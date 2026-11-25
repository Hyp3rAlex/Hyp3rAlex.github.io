/**
 * Presentation order of project cards.
 *
 * The canonical order is the `order` field of each case study. Two views deviate from it on purpose:
 * - narrow, single-column layouts lead with the projects whose visuals read best on a phone
 *   (home page and the unfiltered Work list);
 * - the Software and Data & automation filters lead with the most relevant project for that category,
 *   on every device.
 * Every other view keeps the canonical order. Recruiter mode and the CVs have their own ordering
 * (`focusAreas` in src/data/profile.ts) and do not use this module.
 */

/** Unfiltered order for single-column layouts. */
export const NARROW_ALL = [
  'longisafe-lab',
  'bmw-ride-planner',
  'tacto-negotiation-arena',
  'demographics-service',
  'infraflow-mission-control',
  'portfolio',
] as const;

/** Category filters with their own priority, identical on every device. */
export const FILTER_PRIORITY: Record<string, readonly string[]> = {
  software: ['demographics-service', 'tacto-negotiation-arena', 'bmw-ride-planner', 'portfolio'],
  data: ['longisafe-lab', 'infraflow-mission-control', 'demographics-service', 'tacto-negotiation-arena'],
};

/** Ids in `priority` first (those that exist), then everything else in canonical order. */
export function prioritise(canonical: readonly string[], priority: readonly string[]): string[] {
  const known = new Set(canonical);
  const head = priority.filter((id, i) => known.has(id) && priority.indexOf(id) === i);
  return [...head, ...canonical.filter((id) => !head.includes(id))];
}

export interface OrderTable {
  /** Full list order per filter id; filters not listed use `all`… of the wide layout (canonical). */
  wide: Record<string, string[]>;
  narrow: Record<string, string[]>;
}

/**
 * Order of the whole list for every filter and layout. The list always contains every project;
 * filtering hides items, so the order of a filtered view is the order of its visible items.
 * The displayed number of a card is its position in `all` for the current layout.
 */
export function orderTable(canonical: readonly string[], filters: readonly string[] = ['all']): OrderTable {
  const wide: Record<string, string[]> = {};
  const narrow: Record<string, string[]> = {};
  for (const f of filters) {
    const fixed = FILTER_PRIORITY[f];
    wide[f] = fixed ? prioritise(canonical, fixed) : [...canonical];
    narrow[f] = fixed ? prioritise(canonical, fixed) : f === 'all' ? prioritise(canonical, NARROW_ALL) : [...canonical];
  }
  return { wide, narrow };
}
