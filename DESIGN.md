# DESIGN — AY / Stealth Engineering × Cyber OS × Motorsport Precision

The design system for this site. Tokens live in `src/styles/tokens.css`; base styles and primitives in `src/styles/global.css`. Research behind it: a review of eight reference sites (working notes, not published). Concept comparison: `docs/design/CONCEPTS.md`.

## Idea

An engineer's portfolio that looks like engineering documentation made by someone with taste: near-black, monochrome, one oversized name, hairlines, mono labels that carry real metadata. The work and the name are the hero; effects are not.

The single signature element is the **drawing sheet** in the hero: the AY monogram presented as a construction drawing whose dimensions are the mark's real geometry and whose title block shows real build metadata (date, git revision). It is plotted once on load, like a pen plotter.

## Principles

1. **Every label is true.** Technical metadata (indices, dimensions, revisions, dates, units, provenance) must describe something real. No fake instrumentation.
2. **Evidence over adjectives.** Cards and case studies show actual output: a signal plot, an API response, a KPI strip, a route, a negotiation trace — rendered from project data at build time.
3. **Monochrome; colour means state.** Silver/off-white is the only accent. Green/amber/red/blue appear only for real states and data series, and never as the only carrier of meaning.
4. **Hairlines, not boxes.** 1 px borders, radius ≤ 8 px, three surface levels, no gradients, glows or glass.
5. **Works without JavaScript.** JS enhances (theme, palette, filters, demos); content and navigation never depend on it.
6. **Motorsport as method, not costume.** Signal traces, tolerances, drafting marks and telemetry-style readouts appear where the content is about them (LongiSafe, Ride Planner). No liveries, flags or gauges for decoration.

## Tokens

### Colour

| Token | Dark (default) | Light | Use |
|---|---|---|---|
| `--bg` | `#08090b` | `#f3f1ec` | Page canvas |
| `--surface` | `#111216` | `#faf9f5` | Panels, cards |
| `--raised` | `#181a1f` | `#ffffff` | Floating / selected |
| `--border` | `#2a2c31` | `#d6d3cb` | Hairlines |
| `--border-strong` | `#43464d` | `#a9a59b` | Emphasised rules, control borders |
| `--text` | `#f4f4f5` | `#121316` | Primary text |
| `--text-2` | `#b5b8be` | `#3f4248` | Secondary text |
| `--text-3` | `#93979f` | `#5d6068` | Labels, metadata |
| `--accent` / `--accent-ink` | `#e6e7ea` / `#08090b` | `#121316` / `#f7f6f2` | Primary button |
| `--ok` `--warn` `--fail` `--info` | `#6fcf97` `#e2b33c` `#f2777a` `#7cb7ff` | `#1c7443` `#835b00` `#b3232b` `#1b5bb8` | States and data only |
| `--focus` | `#9cc7ff` | `#1b5bb8` | Focus ring |

Light mode is designed, not inverted: warm off-white paper, graphite rules, darker semantic colours chosen for contrast on paper. Contrast is checked by axe in both themes (`tests/e2e/site.spec.ts`).

**Theme behaviour.** First visit is dark (the brand default) regardless of OS setting — a deliberate decision. The footer offers Dark / Light / System and the header button cycles them; the explicit choice is stored in `localStorage` (`ay-theme`). A tiny inline script sets the theme before first paint to avoid a flash. Without JavaScript the site stays dark.

### Type

| Role | Family | Notes |
|---|---|---|
| Display | Space Grotesk Variable | Headings, name, numbers. Weight 560–600, tracking −0.025 to −0.055em |
| Body | Inter Variable | 16–17 px, line-height 1.6–1.7 |
| Mono | IBM Plex Mono 400/500 | Uppercase labels at 11–12 px, +0.06em tracking; code |

Scale (`--text-*`): 11 · 12 · 14 · 16 · 18 px fixed, then fluid `lg` → `3xl` with `clamp()`, and the hero name at `clamp(3rem, 17.4vw, 9.5rem)` on small screens / `clamp(5rem, 0.5rem + 9.6vw, 10.5rem)` from 64em. Long text is limited to `--measure: 68ch`.

Fonts are self-hosted (Fontsource packages, SIL OFL 1.1), `font-display: swap`, latin subsets preloaded for the display and body faces.

### Space and layout

- 4/8-based scale `--s-1…--s-10` (4 → 128 px). Section rhythm `--section: clamp(4rem, 2.5rem + 5vw, 7rem)`.
- Content width `--max: 1320px` with fluid gutters `--gutter: clamp(20px, …, 56px)`; ultrawide screens keep the measure, they do not stretch.
- Breakpoints follow content (em-based): 30 / 40 / 48 / 52 / 60–64 / 68 / 76em.
- Shape: radius 2 / 4 / 8 px; 1 px hairlines; `.corner-marks` adds drafting corners to figures.

### Motion

