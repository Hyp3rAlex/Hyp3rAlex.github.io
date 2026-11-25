import { describe, expect, it } from 'vitest';
import { search, score, type SearchItem } from '../../src/lib/search';

const items: SearchItem[] = [
  { id: 'work', title: 'Work', group: 'Pages', href: '/projects/', keywords: 'projects case studies' },
  { id: 'contact', title: 'Contact', group: 'Pages', href: '/contact/', keywords: 'email linkedin' },
  { id: 'demo', title: 'Demographics Service', hint: 'Software', group: 'Projects', href: '/p/', keywords: 'Java Spring Boot PostgreSQL' },
  { id: 'longi', title: 'LongiSafe Lab', group: 'Projects', href: '/l/', keywords: 'Python Excel VBA' },
  { id: 'resume', title: 'Résumé', group: 'Pages', href: '/resume/', keywords: 'cv' },
];

describe('command palette search', () => {
  it('returns everything in authored order for an empty query', () => {
    expect(search(items, '  ').map((i) => i.id)).toEqual(items.map((i) => i.id));
  });
  it('ranks title matches above keyword matches', () => {
    expect(search(items, 'con')[0].id).toBe('contact');
    expect(search(items, 'java').map((i) => i.id)).toEqual(['demo']);
  });
  it('requires every term to match', () => {
    expect(search(items, 'spring python')).toEqual([]);
    expect(search(items, 'spring boot').map((i) => i.id)).toEqual(['demo']);
  });
  it('is case- and diacritic-insensitive', () => {
    expect(search(items, 'RESUME')[0].id).toBe('resume');
    expect(search(items, 'résumé')[0].id).toBe('resume');
  });
  it('scores an exact title highest and a miss as zero', () => {
    expect(score(items[0], 'work')).toBeGreaterThan(score(items[0], 'wo'));
    expect(score(items[0], 'zzz')).toBe(0);
  });
});
