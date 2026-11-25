/**
 * Formal CVs offered for download: three specializations × two languages.
 *
 * The documents themselves are static files in `public/cv/`, described by `public/cv/manifest.json`
 * (written by the CV pipeline from the real files: page count, paper size, size, checksum).
 * The site only offers what the manifest lists and what exists on disk, so a tree without the
 * PDFs builds cleanly and falls back to "request by email". Nothing here needs a server.
 */
export const CV_FOCUS = ['Software_Engineering', 'Data_Engineering', 'Engineering_Software'] as const;
export type CvFocus = (typeof CV_FOCUS)[number];
export type CvLang = 'en' | 'de';

export const cvFocusLabel: Record<CvFocus, string> = {
  Software_Engineering: 'Software Engineering',
  Data_Engineering: 'Data Engineering & Automation',
  Engineering_Software: 'Engineering Software & Technology',
};

/** Canonical public filename for a specialization and language. */
export function cvFilename(focus: CvFocus, lang: CvLang): string {
  return lang === 'en' ? `Alexander_Yordanov_CV_${focus}_EN.pdf` : `Alexander_Yordanov_Lebenslauf_${focus}_DE.pdf`;
}

export const cvButtonLabel: Record<CvLang, string> = {
  en: 'Download CV · EN',
  de: 'Lebenslauf herunterladen · DE',
};

export interface CvFile {
  focus: CvFocus;
  lang: CvLang;
  file: string;
  href: string;
  pages: number;
  paper: string;
  bytes: number;
}
