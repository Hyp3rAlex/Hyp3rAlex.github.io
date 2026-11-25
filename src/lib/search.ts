export interface SearchItem {
  id: string;
  title: string;
  hint?: string;
  group: 'Pages' | 'Projects' | 'Actions';
  href?: string;
  action?: 'copy-email' | 'theme';
  keywords?: string;
  external?: boolean;
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

/** Score one item against a query. Higher is better; 0 means no match. Every query term must match. */
export function score(item: SearchItem, query: string): number {
  const terms = norm(query).split(/\s+/).filter(Boolean);
  if (!terms.length) return 1;
  const title = norm(item.title);
  const rest = norm(`${item.hint ?? ''} ${item.keywords ?? ''} ${item.group}`);
  let total = 0;
  for (const t of terms) {
    let s = 0;
    if (title === t) s = 100;
    else if (title.startsWith(t)) s = 60;
    else if (title.split(/[\s/&·-]+/).some((w) => w.startsWith(t))) s = 40;
    else if (title.includes(t)) s = 25;
    else if (rest.split(/[\s,/&·-]+/).some((w) => w.startsWith(t))) s = 12;
    else if (rest.includes(t)) s = 6;
    if (s === 0) return 0;
    total += s;
  }
  return total;
}

/** Filter and rank; stable for equal scores so the authored order is the tiebreak. */
export function search(items: readonly SearchItem[], query: string): SearchItem[] {
  return items
    .map((item, i) => ({ item, i, s: score(item, query) }))
    .filter((r) => r.s > 0)
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((r) => r.item);
}
