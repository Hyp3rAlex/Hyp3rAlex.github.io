/**
 * Measurements of this site, recorded from real runs. Update the date when re-measuring.
 * Lighthouse: v13, mobile emulation with default throttling, production build served locally
 * without compression (scripts/lighthouse.mjs), three runs per page, median reported.
 */
export const siteMetrics = {
  measuredOn: '2026-11-25',
  pages: 14,
  unitTests: 351,
  e2ePassed: 533,
  browsersPassing: [
    'Chromium desktop',
    'Chromium mobile emulation',
    'Firefox',
    'WebKit desktop',
    'WebKit mobile emulation',
  ],
  homeJsGzipKb: 4.4,
  distMb: 2.5,
  lighthouse: [
    { page: '/', performance: 98, accessibility: 100, bestPractices: 100, seo: 100, lcp: '2.0 s', cls: '0', tbt: '0 ms', transferKb: 305 },
    { page: '/projects/', performance: 99, accessibility: 100, bestPractices: 100, seo: 100, lcp: '1.7 s', cls: '0', tbt: '0 ms', transferKb: 264 },
    { page: '/projects/bmw-ride-planner/', performance: 98, accessibility: 100, bestPractices: 100, seo: 100, lcp: '2.0 s', cls: '0', tbt: '0 ms', transferKb: 344 },
    { page: '/projects/demographics-service/', performance: 98, accessibility: 100, bestPractices: 100, seo: 100, lcp: '2.0 s', cls: '0', tbt: '0 ms', transferKb: 341 },
    { page: '/projects/infraflow-mission-control/', performance: 95, accessibility: 100, bestPractices: 100, seo: 100, lcp: '2.4 s', cls: '0', tbt: '0 ms', transferKb: 375 },
    { page: '/projects/longisafe-lab/', performance: 94, accessibility: 100, bestPractices: 100, seo: 100, lcp: '2.5 s', cls: '0', tbt: '0 ms', transferKb: 414 },
    { page: '/projects/portfolio/', performance: 100, accessibility: 100, bestPractices: 100, seo: 100, lcp: '1.5 s', cls: '0', tbt: '0 ms', transferKb: 214 },
    { page: '/projects/tacto-negotiation-arena/', performance: 97, accessibility: 100, bestPractices: 100, seo: 100, lcp: '2.1 s', cls: '0', tbt: '0 ms', transferKb: 331 },
    { page: '/about/', performance: 100, accessibility: 100, bestPractices: 100, seo: 100, lcp: '0.9 s', cls: '0', tbt: '0 ms', transferKb: 153 },
    { page: '/contact/', performance: 100, accessibility: 100, bestPractices: 100, seo: 100, lcp: '1.1 s', cls: '0', tbt: '0 ms', transferKb: 144 },
    { page: '/legal/', performance: 100, accessibility: 100, bestPractices: 100, seo: 100, lcp: '0.9 s', cls: '0', tbt: '0 ms', transferKb: 139 },
    { page: '/recruiter/', performance: 100, accessibility: 100, bestPractices: 100, seo: 100, lcp: '1.1 s', cls: '0', tbt: '0 ms', transferKb: 163 },
    { page: '/resume/', performance: 100, accessibility: 100, bestPractices: 100, seo: 100, lcp: '0.9 s', cls: '0', tbt: '0 ms', transferKb: 164 },
  ],
};
