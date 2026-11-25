# Project audit: public evidence register

This file records, for every case study on the site, which repository and revision was audited, who owns the work, and where each published number, result and role claim comes from. It is the public summary of the per-project audits; the private audit notes are not published.

- **Audit date:** 2026-11-25 for all projects.
- **Method:** each repository was cloned read-only and read at the stated revision. Where it was possible without credentials, proprietary data or third-party services, the repository's own tests and scripts were re-run in an isolated copy of that revision. No source repository was modified.
- **Scope:** the register covers claims about the original projects. Tests of this site's own browser demos are part of this site's test suite and are not listed here.

## Evidence types

| Type | Meaning |
|---|---|
| re-run | Reproduced during the audit on 2026-11-25, in an isolated copy of the audited revision. |
| source file | Read in the repository at the audited revision. The repository-relative path is given. |
| repository record | Stated by the repository's own logs, reports, README or commit history. Not reproduced by the audit. |
| owner-confirmed | Stated by the owner. Not derivable from the repository. |

A claim with two types has two parts, for example a figure the repository records and the audit also reproduced.

---

## 1. LongiSafe Lab

| | |
|---|---|
| Repository | https://github.com/Hyp3rAlex/longisafe-lab |
| Revision audited | `12d8247` (tag `v0.1.0-m1`) |
| Audit date | 2026-11-25 |
| Ownership | Solo project; single commit author |
| Role | Sole author. The README states the project was developed iteratively with AI-assisted coding. |
| Licence | None chosen |

**Objective.** An offline engineering demonstrator that analyses longitudinal vehicle signals with debounced plausibility monitors. A Python reference and an independent Excel/VBA workbook analyse the same synthetic CSV, and a checker compares their exports. It is an educational tool on synthetic data. It is not safety-certified tooling and claims no conformance with any functional-safety standard.

**Verified stack.** Python (standard library for the core; pytest, matplotlib, reportlab and pypdf optional), Excel/VBA (nine modules, Windows desktop Excel), GitHub Actions.

**Re-run for the audit**

- `pytest -q`: 43 passed, 18 subtests passed (Python 3.12).
- `python -m unittest` with the standard library only: 43 tests run, 3 report tests skipped, OK.
- All 10 datasets regenerated and compared by hash with the committed CSV files: byte-identical.
- `scripts/check_all_excel_exports.py` on the archived Excel exports: 9 of 9 valid scenarios PASS.
- `scripts/vba_source_sync.py`: 9 modules match the code inside the workbook byte for byte.
- Monitor verdicts recomputed for S05, S09, S10 and S14: identical to the committed reports.

**Taken from the repository's own records**

- The desktop-Excel smoke test of 12 Nov 2026 (all 10 fixtures as expected) and the files it exported. Excel was not run for the audit.
- GitHub Actions results: passing on `main` and on tag `v0.1.0-m1`, after a failed first run on the initial commit.

**Claim register**

| Claim as published | Evidence type | Evidence |
|---|---|---|
| 43 Python tests and 18 subtests pass | re-run | `pytest -q` in an isolated copy; also stated in `README.md` and `docs/TEST_RESULTS.md` |
| Excel exports for 9 of 9 valid scenarios agree with the Python reference within declared tolerances | re-run (comparison); repository record (origin of the exports) | `scripts/check_all_excel_exports.py` on `evidence/excel_smoke/`; tolerances in `scripts/check_excel_exports.py` |
| 6 monitors implemented in both Python and VBA; MON-006 to MON-009 are placeholders | source file | `python/longisafe/analysis.py`, `excel/vba/modMonitors.bas`, `docs/PROJECT_STATE.md` |
| 10 synthetic scenarios, reproducible byte for byte (seed 41) | re-run | Generator output compared by SHA-256 with `data/synthetic/*.csv`; `scenarios/manifest.csv` |
| The 9 VBA modules under review are byte-identical to the code in the tested workbook | re-run | `scripts/vba_source_sync.py`; `docs/workbook_source_manifest.json` |
| Detection 0.4 s after injection in S09 (MON-003), 0.35 s and 0.5 s in S10 (MON-003, MON-004), 0.3 s in S14 (MON-005) | repository record; verdicts re-run | `reports/suite_results.csv`; `reports/<id>/rule_results.csv` |
| The malformed file (S11) is rejected at import, repeated timestamp at CSV row 82 | repository record | `reports/suite_results.csv`, `evidence/excel_smoke/smoke_results.csv` |
| The 4 healthy runs raise no FAIL | repository record | `reports/evaluation_summary.json` |
| S05: stop 102.06 m in 8.25 s, no monitor fails. S14: 318.59 m in 32.50 s, MON-005 fails from 3.00 s to 33.30 s | repository record; verdicts re-run | `reports/S05/metrics.csv`, `evidence/excel_smoke/S14/metrics.csv`, `evidence/excel_smoke/S14/rule_results.csv` |
| Metrics are withheld when a timing, range or coherence monitor objects | source file | `python/longisafe/analysis.py:110-114`; `tests/test_m1.py` |
| Fault truth is never read by the monitors | source file | `python/longisafe/generator.py:39-42`, `python/longisafe/analysis.py`; test `test_truth_not_input` |
| Workbook smoke test on Windows desktop Excel, 12 Nov 2026: all ten fixtures behaved as expected | repository record | `evidence/excel_smoke/smoke_results.csv`, `docs/TEST_RESULTS.md` |
| GitHub Actions workflow passing on `main` and tag `v0.1.0-m1` | repository record | Workflow run list read on the audit date; `.github/workflows/python-validation.yml` |
| Sole author | repository record | Commit history (two commits, one author) |