| Token | Value | Use |
|---|---|---|
| `--t-feedback` | 140 ms | Hover, press, focus |
| `--t-component` | 280 ms | Menus, palette, arrows |
| `--t-reveal` | 560 ms | Section reveals, hero entrance |
| `--ease-out` | `cubic-bezier(0.22, 1, 0.36, 1)` | Default |
| `--ease-in-out` | `cubic-bezier(0.65, 0, 0.35, 1)` | Plotter draw-in |
| `--stagger` | 60 ms | Sibling reveals |

Rules: transform and opacity only; no scroll hijacking, parallax, preloaders, custom cursors or perpetual animation. Section reveals use `IntersectionObserver` and only hide content after JS has confirmed it can show it again (`.js [data-reveal]`). Page transitions are native cross-document view transitions (`@view-transition { navigation: auto }`): no client router, graceful fallback in browsers without support. `prefers-reduced-motion: reduce` sets all durations to 0 and removes the hero and plotter animations.

## Components

- **Header** — 60 px sticky bar: AY mark, four links, search (⌘/Ctrl K), theme, Résumé. Below 52em the links move into a `<details>` menu that works without JS.
- **Section head** — mono index + rule (`01 / Selected work`), display h2, one supporting sentence.
- **Project card** — bespoke visual on an engineering grid, category / kind line, title, two-sentence summary, role + one verified fact, stack tags. The whole card is one link target.
- **Case study** — breadcrumb, oversized title, spec table (role, context, period, team, repository, audited revision), hero visual, fact strip, sticky table of contents, prose with figures, callouts, code, demo, pager. Authoring rules: `docs/CASE_STUDY_GUIDE.md`.
- **Demo shell** — `.demo` with a labelled bar (provenance badge), controls, stage, readout, data table in `<details>`, provenance footer.
- **Command palette** — native `<dialog>` + combobox/listbox pattern over a build-time index.
- **Recruiter brief** — four-fact strip, CV actions, three role-family orderings selectable via links / `?focus=`.

## Refinement log

Evidence-based changes made after looking at rendered screenshots (see `docs/QA.md` for the full QA record).

| Pass | Observation (from pixels) | Change |
|---|---|---|
| 1 | Monogram in the drawing sheet was as heavy as a logo, dimension text ~8.5 px, decorative angle arc misplaced | Stroke 3.6 → 2.6 units, annotation text 11 → 13, arc removed |
| 1 | Mobile hero was ~1,600 px tall before any work appeared; name used only ~64% of the width | Name scaled with viewport (17.4vw), facts in a 2 × 2 grid before the sheet, tighter padding |
| 1 | Programmes, university and location were stated three times (lede, title block, fact strip) | Title block now carries drawing metadata only (drawn, grid, date, revision) |
| 1 | Section-head sentence stranded in the far right column; label rule too short | Sentence placed under the heading; rule spans the full width |
| 1 | Card visual clipped its chart at 390 px (16:9) | 4:3 below 30em, 16:9 above |
| 1 | Feature-card title same size as the section h2 | Stepped down to its own clamp |
| 1 | Email address wrapped mid-word on phones | Fluid size tied to viewport width |

## Phase 2 — art direction decisions

Phase 2 took the V1 release candidate (tag `v1-before-phase-2`) and pushed it from "consistent and careful" towards "art-directed". The brief: more premium and memorable, stronger motorsport-engineering precision, less documentation tone — without colour for decoration, fake instrumentation or effects for their own sake. An independent creative-direction review compared V1 and V2 against the eight references from rendered screenshots; its scores and the changes it triggered are recorded below.

### One bold element, everything else quiet

The boldness is spent on the hero drawing. It was a static figure in V1; in V2 it is an **instrument**: moving a pointer (or tapping) over the sheet shows a measuring crosshair, the sheet header reports the position in grid units, the crosshair snaps to the seven construction nodes and names them (`A2 A · apex  X 15.0  Y 26.0 u`), and the sheet tilts a few degrees towards the pointer. Every value is real geometry of the mark. It is pointer-driven, so nothing moves on its own; with reduced motion the tilt is off; without JavaScript it is the fully labelled static drawing. The decorative hero grid and the sheet's drop shadow were removed so that the drawing is the only "designed" object in the first screen.

Rejected for the hero: WebGL or a rotating 3D part (cost, and it would compete with the name), particles or telemetry loops (motion without meaning), a larger animated logo (identity without information).

### Motion that carries information

| Where | What moves | Why it is not decoration |
|---|---|---|
| Hero drawing | Crosshair, node highlight, slight tilt — only while inspected | It is a measuring tool for the drawing's real dimensions |
| Hero → work transition | A speed trace is plotted left to right once, when it scrolls into view | It is the actual vehicle-speed signal of a LongiSafe scenario, with the fault window marked, and links to that case study |
| LongiSafe card | A playhead sweeps the recorded signals once (loops only while hovered/focused) | Shows what the tool does: replaying a recording past the fault and the detection |
| Ride Planner card | Two markers leave together and arrive in proportion to the computed travel times | Shows the trade-off the router computes |
| Tacto card | Offers are revealed round by round until the agreement point | Shows a negotiation converging |
| Cards | A soft highlight on the border follows the pointer | Pointer feedback; replaces a generic lift/shadow hover |
| Contact | The copy icon morphs into a check mark when the address is copied | Confirms the action |

