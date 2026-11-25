# QA record

Version 2 release candidate, 25 Nov 2026. Everything below was actually run on this date; nothing is extrapolated. The previous record (version 1) is in the repository history.

## Commands and results

| Check | Command | Result |
|---|---|---|
| Lint | `npm run lint` | 0 problems |
| Types and content schemas | `npm run check` | 0 errors, 0 warnings, 0 hints |
| Unit tests | `npm test` | 351 passed in 9 files |
| Production build | `npm run build` | 14 static pages, `dist/` 2.5 MB |
| Links | `npm run check:links` | all internal links and fragments resolve; 17 external links ok, 1 could not be verified (LinkedIn blocks automated requests), 1 pending (this repository's own URL before publication), 0 broken |
| End-to-end, Chromium desktop + Chromium mobile emulation (Pixel 7) + Firefox | `npm run test:e2e -- --project=chromium --project=mobile-chromium --project=firefox` | 323 passed, 7 skipped by design |
| End-to-end, WebKit desktop + mobile emulation (iPhone 14 profile) | `--project=webkit --project=mobile-webkit` | 210 passed, 10 skipped by design |
| Dependencies | `npm audit` | 0 vulnerabilities |

Total: 533 end-to-end checks passing in five browser configurations. Skips are by design (mobile-menu test on desktop projects, clipboard-permission test outside Chromium, hero-drawing test on phones where the drawing is not in the hero, the download-event test in WebKit, and the email-fallback test when CV files are present).

WebKit runs here through Playwright's WebKit build with its system libraries unpacked at user level; it is not Safari. CI installs the browsers properly and runs all five configurations on pull requests.

Unit tests by area: LongiSafe monitors and chart helpers (137), Demographics (50), InfraFlow (37), Ride Planner (33), Tacto incl. fixtures produced by the original guard code (47), content rules (23), metadata (19), search (5).

## What the end-to-end suite covers

- Every route: status 200, one `h1`, canonical URL, no console errors, no failed requests, no horizontal overflow.
- Overflow matrix: all routes at 320, 375, 390, 430, 768, 1024, 1280, 1440, 1920 and 2560 px. Tablet portrait and landscape, phone landscape and a 200 %-zoom proxy for the main routes.
- Phone: the first project card must start within 1,200 px of the top (measured: 1,082 px, about 1.3 screens at 390 × 844; version 1: 1,866 px). Touch targets: none below 24 × 24 CSS px; primary navigation, buttons and controls are 44 px.
- axe (WCAG 2.0/2.1/2.2 A and AA rule tags) on every route in dark and light themes: no serious or critical violations.
- Recruiter brief: the facts, team-lead roles, per-specialization summary, skills, project order, direct case-study and demo links.
- CV downloads: all six PDFs are served as `application/pdf`, start with a PDF header and match the manifest's size; each specialization offers its own English and German file as the primary action with the document metadata and a quiet email link; the downloaded file name matches the selected specialization and language; the CV page lists all six as plain links that work without JavaScript; editable sources and private copies are not reachable; a tree without the documents falls back to an email request (verified on a release export).
- Team Lead is shown on the home page, the catalogue, both case studies (header and overview) and the résumé.
- Every case study: overview block with working demo and source links, a readable primary button, guided demo steps, the vertical diagram on phones and the wide one on desktop.
- Each of the five demos has its own interaction suite that performs the guided steps and asserts the values the unit tests predict, by keyboard and at phone size, including reset and the state without JavaScript.
- Hero drawing: inspecting the apex reports node A2 at X 15.0, Y 26.0.
- Contact: address visible and inside the viewport at 320 px, copy success and blocked-clipboard failure, mail and recruiter links.
- Project filter, command palette (shortcut, search, empty state, arrows, Enter, Escape, focus restoration), theme choice and persistence, mobile menu (covers the viewport, links hit-testable, Escape), skip link, back/forward, internal links, 404.
- JavaScript disabled: content visible, nothing hidden by reveal animations, JS-only controls hidden or disabled, demos show a server-rendered state.

## Independent reviews and what they changed

| Review | Result | Outcome |
|---|---|---|
| Specification compliance and recovery audit | 170 requirements of the original specification classified; per-project findings on the five case studies | Missing items implemented: link check, conditional metadata requests, demo interaction tests, public evidence register, legal page, responsive and print coverage. Per-project corrections: record counts, demo texts matched to computed values, a metric control, untested helpers covered, the Tacto guard port verified against outputs of the original code |
| Creative direction, version 1 against version 2 and the references | Scores in `DESIGN.md` | Hero fits one screen; trace plotted on intersection; ledger instead of repeated cards; two-column section heads; redundant labels removed |
| Claims and recruiter review of version 2 | No blockers; every number matched the evidence; every guided demo step performed in a browser | Two over-confident leadership phrasings corrected; AI-assistance sentences restored where the repositories evidence it; skills trimmed to evidenced ones; overview first on phones |
| Manual accessibility review against WCAG 2.2 AA | 13 failures, 13 risks | All failures fixed and covered by tests where practical (see below) |
| Security and publication audit | No secrets, no personal data beyond the approved contact set, no third-party requests, 0 vulnerable dependencies | See `docs/SECURITY_AUDIT.md` |
| Recruitment review of the CV drafts | Must-fix and should-fix list | Applied in the CV pipeline (documents are not part of the site until approved) |

## Accessibility findings fixed in version 2

Focus could leave the open mobile menu into covered content (page behind is now inert). Sticky table header hid focused rows (scroll padding; verified over 200 focus stops). Two card animations ran longer than five seconds without a pause control (single pass, loop only on hover). Placeholder text, control borders and selected-state rings were below the required contrast (new control token at ≥ 3:1). Labels clipped at 320 px and under increased text spacing (wrapping layouts). Printed code and state colours were unreadable and tables were cut off (print tokens and overflow rules). Demo controls were enabled but inert without JavaScript (rendered disabled, enabled on upgrade). The hero drawing's inspection was pointer-only (the construction data is also available as a table). Status messages were lost when the command palette closed (live region moved outside the dialog). Chart series distinguished by colour only now differ by dash pattern.

Automated and manual checks are a floor, not a conformance statement. Not tested: real screen readers, physical devices, voice control, Safari itself.

## Lighthouse (lab)

Lighthouse 13.6, mobile emulation with default throttling, production build served locally **without compression**, three runs per page, median and the three runs shown.

| Page | Performance (median; runs) | Accessibility | Best practices | SEO | LCP | CLS | TBT | Transfer |
|---|---|---|---|---|---|---|---|---|
| `/` | 98 (98 · 98 · 98) | 100 | 100 | 100 | 2.0 s | 0 | 0 ms | 305 KB |
| `/projects/` | 99 (99 · 99 · 99) | 100 | 100 | 100 | 1.7 s | 0 | 0 ms | 264 KB |
| `/projects/bmw-ride-planner/` | 98 (98 · 98 · 98) | 100 | 100 | 100 | 2.0 s | 0 | 0 ms | 344 KB |
| `/projects/demographics-service/` | 98 (97 · 98 · 98) | 100 | 100 | 100 | 2.0 s | 0 | 0 ms | 341 KB |
| `/projects/infraflow-mission-control/` | 95 (95 · 96 · 95) | 100 | 100 | 100 | 2.4 s | 0 | 0 ms | 375 KB |
| `/projects/longisafe-lab/` | 94 (94 · 98 · 94) | 100 | 100 | 100 | 2.5 s | 0 | 0 ms | 414 KB |
| `/projects/portfolio/` | 100 (100 · 100 · 100) | 100 | 100 | 100 | 1.5 s | 0 | 0 ms | 214 KB |
| `/projects/tacto-negotiation-arena/` | 97 (97 · 97 · 97) | 100 | 100 | 100 | 2.1 s | 0 | 0 ms | 331 KB |
| `/about/` | 100 (100 · 100 · 100) | 100 | 100 | 100 | 0.9 s | 0 | 0 ms | 153 KB |
| `/contact/` | 100 (100 · 100 · 100) | 100 | 100 | 100 | 1.1 s | 0 | 0 ms | 144 KB |
| `/legal/` | 100 (100 · 100 · 100) | 100 | 100 | 100 | 0.9 s | 0 | 0 ms | 139 KB |
| `/recruiter/` | 100 (100 · 100 · 100) | 100 | 100 | 100 | 1.1 s | 0 | 0 ms | 163 KB |
| `/resume/` | 100 (100 · 100 · 100) | 100 | 100 | 100 | 0.9 s | 0 | 0 ms | 164 KB |

Compared with version 1 (three pages were measured then): home 98 → 98 with 232 → 305 KB transferred (the richer project visuals are inline SVG); recruiter brief 100 → 100, 170 → 163 KB; LongiSafe case study 95 → 94, 373 → 414 KB. Accessibility, best practices and SEO remain 100. These are lab results from one machine, not field data; interaction responsiveness is covered by the end-to-end tests rather than a lab metric.

The home page ships about 4.4 KB of compressed first-party JavaScript (theme, command palette, card highlight, drawing inspection). The largest script on any page is the LongiSafe demo with its bundled dataset, loaded only there. No animation or UI library is used.

## Visual review

Version 1 screenshots are in `docs/design/shots/`, version 2 in `docs/design/shots-v2/` (same pages and widths for comparison, plus tablet layouts, sections, demo and overview states, the inspecting hero, mobile menu, command palette and mobile diagrams).

## Known limitations at release

- Safari and physical devices are untested; WebKit coverage is Playwright's build.
- No screen-reader session.
- The CV PDFs in this working tree are drafts for local testing; a release includes them only after approval (`RELEASE_WITH_CVS=approved` with an approved manifest), otherwise the site offers a request by email.
- Source references in case studies are plain text, not permalinks.
- Case studies remain long; the overview block and the contents list carry the short read.
- The legal page gives contact and privacy information without a postal address; whether a full legal notice with address is required is the owner's decision.