**Data shown on the site.** Four of the ten scenarios (S05, S09, S10, S14), taken from the committed `data/synthetic/*.csv` files. All signals are synthetic, produced by the repository's deterministic point-mass generator. No measured vehicle data exists in the project.

**Known limitations as published**

- Synthetic data only: a point-mass model without ABS or ESC; speed carries no noise in the fixtures.
- A demonstrator, not a safety artefact: illustrative thresholds, no hazard analysis, no standards conformance. FAIL means a configured rule was violated; PASS means no sustained configured breach.
- Six of ten monitor IDs are implemented; eight of the sixteen planned scenarios exist.
- The fixture results are a regression outcome on scenarios the thresholds were designed around, not a detection rate.
- The Excel evidence is one run on one Windows machine, without screenshots. Threshold changes without re-import and the scenario-comparison sheet are outside the validated scope.
- Some repository documents predate the Excel run and still describe it as pending.

---

## 2. Demographics Service

| | |
|---|---|
| Repository | https://github.com/Hyp3rAlex/demographics-service |
| Revision audited | `1bf9c87` |
| Audit date | 2026-11-25 |
| Ownership | Solo project; single commit author |
| Role | Sole author. The project skeleton comes from Spring Initializr. |
| Context | The README describes it as an application project (2026). No review, outcome or endorsement is claimed. |
| Licence | None chosen |

**Objective.** A Spring Boot service that pages through a public ArcGIS county layer, aggregates population by U.S. state, replaces a PostgreSQL table in one transaction every hour and serves the totals over two REST endpoints.

**Verified stack.** Java 17, Spring Boot 3.5.9 (Spring Web, Spring Data JPA, `WebClient` from the WebFlux starter), PostgreSQL 15, Maven, Docker and Docker Compose, JUnit 5 with Mockito and AssertJ.

**Re-run for the audit**

- The two query URLs the client builds were issued against the public layer: 2,000 + 1,144 = 3,144 features, equal to the layer's own record count.
- The aggregation was re-implemented outside the service and run on those pages: 50 rows (49 states and the District of Columbia), 9 records skipped (all Connecticut, population null), total 333,859,535.
- Texas came out at 30,506,523, identical to the sample response in the repository's README.

**Taken from the repository's own records**

- One unit test (`StatePopulationServiceTest`, one test method), counted by inspection. It was not executed.
- The service was not built or started for the audit. Behaviour of the running service is derived from reading the source.

**Claim register**