Everything is CSS or SVG; the only scripts are the crosshair maths and one `pointermove` listener for the card highlight. No animation library. All of it stops under `prefers-reduced-motion: reduce`.

### Each project gets its own picture

V1 cards shared one visual grammar. V2 gives each project a visual built from its own data, in the shared token palette: a telemetry panel with readout chips (LongiSafe), a US tile-grid map shaded in five monochrome steps with the skipped state hatched (Demographics — a schematic grid defined in code, so no map asset or licence is involved), a mission-control panel with pipeline, budget and capacity (InfraFlow), a contour map with fastest versus scenic route (Ride Planner), and two negotiation lanes converging on a deal (Tacto). Tag clutter was reduced to one line of three technologies; the role is the emphasised cell.

### Two reading levels in every case study

Each case study now opens with an **Overview** panel (problem, solution, role, individual contribution, verified outcomes, technologies, links to the demo and the source) for the 20–30 second read; the detailed sections follow. Each demo is preceded by a short **Try it yourself** sequence that was executed in a browser to confirm the stated result. Long reference lists moved into native disclosures. Architecture diagrams ship in two drawings — wide for desktop, vertical for phones — instead of a horizontally scrolling desktop drawing.

### Recruiter brief, contact, footer

- **Recruiter brief:** one compact page — name, six facts (programmes, leadership, industry, languages, location, what he is looking for), then one panel per specialization whose summary, skills, project order and CV action change with the selection. Facts never change.
- **Contact:** an editorial headline on the left, a single "direct line" panel on the right with the address at a readable size, copy and write actions, LinkedIn, GitHub, the recruiter brief and the location. The oversized email headline and the repeated contact blocks of V1 are gone.
- **Footer:** one row (mark, navigation, external links, theme) and one line of build information; roughly a quarter of the V1 height.

### Copy

Headings state the subject instead of making a point about credibility ("Selected engineering projects", "Engineering capabilities in practice", "Explore my experience by specialization"). Limitations, team attribution and AI assistance are stated once, where they belong. Eyebrow labels that only repeated the heading below them were removed, as were numbered section markers on content that is not a sequence.

### Typography note

Space Grotesk's spurred capitals and numerals are part of the identity at display size, but at 30–50 px in dense figures ("43 + 18") they read as a rendering glitch. Figures in the fact strip are therefore set in Inter.

### Independent creative-direction scores (0–5, from screenshots)

| Criterion | V1 | V2 |
|---|---|---|
| Visual identity | 3.0 | 3.5 |
| Typography | 3.0 | 3.0 |
| Composition | 3.0 | 3.5 |
| Premium feel | 3.0 | 3.5 |
| Project-card distinctiveness | 3.0 | 4.0 |
| Recruiter effectiveness | 3.0 | 4.0 |
| Mobile | 2.5 | 3.0 |
| Light theme | 3.5 | 4.0 |
| Motion | not captured | 3.5 |

These scores were given before the last refinement pass. That pass implemented the review's must-fix list: the desktop hero now fits one 900 px screen including the fact strip and the start of the signal trace; the trace is plotted on intersection instead of on load; the phone reaches the first project at about 1.3 screens (1,082 px; V1: 1,866 px); section headers became two-column with the redundant eyebrows removed; the four identical education cards became ledger rows; card proof cells no longer restate the role; the probe went monochrome. The scores have not been re-taken after that pass.

### Refinement log, Phase 2

| Observation (from pixels) | Change |
|---|---|
| Hero at 1440 × 900 was 1,023 px tall: fact strip clipped, trace below the fold | Name capped at 132 px, padding tightened, decorative grid removed — hero and trace start fit one screen |
| Signal trace animated on load while off-screen | Animation starts on intersection |
| Phone: first project at 1,866 px (V1), drawing sheet a full screen before it | Focus fact, trace and drawing leave the phone hero; first project at 1,082 px; the drawing appears in the closing section |
| Section headers ~300 px tall, right half empty, eyebrow repeating the heading | Two-column header, eyebrow removed |
| Four identical education/leadership cards | Ledger rows with date, title, detail |
| Team cards repeated "Team Lead" in two cells | Proof cell shows the first fact that is not the role |
| Blue crosshair competed with data colours | Crosshair and node highlight are monochrome |
| Readout truncated while inspecting | Readout takes the full header width while inspecting |
| Contact: oversized address, empty page, repeated blocks | Redesigned as headline plus one action panel |
| Footer taller than the content of some pages | One row plus one line |
| Capabilities columns misaligned when headings wrapped | Fixed heading height, smaller headings, single rule |
| Recruiter page links 23 px tall on phones; footer and theme targets under 44 px | Targets raised to 44 px where practical; minimum 24 px enforced by test |
