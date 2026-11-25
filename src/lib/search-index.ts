import { getCollection } from 'astro:content';
import { person } from '../data/profile';
import { CATEGORIES, KINDS } from '../content.config';
import type { SearchItem } from './search';
import { cvFocusLabel } from '../data/cv';
import { loadCvs } from './cv';

/** Build-time local index for the command palette. No external search service. */
export async function buildSearchIndex(): Promise<SearchItem[]> {
  const projects = (await getCollection('projects', (p) => !p.data.draft)).sort(
    (a, b) => a.data.order - b.data.order,
  );

  const pages: SearchItem[] = [
    { id: 'home', title: 'Home', group: 'Pages', href: '/', keywords: 'start index landing' },
    { id: 'work', title: 'Work', hint: 'All projects', group: 'Pages', href: '/projects/', keywords: 'projects case studies portfolio' },
    { id: 'about', title: 'About', hint: 'Education, experience, focus', group: 'Pages', href: '/about/', keywords: 'tum education internship dietl languages bio' },
    { id: 'recruiter', title: 'Recruiter brief', hint: 'Candidate summary and CV', group: 'Pages', href: '/recruiter/', keywords: 'hiring summary overview working student internship' },
    { id: 'resume', title: 'CV and résumé', hint: 'Download CV · online résumé', group: 'Pages', href: '/resume/', keywords: 'cv resume lebenslauf download pdf' },
    { id: 'contact', title: 'Contact', group: 'Pages', href: '/contact/', keywords: 'email linkedin github reach' },
    { id: 'legal', title: 'Legal notice and privacy', hint: 'Impressum · Datenschutz', group: 'Pages', href: '/legal/', keywords: 'privacy data cookies imprint impressum datenschutz legal' },
  ];

  const projectItems: SearchItem[] = projects.map((p) => ({
    id: `p-${p.id}`,
    title: p.data.title,
    hint: `${CATEGORIES[p.data.category]} · ${KINDS[p.data.kind]}`,
    group: 'Projects',
    href: `/projects/${p.id}/`,
    keywords: [...p.data.stack, p.data.tagline, p.data.context ?? ''].join(' '),
  }));

  const actions: SearchItem[] = [
    { id: 'a-copy', title: 'Copy email address', hint: person.email, group: 'Actions', action: 'copy-email', keywords: 'mail contact clipboard' },
    { id: 'a-mail', title: 'Write an email', hint: person.email, group: 'Actions', href: `mailto:${person.email}`, keywords: 'mail contact message' },
    { id: 'a-li', title: 'Open LinkedIn', group: 'Actions', href: person.linkedin, external: true, keywords: 'profile social' },
    { id: 'a-gh', title: 'Open GitHub', hint: person.githubHandle, group: 'Actions', href: person.github, external: true, keywords: 'code repositories source' },
    { id: 'a-theme', title: 'Switch theme', hint: 'Dark → Light → System', group: 'Actions', action: 'theme', keywords: 'dark light mode appearance' },
  ];

  const cvItems: SearchItem[] = loadCvs().map((f) => ({
    id: `cv-${f.focus}-${f.lang}`,
    title: `${f.lang === 'en' ? 'Download CV' : 'Lebenslauf herunterladen'} — ${cvFocusLabel[f.focus]}`,
    hint: `PDF · ${f.lang === 'en' ? 'English' : 'Deutsch'}`,
    group: 'Actions',
    href: f.href,
    external: true,
    keywords: 'cv resume lebenslauf download pdf bewerbung',
  }));

  return [...pages, ...projectItems, ...cvItems, ...actions];
}