| Claim as published | Evidence type | Evidence |
|---|---|---|
| 3,144 county records fetched in 2 paged requests, page size 2,000 | re-run; source file | Live layer query on the audit date; `src/main/java/com/example/demographics/client/ArcGisClient.java:36-69` |
| 3,135 records summed into 50 state rows; 9 skipped as null | re-run | Aggregation re-implemented from `src/main/java/com/example/demographics/service/StatePopulationService.java:39-44` |
| Connecticut has no row because its nine upstream records carry a null population | re-run; source file | Live layer on the audit date; the null filter in `StatePopulationService.java:40-41`. The state of the layer in January 2026 is unknown. |
| Texas total 30,506,523 reproduced exactly | re-run; repository record | Re-implemented aggregation; sample response in `README.md` |
| Refresh is a delete-and-reinsert in one transaction, hourly, first run at start-up | source file | `StatePopulationService.java:34-55`; `src/main/java/com/example/demographics/scheduler/StatePopulationScheduler.java`; `src/main/resources/application.yml` |
| 2 REST endpoints: `GET /api/states`, `GET /api/states/{stateName}` (404 on a miss) | source file | `src/main/java/com/example/demographics/api/controller/StatePopulationController.java` |
| 5 s connect and 10 s response timeouts | source file | `src/main/java/com/example/demographics/config/WebClientConfig.java` |
| Java 17, Spring Boot 3.5.9, PostgreSQL 15, multi-stage Dockerfile, Compose | source file | `pom.xml`, `Dockerfile`, `docker-compose.yml` |
| One unit test; not executed | source file | `src/test/java/com/example/demographics/service/StatePopulationServiceTest.java` |
| The README documents `?name=Texas`; the code implements a path variable | source file | `README.md` against `StatePopulationController.java:34-41` |
| Sole author; built in January 2026 as an application project | repository record | Commit history (two commits, 24 Jan 2026, one author); `README.md` |

**Data shown on the site.** A static snapshot of the service's output: 50 state-level totals retrieved on 2026-11-25 by replaying the service's own two queries against Esri's public "USA Census Counties" layer. Sources as stated by the layer: Esri; U.S. Department of Commerce, Census Bureau; NOAA, National Ocean Service, National Geodetic Survey. Only state-level aggregates are shown, with attribution; no county-level records are redistributed. The figures are labelled without a year because the layer's metadata is ambiguous about the vintage of the field. The demo is a static replay and does not call the service.

**Known limitations as published**

- Connecticut has no row while its upstream population is null; skipped records are not counted or logged.
- No guard against an empty fetch result before the table is replaced (derived by reading; not reproduced).
- Paging ends on a short page and sets no explicit order.
- The README and the code disagree on the single-state route.
- One unit test; pagination, error paths, controller and repository are untested; no CI.
- Packaging gaps: the Compose file has no `build:` key, the Maven wrapper directory is missing, no health check, no migrations, no licence file.

---

## 3. InfraFlow Mission Control

| | |
|---|---|
| Repository | https://github.com/Hyp3rAlex/infraflow-mission-control |
| Revision audited | `bf7ebe0` |
| Audit date | 2026-11-25 |
| Ownership | Solo project; single commit author |
| Role | Sole author. The repository documents that an AI assistant was used during the build: live Jira and Confluence operations ran through an Atlassian connector, and the Jira snapshots in the evidence folder were transcribed by the assistant. |
| Licence | MIT |

**Objective.** An independent demonstrator for infrastructure demand management. An offline Python pipeline validates a synthetic demand register, reconciles budget and team capacity, and generates reports, Excel workbooks, a slide deck and Confluence page sources from one dataset. All data is synthetic and belongs to a fictional organisation; the project is not deployed anywhere.

**Verified stack.** Python 3.12, openpyxl, python-pptx, requests, pytest, GitHub Actions; JQL queries defined in code. No pandas and no web framework.

**Re-run for the audit**

- `pytest`: 179 passed in 9.89 s (Python 3.12.3).
- `infraflow seed`: regenerated dataset identical to the committed one (50 demands, cutoff 2026-11-16).
- `infraflow validate`: 19 findings (6 critical, 12 warnings, 1 informational); report status PROVISIONAL.
- `infraflow all`: every Markdown, JSON and CSV report identical to the committed file; both workbooks and the deck byte-identical with openpyxl 3.1.5 and python-pptx 1.0.2.
- `infraflow jira reconcile` and `infraflow jira live` on the recorded snapshot: 0 field differences, 0 lifecycle drift findings.

**Taken from the repository's own records**

