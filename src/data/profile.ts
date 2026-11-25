/**
 * Single source of truth for personal facts shown on the site.
 * Every entry here is owner-confirmed. Wording rules:
 *  - degrees are in progress (never "completed"); no GPA, no graduation date
 *  - language levels only, no certificate names
 *  - industrial experience is "exposure to", not independent operation
 *  - no phone number, address, date of birth, availability date or weekly hours
 */

export const site = {
  url: 'https://hyp3ralex.github.io',
  title: 'Alexander Yordanov',
  tagline: 'Building software for complex systems.',
  description:
    'Alexander Yordanov — Information Systems and Mechanical Engineering student at TUM, working across backend engineering, data and automation, and software for physical systems.',
  locale: 'en',
} as const;

export const person = {
  name: 'Alexander Yordanov',
  givenName: 'Alexander',
  familyName: 'Yordanov',
  location: 'Munich, Germany',
  coordinates: '48.14°N 11.58°E',
  email: 'alexander.yordanov.bg@gmail.com',
  github: 'https://github.com/Hyp3rAlex',
  githubHandle: 'Hyp3rAlex',
  linkedin: 'https://www.linkedin.com/in/alexander-yordanov-04b242245',
  positioning:
    'Information Systems and Mechanical Engineering student at TUM, working across backend engineering, data and automation, and software for physical systems.',
  seeking: 'Interested in working-student positions and internships in Munich / Garching — on-site, hybrid or remote.',
  seekingShort: 'Open to working-student roles and internships',
} as const;

export interface Education {
  institution: string;
  short: string;
  degree: string;
  degreeDe: string;
  since: string;
  sinceISO: string;
  note: string;
  coursework: string[];
}

export const education: Education[] = [
  {
    institution: 'Technical University of Munich',
    short: 'TUM',
    degree: 'B.Sc. Information Systems',
    degreeDe: 'Wirtschaftsinformatik',
    since: 'Oct 2025',
    sinceISO: '2025-10',
    note: 'In progress',
    coursework: [
      'Software engineering',
      'Databases',
      'Programming',
      'Computer architecture',
      'Algorithms',
      'Discrete mathematics',
    ],
  },
  {
    institution: 'Technical University of Munich',
    short: 'TUM',
    degree: 'B.Sc. Mechanical Engineering',
    degreeDe: 'Maschinenwesen',
    since: 'Oct 2026',
    sinceISO: '2026-10',
    note: 'In progress · studied in parallel',
    coursework: ['Technical mechanics', 'Engineering materials', 'CAD (SolidWorks)', 'Higher mathematics'],
  },
];

export const educationSummary =
  'Two concurrent undergraduate degree programmes at the Technical University of Munich.';

export interface Experience {
  org: string;
  place: string;
  role: string;
  period: string;
  duration: string;
  summary: string;
  points: string[];
}

export const experience: Experience[] = [
  {
    org: 'DIETL Feinmechanik GmbH',
    place: 'Munich',
    role: 'Mechanical engineering intern — quality assurance & precision manufacturing',
    period: 'Jun–Jul and Sep–Oct 2026',
    duration: 'Six weeks, two periods',
    summary:
      'Industrial internship in a precision-mechanics manufacturer: four weeks in quality assurance, two weeks in laser welding.',
    points: [
      'Quality assurance: component inspection and dimensional checks against drawings.',
      'Exposure to precision metrology — calipers, micrometers, gauges and CMM workflows (Mitutoyo MCOSMOS GEOPAK, FORMTRACEPAK).',
      'Laser welding department: exposure to the welding process and its quality requirements.',
      'Shop-floor exposure to CNC turning, milling, grinding, gear production and laser cutting.',
    ],
  },
];

export const languages = [
  { name: 'English', level: 'C2' },
  { name: 'German', level: 'C1' },
  { name: 'Bulgarian', level: 'Native' },
] as const;

export const interests = [
  'Backend & software engineering',
  'Data engineering',
  'Automation',
  'Engineering software',
  'Automotive & motorsport',
  'Aerospace',
  'Reliable technical systems',
] as const;

export const nav = [
  { href: '/projects/', label: 'Work' },
  { href: '/about/', label: 'About' },
  { href: '/recruiter/', label: 'Recruiter' },
  { href: '/contact/', label: 'Contact' },
] as const;

/** Owner-confirmed leadership roles. Leadership is stated as such; it is not derived from commit statistics. */
export const leadership = [
  {
    title: 'Team Lead',
    project: 'Tacto Negotiation Arena',
    projectId: 'tacto-negotiation-arena',
    context: 'Hackathon team of three · Munich, Oct 2026',
    line: 'Led the hackathon team and contributed to the negotiation constraint-validation and enforcement logic.',
  },
  {
    title: 'Team Lead',
    project: 'BMW Motorrad Ride Planner',
    projectId: 'bmw-ride-planner',
    context: 'Hackathon team of three · Zurich, Sep 2026',
    line: 'Led the hackathon team and developed caching, spatial indexing and automated tests.',
  },
] as const;

/**
 * Recruiter specializations. A specialization changes summary, ordering and emphasis only —
 * every statement in any of them is true in all of them.
 */
export const focusAreas = [
  {
    id: 'software',
    label: 'Software Engineering',
    cvKey: 'Software_Engineering' as const,
    summary:
      'Backend-minded student engineer: layered Java / Spring Boot and Python services, REST APIs, PostgreSQL, automated tests and containerised environments. Team lead of two hackathon teams.',
    skills: ['Java 17', 'Spring Boot', 'Python', 'REST APIs', 'PostgreSQL', 'JPA', 'Docker Compose', 'JUnit 5 · Mockito', 'pytest', 'Git'],
    projects: ['demographics-service', 'tacto-negotiation-arena', 'bmw-ride-planner', 'longisafe-lab'],
    showExperience: false,
  },
  {
    id: 'data',
    label: 'Data Engineering & Automation',
    cvKey: 'Data_Engineering' as const,
    summary:
      'Builds pipelines that ingest, validate, aggregate and report: Python and SQL, data-quality rules with an exception register, generated Excel and slide reporting, and paged ingestion from external APIs.',
    skills: ['Python', 'SQL', 'Data validation', 'Aggregation', 'Reporting automation', 'Excel and slide reporting', 'Jira · JQL', 'Confluence', 'PostgreSQL', 'pytest'],
    projects: ['infraflow-mission-control', 'demographics-service', 'longisafe-lab', 'tacto-negotiation-arena'],
    showExperience: false,
  },
  {
    id: 'engineering',
    label: 'Engineering Software & Technology',
    cvKey: 'Engineering_Software' as const,
    summary:
      'Studies mechanical engineering alongside information systems and writes software for physical systems: vehicle longitudinal dynamics, signal plausibility monitoring, engineering tooling in Python and Excel/VBA, with shop-floor quality-assurance experience.',
    skills: ['Python', 'Excel / VBA', 'Vehicle longitudinal dynamics', 'Signal validation', 'Unit testing', 'Dimensional inspection', 'Precision measurement', 'Technical drawings', 'CAD basics (SolidWorks)'],
    projects: ['longisafe-lab', 'bmw-ride-planner', 'infraflow-mission-control', 'demographics-service'],
    showExperience: true,
  },
] as const;

export type FocusId = (typeof focusAreas)[number]['id'];
