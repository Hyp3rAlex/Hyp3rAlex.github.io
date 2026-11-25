# hyp3ralex.github.io

Personal engineering portfolio of Alexander Yordanov — Information Systems and Mechanical Engineering student at TUM.

A static, multi-page Astro site: project case studies with source-audited claims, small browser demos that re-implement each project's core logic, a recruiter brief, and nothing that needs a server.

- **Stack:** Astro 7 (static output), TypeScript (strict), MDX content collections, hand-written CSS, vanilla TypeScript custom elements. No UI framework, no runtime backend.
- **Hosting:** GitHub Pages via GitHub Actions. No analytics, cookies, trackers, CDNs or remote fonts.
- **Docs:** [`DESIGN.md`](DESIGN.md) · [`docs/CASE_STUDY_GUIDE.md`](docs/CASE_STUDY_GUIDE.md) · [`docs/QA.md`](docs/QA.md) · [`docs/PROJECT_AUDIT.md`](docs/PROJECT_AUDIT.md) · [`docs/SECURITY_AUDIT.md`](docs/SECURITY_AUDIT.md) · [`docs/design/CONCEPTS.md`](docs/design/CONCEPTS.md) · [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md)

## Run locally

Requires Node ≥ 22.23 (CI uses the version in `.nvmrc`).

```sh
npm ci
npm run dev        # dev server
npm run build      # static build to dist/
npm run preview    # serve dist/
```

| Script | What it does |
|---|---|
| `npm run check` | `astro check` — type-checks `.astro`, `.ts` and content schemas |
| `npm run lint` | ESLint |
| `npm test` | Vitest unit tests: demo logic, search ranking, metadata parsing, content rules |
| `npm run test:e2e` | Playwright against the production preview (run `npm run build` first). Add `-- --project=chromium` for one browser |
| `npm run metadata` | Refresh `src/data/github-metadata.json` from the GitHub API (conditional requests; keeps the snapshot on failure) |
| `npm run check:links` | Check every internal link and fragment in `dist/` and probe external links |
| `npm run lighthouse` | Lighthouse for every route of `dist/`, three runs each, medians to a report |

## Structure

```text
src/
  content/projects/     case studies (MDX) — schema in src/content.config.ts
  data/                 profile.ts (person, education, experience), capabilities.ts, cv.ts,
                        repos.json (metadata allowlist), github-metadata.json (snapshot), demo/ (demo datasets)
  lib/                  pure, unit-tested logic for demos, search and build info
  components/
    layout/ identity/   header, footer, AY mark, inspectable hero drawing, signal trace
    projects/ case/     cards, per-project visuals, overview brief, guided steps, figure, callout
    diagrams/           architecture diagrams as inline SVG
    interactive/        demos and command palette (custom elements)
    recruiter/          CV actions
  layouts/ pages/ scripts/ styles/
scripts/                metadata refresh, link check, Lighthouse runner, release preparation, OG image, screenshots
tests/unit  tests/e2e
.github/workflows/      ci.yml (PRs and branches), deploy.yml (main → Pages, weekly rebuild)
```

## Common edits

**Profile or contact details** — `src/data/profile.ts`. Everything on the site reads from it. Wording rules are in the comment at the top of that file.

**CVs** — the recruiter brief and the CV page offer direct PDF downloads for three specializations in English and German. The documents are static files in `public/cv/`, described by `public/cv/manifest.json` (file name, specialization, language, page count, paper size, size, checksum — written from the real files). The mapping lives in `src/data/cv.ts`; `src/lib/cv.ts` offers only files that are listed in the manifest, exist on disk and carry the canonical name (`Alexander_Yordanov_CV_<Specialization>_EN.pdf`, `Alexander_Yordanov_Lebenslauf_<Specialization>_DE.pdf`). A tree without the PDFs builds cleanly and offers a request by email instead. Only PDFs belong in that folder — never editable sources or private copies; a unit test and an end-to-end test enforce this, and the release script publishes the folder only for an approved manifest.

**Recruiter specializations** — `focusAreas` in `src/data/profile.ts`: summary, skills in focus, project order and the CV key. Facts (degrees, leadership, experience, languages) come from the same file and are identical for every specialization.

**Update a case study or demo** — text in `src/content/projects/<slug>.mdx`; demo logic in `src/lib/<name>.ts` with its unit test; the demo element in `src/components/interactive/`; its end-to-end test in `tests/e2e/demo-<name>.spec.ts`. Numbers quoted in the text must match what the tests assert.

**Update the site's own metrics** — after re-measuring, edit `src/data/site-metrics.ts` (the portfolio case study and its card read from it).

**Add a project**

1. Create `src/content/projects/<slug>.mdx` following [`docs/CASE_STUDY_GUIDE.md`](docs/CASE_STUDY_GUIDE.md): overview block, sections, guided demo steps. The schema validates the frontmatter at build time.
2. Add a visual in `src/components/projects/visuals/` and register its key in `src/content.config.ts` (`visual` enum) and `src/components/projects/ProjectVisual.astro`.
3. If it has a repository, add it to `src/data/repos.json` and run `npm run metadata`.
4. Optional: add it to a recruiter focus area or a capability in `src/data/`.

The project then appears on the home page, the index, the command palette, the résumé and the sitemap.

**Repository metadata** — `npm run metadata` fetches a few fields (URL, language, default branch, last push, licence) for the repositories on the allowlist. It is anonymous locally and uses the workflow token in CI. If the API is unreachable or returns something malformed, the committed snapshot is kept and the build continues. Repositories that are public but not on the allowlist are only reported for review, never published automatically.

**Social image** — `node scripts/make-og.mjs` regenerates `public/og.png` and the touch icon.

## Deployment

`deploy.yml` runs on every push to `main`, on manual dispatch, and weekly. It refreshes metadata, lints, type-checks, runs unit and Chromium end-to-end tests, builds, checks links, and deploys the `dist/` artifact with the official Pages actions. A failing step stops the deployment. `ci.yml` runs the full suite in Chromium, Firefox and WebKit on pull requests and branches and never deploys. In the repository settings, **Pages → Source** must be set to **GitHub Actions**.

The public repository starts from a single clean commit of the approved tree, produced by `scripts/prepare-release.sh`, which exports the tree, removes working files, checks the result for private content and stops before publishing. What was audited before release: [`docs/SECURITY_AUDIT.md`](docs/SECURITY_AUDIT.md).

**Roll back** — revert the offending commit and push; the workflow redeploys the previous state. History is never rewritten:

```sh
git revert <commit>
git push
```

## Content policy

Case studies state what was verified, at which revision and on which date; team work is attributed to the team; synthetic data and browser re-implementations are labelled where they appear. `tests/unit/content.test.ts` enforces part of this (required sections, banned phrasing, team attribution and role lines, keyboard-reachable tables, link integrity). The public evidence register is [`docs/PROJECT_AUDIT.md`](docs/PROJECT_AUDIT.md).

## Licence

Code: MIT (see [`LICENSE`](LICENSE)). Text, the AY monogram and project write-ups: © Alexander Yordanov, all rights reserved. Fonts and third-party data: see [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).