- Everything on the private Atlassian site: the 50 issues in Jira, the 16 JQL queries returning the expected issues on 17 Nov 2026, the saved filters and the eight-gadget dashboard read on 18 Nov 2026, the Confluence pages.
- Microsoft Office checks: Excel 16 calculating 27 of 27 check cells; workbooks and deck opened and checked by eye.
- GitHub Actions: four runs on the public repository, all successful.
- The Jira REST client is tested against a mocked HTTP session only; the repository states it was not run against a live site.

**Claim register**

| Claim as published | Evidence type | Evidence |
|---|---|---|
| 179 automated tests passed | re-run | `pytest` in an isolated copy; `tests/` (15 test modules); also `docs/TESTING.md` |
| Data, reports, workbooks and deck regenerated byte-identical to the committed files | re-run | `infraflow seed`, `infraflow all`, file comparison; `src/infraflow/office_style.py`; `tests/test_generator.py:12-21` |
| 19-entry exception register, 6 critical; any critical entry marks every output PROVISIONAL; anomalies injected on purpose | re-run; source file | `infraflow validate`; `src/infraflow/validator.py`; `docs/DECISIONS.md` |
| 50 synthetic demands across 12 lifecycle stages; 37 open and 5 awaiting a decision at the cutoff | re-run; source file | `data/synthetic/demands.csv`, `data/synthetic/ground_truth.json`, `src/infraflow/config.py` |
| 16 JQL queries defined in code, each with an expected result computed from the dataset | source file | `src/infraflow/jira_sync.py:26-49`, `:195-213` |
| All 16 queries returned exactly the expected issues live on 17 Nov 2026 | repository record | `docs/JQL_FILTERS.md`, `evidence/jql_verification_2026-11-17.json` |
| 13 Markdown reports, a facts JSON, two workbooks, a five-slide deck, 12 Confluence page sources | re-run; source file | `infraflow all`; `src/infraflow/reports.py`, `src/infraflow/deck.py`, `docs/confluence_pages/` |
| Forecast EUR 936,700 against a budget of EUR 1,050,000; one cost centre EUR 3,800 over (synthetic) | re-run | `reports/report_facts.json`, `data/synthetic/ground_truth.json` |
| ORION-REQ-017 scores 82 (Highest) and is deferred because its preferred option fails the funding and capacity gates (scripted scenario) | source file | `docs/CASE_STUDY_ORION_REQ_017.md`, `reports/decision_brief_ORION-REQ-017.md`, `src/infraflow/scoring.py` |
| Decisions need a human role, an authorised approver, a rationale and a gate evaluation; enforced in the Python model, not in Jira | source file | `src/infraflow/lifecycle.py:30-79`; `tests/test_lifecycle.py`; `docs/LIMITATIONS.md` |
| Currency rule and the bug behind it (USD 5,000 added to EUR rows, EUR 9,300 reported) | source file; repository record | `src/infraflow/finance.py:49-54`; `docs/DECISIONS.md` (D-012) |
| Recorded Jira snapshot reconciles with the dataset: 0 differences, 0 drift | re-run on a recorded input | `evidence/jira_snapshot_mcp_2026-11-17b.json` |
| Jira REST v3 client with paging, retry and a write guard, mock-tested (22 tests) | source file | `src/infraflow/jira_client.py`, `tests/test_jira_client_mock.py` |
| Excel 16 calculated the formula workbook with 27 of 27 check cells OK | repository record | `evidence/excel_desktop_native_checks_2026-11-17.json` |
| Saved filters and an eight-gadget dashboard on the private site, read on 18 Nov 2026 | repository record | `evidence/jira_saved_filters_2026-11-18.json`, `docs/JIRA_CONFLUENCE_GUIDE.md` |
| CI regenerates data and reports and fails on any difference; four runs succeeded | source file; repository record | `.github/workflows/python-validation.yml`; run list read on the audit date |
| Sole author; evidenced build window 17 to 19 Nov 2026 | repository record | Commit history; `docs/DECISIONS.md`; `evidence/README.md` |

**Data shown on the site.** A reduced copy of the repository's synthetic dataset at the fixed cutoff 2026-11-16, exported on 2026-11-25. Demand titles and site labels are neutralised for the site; numeric and categorical fields are unchanged. Two screenshots come from the repository's `evidence/screenshots/` folder (files 07 and 19); both show synthetic data. No real organisation, person or system is represented.

**Known limitations as published**

