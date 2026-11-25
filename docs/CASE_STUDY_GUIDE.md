# Case-study authoring guide

How every project page on this site is built. Follow it when adding a project.

## Files per project

| File | Purpose |
|---|---|
| `src/content/projects/<slug>.mdx` | Frontmatter (schema: `src/content.config.ts`) + the case-study body |
| `src/components/projects/visuals/<Name>Visual.astro` | The bespoke visual used on cards and as the case-study hero. Must fill its container (`height:100%`), work from ~280 px to ~1300 px wide, and be built from real project data or structure |
| `src/components/diagrams/<Name>Architecture.astro` | Inline SVG architecture diagram derived from the audited source, in two drawings: a wide one in `<div class="dg-desktop has-mobile">` and a vertical one (about 360 units wide) in `<div class="dg-mobile">`; shared CSS shows exactly one |
| `src/lib/<name>.ts` + `tests/unit/<name>.test.ts` | Pure, typed, deterministic demo logic and its unit tests (Vitest) |
| `src/components/interactive/<Name>Demo.astro` | Demo markup + a vanilla TypeScript custom element (no UI framework) |
| `src/data/demo/<name>.json` | Small sanitized dataset with provenance fields |

## Body structure (H2 headings, in this order; drop one only if there is genuinely nothing to say)

0. `<Brief … />` — the executive overview, first element of the body: problem, solution, role, individual contribution, 3–4 verified outcomes, up to six technologies, links to the demo and the repository. A recruiter reads only this (20–30 seconds); everything in it must be backed by the sections below.

1. `## Summary` — problem, constraints, what was built, why it matters. 3–5 short paragraphs maximum. A recruiter should get it in 20 seconds.
2. `## Architecture` — the diagram in a `<Figure>` plus a walk-through of the data flow.
3. `## Engineering decisions` — 2–4 `###` subsections. Each: the decision, the alternative, the trade-off, a short real code excerpt with its file path, and the honest weak spot.
4. `## Demo` — the interactive demo (heading id must be `demo`), preceded by `<TryIt steps={[…]} />`: two to four guided steps that use the real control names and lead to a visible, interesting result. State plainly what the demo is: a browser replay / re-implementation, on which data.
5. `## Validation` — what was tested, how, at which revision and on which date. Separate *re-run for this page* from *reported by the repository*. Never write “all tests pass” without scope.
6. `## My contribution` — exactly what Alexander did. For team work use three short parts: **Leadership** (owner-confirmed roles are stated as such), **My technical contributions** (verified individual work) and **Team achievements** (collective results, teammates credited for the parts they implemented).
7. `## Limitations` — real ones, from the audit.
8. `## What I would do next` — explicitly future work, never phrased as done.

## Voice and honesty rules

- First person singular for solo work (“I”), “we”/“the team” for team work, “I contributed …” for his part of it.
- Plain, specific, technical. No hype words (“robust”, “seamless”, “cutting-edge”, “leveraged”), no invented metrics.
- Every number must come from the audit's claim register. If the audit says a claim must not be made, do not make it — not even softened.
- Team projects: never imply sole authorship. Leadership is stated when the owner has confirmed it — he was Team Lead of the Tacto and BMW Motorrad hackathon teams — and is never inferred from, or reduced to, commit or line counts. Do not invent specific leadership duties. A teammate's implementation or result is never presented as his own; team results are presented as team results. No employment implied with BMW, Tacto, Esri or anyone else.
- Synthetic data, static replays and browser re-implementations are labelled as such, in the UI itself (the demo bar carries a badge).
- Tone: concise, positive, confident and accurate. Lead with what was built, solved, decided and verified. Limitations, team attribution and AI assistance are stated once, where they belong (Limitations, My contribution, the demo badge) — not repeated as disclaimers through the page. No line-of-code or commit statistics as achievements.
- British/international English, sentence-case headings. Dates like `25 Nov 2026`.

## MDX components

Available without import: `<Figure n="1" caption="…" source="…" wide scroll>…</Figure>` and `<Callout kind="limit|note|team" title="…">…</Callout>`. Import diagrams and demos at the top of the MDX file.
Code excerpts: fenced blocks with a language; put the source path on the line above as `<p class="src">path/to/file.py:12-30 @ abc1234</p>`.
Wide elements: add `class="wide"` (54rem) or `class="full"` (full column) on a wrapper `<div>`.
Secondary reference material (long rule lists, definitions) may go in native `<details><summary>` blocks; never essential information.
Scrollable tables need `<div class="table-scroll" tabindex="0" role="group" aria-label="…">` (a unit test enforces it).

## Visual language (see `DESIGN.md`)

- Monochrome. Use only CSS custom properties from `src/styles/tokens.css` — never hard-coded colours. `--ok / --warn / --fail / --info` are reserved for real states and data series, and state must never be encoded by colour alone (add text, shape or pattern).
- Both themes must work: test with `data-theme="light"` and dark.
- SVG: use the shared classes defined in `src/pages/projects/[slug].astro` (`.ch-axis .ch-grid .ch-text .ch-line`, `.dg-box .dg-title .dg-sub .dg-flow .dg-head`). Text in SVG ≥ 10.5 px at rendered size; diagrams wider than a phone go in `<Figure scroll>`.
- Mono uppercase labels (`.mono`, `.label`) for metadata; Space Grotesk for headings; no icons libraries, no emoji.
- Radius ≤ 8 px, 1 px hairlines, no gradients, no glows, no drop shadows on diagrams.

## Demo rules

- Markup uses the shared shell: `.demo > .demo-bar (+ .badge) / .demo-controls / .demo-stage / .demo-readout / details (data table) / .demo-foot`.
- Works by keyboard and touch; controls are native (`button`, `input[type=range]`, `select`, radio groups) with visible labels, ≥ 44 px targets, a Reset button.
- Without JavaScript the demo must still show a meaningful static state (server-render the default scenario in Astro) — never an empty box.
- Deterministic, offline, no network requests, no fake loading states.
- A live region (`role="status"`) announces the result of a change; a `<details>` holds a plain data table of what the chart shows.
- Logic lives in `src/lib` and is unit-tested against values from the original project (fixtures exported by the audit).
- Respect `prefers-reduced-motion`; animation is never required to read the result.
- Footer states provenance: data source, that it is a re-implementation, and the audited revision.
