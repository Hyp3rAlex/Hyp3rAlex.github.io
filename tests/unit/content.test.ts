import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { CV_FOCUS, cvFilename } from '../../src/data/cv';
import { focusAreas, person } from '../../src/data/profile';
import { capabilities } from '../../src/data/capabilities';
import allow from '../../src/data/repos.json';

const root = join(__dirname, '../..');
const projectsDir = join(root, 'src/content/projects');
const files = readdirSync(projectsDir).filter((f) => f.endsWith('.mdx'));
const slugs = files.map((f) => f.replace(/\.mdx$/, ''));
const read = (f: string) => readFileSync(join(projectsDir, f), 'utf8');

/** Phrases that must never appear in published copy (see the owner's claim rules). */
const forbidden: [RegExp, string][] = [
  [/lorem ipsum|\bTODO\b|\bTBD\b|coming soon/i, 'placeholder text'],
  [/ISO ?26262[- ](certified|compliant)/i, 'safety certification claim'],
  [/\b(10x|rockstar|ninja|wizard|world[- ]class|cutting[- ]edge)\b/i, 'hype wording'],
  [/intern(ship)? at (BMW|Tacto|Esri)/i, 'false employment claim'],
  [/\+49[\s\d]{8,}/, 'phone number'],
  [/\blines? (of code )?attributed to me\b|\bby blame\b/i, 'line-count statistics presented as an achievement'],
  [/neural network|machine[- ]learning model|trained model/i, 'ML claim for rule-based work'],
];

describe('project content', () => {
  it('has the five required case studies', () => {
    for (const required of [
      'longisafe-lab',
      'demographics-service',
      'infraflow-mission-control',
      'bmw-ride-planner',
      'tacto-negotiation-arena',
    ]) {
      expect(slugs).toContain(required);
    }
  });

  it.each(files)('%s has the required sections and no forbidden wording', (file) => {
    const src = read(file);
    for (const heading of ['## Summary', '## Architecture', '## Validation', '## My contribution', '## Limitations']) {
      expect(src, `${file} is missing "${heading}"`).toContain(heading);
    }
    for (const [pattern, why] of forbidden) {
      expect(src.match(pattern)?.[0], `${file}: ${why}`).toBeUndefined();
    }
  });

  it.each(files)('%s keeps scrollable tables keyboard-reachable', (file) => {
    // A horizontally scrollable region must be focusable (WCAG 2.1.1); axe only catches it at narrow widths.
    expect(read(file)).not.toMatch(/class="table-scroll"\s*>/);
  });

  it.each(files)('%s states team attribution when it is team work', (file) => {
    const src = read(file);
    if (/^team: true$/m.test(src)) {
      expect(src).toMatch(/^collaborators:/m);
      // Owner-confirmed: he led both hackathon teams. The role line must say so.
      expect(src).toMatch(/^role: Team Lead\b/m);
      expect(src).not.toMatch(/\bI (built|designed|wrote|implemented) the (whole|entire)\b/i);
    }
  });
});

describe('site data integrity', () => {
  it('recruiter focus areas and capabilities only reference existing projects', () => {
    const known = new Set([...slugs, 'portfolio']);
    for (const f of focusAreas) for (const id of f.projects) expect(known.has(id), `${f.id} → ${id}`).toBe(true);
    for (const c of capabilities)
      for (const item of c.items) for (const id of item.evidence) expect(known.has(id), `${c.title} → ${id}`).toBe(true);
  });

  it('every case study with a repo is on the metadata allowlist', () => {
    const listed = new Set(allow.repos.map((r) => r.fullName));
    for (const file of files) {
      const repo = read(file).match(/^repo: (\S+)$/m)?.[1];
      if (repo) expect(listed.has(repo), `${file}: ${repo}`).toBe(true);
    }
  });

  it('public CV folder holds only canonical PDFs that match the manifest', () => {
    const dir = join(root, 'public', 'cv');
    if (!existsSync(dir)) return; // a tree without CVs is valid: the site falls back to a request by email
    const allowed = new Set<string>(CV_FOCUS.flatMap((f) => [cvFilename(f, 'en'), cvFilename(f, 'de')]));
    const present = readdirSync(dir);
    const pdfs = present.filter((f) => f !== 'manifest.json');
    // Nothing but the six canonical public PDFs: no DOCX, no private copies, no drafts under other names.
    for (const f of pdfs) expect(allowed.has(f), `unexpected file in public/cv: ${f}`).toBe(true);
    if (pdfs.length === 0) return;
    const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')) as {
      status: string;
      files: { file: string; focus: string; lang: string; pages: number; paper: string; bytes: number; sha256: string }[];
    };
    expect(['draft', 'approved']).toContain(manifest.status);
    expect(manifest.files.map((f) => f.file).sort()).toEqual([...pdfs].sort());
    for (const entry of manifest.files) {
      const bytes = readFileSync(join(dir, entry.file));
      expect(bytes.subarray(0, 5).toString('latin1'), entry.file).toBe('%PDF-');
      expect(bytes.length, entry.file).toBe(entry.bytes);
      expect(createHash('sha256').update(bytes).digest('hex'), entry.file).toBe(entry.sha256);
      expect(entry.file).toBe(cvFilename(entry.focus as (typeof CV_FOCUS)[number], entry.lang as 'en' | 'de'));
      expect(entry.paper).toBe('A4');
      expect(entry.pages).toBeGreaterThanOrEqual(1);
      expect(entry.pages).toBeLessThanOrEqual(2);
    }
  });

  it('publishes only the approved contact channels', () => {
    expect(person.email).toBe('alexander.yordanov.bg@gmail.com');
    expect(Object.keys(person)).not.toContain('phone');
  });
});