- Synthetic throughout; the figures are tuned so that the scenarios occur.
- No live integration: reports are generated from CSV files, and the REST client is mock-tested only.
- The Atlassian state is a recorded one, on a private site without a public link; the record notes one saved filter with a wrong query.
- Gates are enforced only in the offline model and evaluate one demand at a time.
- Office rendering is checked by eye; byte identity of Office files depends on library versions.

---

## 4. BMW Motorrad Ride Planner

| | |
|---|---|
| Repository | Team hackathon repository, owned by a teammate (not linked here) |
| Revision audited | `dde641f` |
| Audit date | 2026-11-25 |
| Ownership | Team project, three people. Hackathon prototype for a challenge set by BMW Motorrad at the TUM.ai EHL hackathon in Zurich, as the README names it. |
| Role | Team Lead (owner-confirmed). Individual technical contribution: the caching and performance layer and 16 of the 27 unit tests, by commit authorship. |
| Licence | None chosen |

The project is an independent hackathon prototype. Nothing here implies affiliation with, employment by or endorsement from BMW.

**Objective.** A ride planner that routes motorcyclists by road quality instead of arrival time: a hand-written Dijkstra over an OpenStreetMap road graph, with an edge cost that multiplies travel time by scenery, risk and road-class terms.

**Verified stack.** Python (engine on the standard library), FastAPI and a standard-library HTTP server, OpenStreetMap data via the Overpass API, Open-Meteo, Leaflet and MapLibre GL, `unittest`. No routing library and no trained model.

**Re-run for the audit**

- Nothing. The repository was read only; no code was executed, and the challenge data set is not in the repository.

**Taken from the repository's own records**

- 27 `unittest` methods, counted by reading the test files; the README states that they pass on a fresh clone.
- Timings in `PERFORMANCE.md` and in a teammate's merge commit message. Not re-measured.
- Authorship of each part, from the commit history.

**Claim register**

