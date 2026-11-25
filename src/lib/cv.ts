import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CV_FOCUS, cvFilename, type CvFile, type CvFocus, type CvLang } from '../data/cv';

interface ManifestEntry {
  file: string;
  focus: string;
  lang: string;
  pages: number;
  paper: string;
  bytes: number;
}

const dir = join(process.cwd(), 'public', 'cv');

/**
 * Build-time list of downloadable CVs: entries of `public/cv/manifest.json` whose file exists and
 * carries the canonical name for its specialization and language. Anything else is ignored, so a
 * stray or renamed file can never be linked.
 */
export function loadCvs(): CvFile[] {
  const manifestPath = join(dir, 'manifest.json');
  if (!existsSync(manifestPath)) return [];
  let entries: ManifestEntry[];
  try {
    entries = JSON.parse(readFileSync(manifestPath, 'utf8')).files ?? [];
  } catch {
    return [];
  }
  const out: CvFile[] = [];
  for (const e of entries) {
    const focus = CV_FOCUS.find((f) => f === e.focus) as CvFocus | undefined;
    const lang = e.lang === 'en' || e.lang === 'de' ? (e.lang as CvLang) : undefined;
    if (!focus || !lang) continue;
    if (e.file !== cvFilename(focus, lang)) continue;
    if (!existsSync(join(dir, e.file))) continue;
    out.push({ focus, lang, file: e.file, href: `/cv/${e.file}`, pages: e.pages, paper: e.paper, bytes: e.bytes });
  }
  return out;
}

/** "PDF · A4 · 1 page" — from the manifest, i.e. from the real document. */
export function cvMeta(files: CvFile[]): string {
  if (!files.length) return '';
  const pages = [...new Set(files.map((f) => f.pages))];
  const paper = [...new Set(files.map((f) => f.paper))].join('/');
  const p = pages.length === 1 ? `${pages[0]} page${pages[0] === 1 ? '' : 's'}` : `${Math.min(...pages)}–${Math.max(...pages)} pages`;
  return `PDF · ${paper} · ${p}`;
}