| Claim as published | Evidence type | Evidence |
|---|---|---|
| Role: Team Lead of the three-person team | owner-confirmed | Owner confirmation. The repository lists three team members and cannot show roles. |
| Team achievement: a working prototype built in one weekend and pitched on 13 Sep 2026 | repository record | `README.md`; commit timestamps 12 to 13 Sep 2026 |
| Team achievement: routing with a hand-written Dijkstra, no routing library | source file | `engine/router.py:128-182`, `engine/cell_osm_router.py:358-395`, `requirements.txt` |
| Team design: cost = travel time × (1 + α·(1 − scenic) + β·risk + penalties) + junction delay; every term non-negative | source file | `engine/scoring.py:343-367` (authored by teammate a teammate) |
| Team design: rider capability is a hard exclusion, not a cost term | source file | `engine/scoring.py:321-331` (teammate-authored) |
| Teammates implemented the cost function, scenic score, routers, OpenStreetMap ingestion, weather scoring rules, point-of-interest planner, rider profiles and most of the ride page | repository record | Commit history and line attribution at `dde641f` |
| Individual contribution: signature-keyed disk cache with atomic writes and per-key locks | repository record; source file | Commit `e1a42e6` (owner is the author); `engine/cache.py` |
| Individual contribution: exact spatial index used for node snapping and point-of-interest attachment | repository record; source file | Commit `e1a42e6`; `engine/spatial.py`, `engine/cell_osm_router.py`, `engine/scenic.py` |
| Individual contribution: request-local memoised edge costs in the search loop (the algorithm and cost design are unchanged) | repository record; source file | Commit `e1a42e6`; `engine/cell_osm_router.py:263-273` |
| Individual contribution: data import path, provenance handling and warm-up | repository record; source file | Commit `e1a42e6`; `engine/ride_data.py`, `engine/demo_server.py`, `precompute/build_cell_graph.py` |
| Weather cache: 300 s and 900 s TTL, 60 s cooldown after a failure, stale data labelled | source file | `engine/cache.py:76-110`, `engine/weather.py`, `engine/rideworthy.py` |
| 27 automated tests in the repository (counted, not re-run); 16 are the owner's | source file; repository record | `tests/test_performance.py` (13) and `tests/test_presentation_http.py` (3), added in commit `e1a42e6`; three further test files by teammates |
| The performance branch was merged into the main branch | repository record | Merge commit `ef3b4cd` |
| A teammate checked the index against a brute-force sweep on 153 points with zero mismatches | repository record | Merge commit `ef3b4cd` (teammate's statement) |
| Start-up 10.38 s → 1.67 s; sample route requests 6.09 → 1.56 s, 8.22 → 1.15 s, 34.52 → 3.44 s; byte-identical route responses | repository record | `PERFORMANCE.md`. Self-reported at the time on sample data; not re-measured. |
| Individual contribution: an early hard motorway block for scenic routes, later replaced by the team's soft penalty and no longer called | repository record; source file | Commit `b5d6318`; `engine/router.py:358-368`; superseded by commit `6249d54` |
| AI coding tools were part of the team's workflow | repository record | Assistant instruction file and session-checkpoint trailers in the commit history |

Commit authorship establishes which changes the owner committed. The audit did not establish how individual commits were produced.

**Data shown on the site.** A hand-authored synthetic graph created for the site. It contains no map data, no OpenStreetMap extract, no code from the hackathon repository and no data from the hackathon. The challenge data set was not reproduced.

**Known limitations as published**

- Every weight in the scenic and risk scores is hand-chosen; there is no validation against rider feedback.
- One bounding box south of Munich; residential and service roads are left out; the time zone is fixed.
- No turn model; the junction delay is a constant prior.
- Pure-Python search over the whole graph; caching removed repeated preparation, not the cost of the search.
- Cache signatures use size and modification time, not content.
- Several tests compare against stored outputs; no CI; dependencies unpinned; no licence file; no deployment.
- No placement, prize or adoption is claimed; the repository records none.

---

## 5. Tacto Negotiation Arena

| | |
|---|---|
| Repository | Team hackathon repository, owned by a teammate (not linked here) |
| Revision audited | `700cf95` (tag `submission`) |
| Audit date | 2026-11-25 |
| Ownership | Team project, three people. Hackathon challenge set by Tacto, 10 to 11 Oct 2026; the repository names the event "MUC Hackathon". |
| Role | Team Lead (owner-confirmed). Individual technical contribution: the must-have guard layer, a confidence index, the `final` agent and the first practice-run analysis, by commit authorship. |
| Licence | None for the team's code; the `agent/` folder is stated to derive from Tacto's MIT-licensed starter kit. |

Nothing here implies employment by or endorsement from Tacto.

**Objective.** A rule-based buyer agent that negotiates multi-term procurement deals with supplier bots, unattended, in at most ten messages per supplier, scored on total cost. A deal that breaks a must-have scores zero.

**Verified stack.** Python 3.12, httpx, pytest, uv; rule-based agents with no language-model call at negotiation time. The cost function, game loop and local simulator come from the starter kit.

**Re-run for the audit**

- The repository's pytest suite, without arena credentials or the challenge data package: 410 passed, 72 skipped.
- The owner's five test files (guard, `final` agent, confidence index and its two agents): 75 passed, 1 skipped.
- One offline run of the `final` agent against the starter kit's local simulator on its sample case S01, exported twice: the two files were byte-identical.

**Taken from the repository's own records**

- All practice-arena results. They were scored by the organiser's system, logged by the team in `backlog.csv`, and need the hosted arena, so they were not reproduced.
- Authorship of each part, from the commit history. All of the owner's commits carry an AI coding assistant as co-author.
- The 72 skipped tests need the challenge data package, the hosted arena or an optional extra.

**Claim register**

| Claim as published | Evidence type | Evidence |
|---|---|---|
| Role: Team Lead of the three-person team | owner-confirmed | Owner confirmation. The repository lists three team members and cannot show roles. |
| Team achievement: the submitted agent reached agreements in 10 of 10 practice cases, mean score about 0.72 | repository record | `backlog.csv` (versions v35 and v39), `README.md`. The submitted agent `better` was implemented by a teammate. Self-logged practice evaluation, not an official ranking. |
| Team achievement: that result was reproduced in 100 further sessions | repository record | `backlog.csv` (version v36) |
| Team achievement: 415 practice-arena sessions logged; last commit 23 minutes before the code freeze | repository record | `backlog.csv`; `CHALLENGE.md:29-40`; commit history |
| No language model is called at negotiation time | source file | Agent modules under `agent/arena_kit/`; `README.md`, `SUBMISSION.md` |
| The guard layer runs inside the submitted agent chain | source file | `agent/arena_kit/cli.py:126-127`; import in `agent/arena_kit/agents/better_agent.py:31` |
| Individual contribution: the must-have guard and its 28 tests | repository record; source file | Commit `e14cf70` (owner is the author); `agent/arena_kit/guard.py`, `agent/tests/test_guard.py` |
| Individual contribution: the first twenty practice sessions and the diagnosis that four of ten cases ended without a deal because must-haves were never requested | repository record | Message of commit `e14cf70`; `backlog.csv` |
| 75 tests in the owner's five test files pass, 1 skipped | re-run | `agent/tests/test_guard.py`, `test_final.py`, `test_confidence.py`, `test_confident_boulware.py`, `test_confident_router.py` |
| Repository suite: 410 passed, 72 skipped | re-run | `pytest` in an isolated copy |
| Individual contribution: the `final` agent closed 10 of 10 practice cases with a mean score of 0.58 | repository record | Commits `5c21308`, `c0489e2`; `backlog.csv` (version v17) |
| A teammate's `combined` agent builds on `final` | source file | `agent/arena_kit/agents/combined.py` |
| Individual contribution: a stateless confidence index (sixteen fixed phrases among its signals) and three agents that use it; not part of the submitted chain | repository record; source file | Commits `f3b1bc6`, `b62a6b9`; `agent/arena_kit/confidence.py`, `agent/arena_kit/agents/confident*.py` |
| The confidence-based router closed 6 of 10 practice cases (mean 0.21) before the guard and 8 of 10 (mean 0.29) after | repository record | `backlog.csv` (versions v10 and v12). One run each; not a controlled comparison. |
| An opening anchor at the buyer's current price was removed five minutes after it was committed, with the measured loss recorded | repository record | Commits `5c21308` and `c0489e2` |
| A value-space rewrite scored 0.56 against 0.58 and stayed on a branch | repository record | Branch `version-alex`, commit `ae66872` |
| The owner's commits were written with an AI coding assistant | repository record | Co-author trailers on the owner's commits |

No live-final score, rank or prize is claimed; the repository records none.

**Data shown on the site.** One offline run of the `final` agent against the starter kit's local simulator on the kit's sample case S01, recorded on 2026-11-25, and one hand-written synthetic case for the guard sandbox. No hosted-arena case data, supplier messages, transcripts or replay links are reproduced. The sponsor's challenge data package was not reproduced.

**Known limitations as published**

- Practice evaluation only; no live-final result is recorded.
- The supplier bots were deterministic, and several timing rules rely on that.
- The agent reads term sheets and thread status, not language.
- The guard is conservative: it returns the supplier's own price with corrected terms and can spend up to two of ten messages doing so.
- Multi-supplier runs are not bit-reproducible offline; single-supplier runs are.
- Not fully verifiable from outside: 72 tests need material that is not public; no licence file and no CI.

---

## 6. This portfolio site

| | |
|---|---|
| Repository | `Hyp3rAlex/Hyp3rAlex.github.io` (not public until release) |
| Revision | Working tree, 2026-11-25 |
| Ownership | Solo project |
| Role | Specification, facts and editorial control by the owner; implemented with an AI coding agent |

As the published case study states, the owner wrote the specification, supplied and confirmed the facts about himself, chose the design direction and decides what is published. The implementation (code, audits of the repositories, case-study drafts and tests) was produced with Claude Code, an AI coding agent, working from that specification. The owner is responsible for the content and its accuracy.

The site is static HTML generated by Astro, with hand-written CSS and first-party TypeScript; it has no backend, no analytics, no cookies and no third-party requests. Its measured figures (test counts, bundle size, Lighthouse lab results) are recorded by hand in `src/data/site-metrics.ts` with the date of measurement, and are lab values from one machine. They describe this repository, were not part of the five project audits, and should be re-measured at release.

---

## 7. Repositories without a case study

Listed in `src/data/repos.json` with kind `archive`. They appear in the archive table on the projects page.

| Repository | Reason |
|---|---|
| `Hyp3rAlex/LeetCode-Problem-Solutions` | A few early LeetCode solutions in JavaScript. Practice exercises, not a project. |
| `Hyp3rAlex/neetcode-submissions` | Auto-synced NeetCode practice submissions. Practice exercises, not a project. |
| `Hyp3rAlex/Hyp3rAlex` | GitHub profile README. |

---
