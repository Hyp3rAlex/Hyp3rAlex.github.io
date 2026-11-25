# Security and publication audit

Date: 2026-11-25. Scope: the working repository of this site before its first public release. The auditor did not build the site and changed no implementation file. This is the public summary; detailed findings are kept with the owner's working material.

## Release rule

**The public history starts from a single clean commit of the approved tree.** The development history is never pushed. `scripts/prepare-release.sh` exports the tracked files of the approved commit, removes the paths that are not part of the public tree, runs a pattern gate over the result and creates a new repository with one commit. It publishes nothing: creating the remote and pushing are separate, manual steps taken by the owner after approval.

Reason: an early performance-measurement run left temporary browser-profile folders of a headless test browser in one development commit. They were removed in the following commit and are in no current tree. Their databases were opened read-only and inspected: the credential and cookie stores hold no entries, no account was signed in, and the only pages cached were this site's own, served locally. No credential was exposed. The folders do contain local path names, so that history stays private as a matter of policy.

## Method

- File inventory from `git ls-files`, plus untracked and ignored files from `git status --porcelain --ignored`.
- Pattern searches over tracked files, over every commit of the development history and over the production build: credentials and key formats, local paths and account names, phone numbers, postal and birth data, e-mail addresses other than the published contact address, references to working material kept outside the repository, and names that the site must not use.
- Binary assets: marker segments of every JPEG and chunk types of every PNG were listed; a sample was viewed.
- Datasets in `src/data/`: provenance fields, origin and licence statements read for each file.
- Production build (`dist/`): file types, external hosts, resource requests, source maps, comments, metadata.
- Workflows in `.github/workflows/` read line by line.
- `npm audit` with and without development dependencies; licences and install scripts from the lockfile.
- A dry run of the release script into a scratch directory, with the result inspected.

## Result per area

| Area | Result |
|---|---|
| Secrets | None found in the tracked tree, the build or the development history. The only token reference is the built-in workflow token. No `.env` file is tracked and the pattern is ignored. |
| Personal data | The site publishes name, city, e-mail address, LinkedIn and GitHub. No phone number, street address, date of birth or student identifier was found. A unit test guards the contact set. |
| Local paths and machine names | None in the public tree after the exclusions below. The release gate checks this on every export. |
| Internal documents | Working logs, assistant instructions, an internal compliance audit, research notes on third-party sites, machine-setup notes and the CV pipeline are excluded from the public tree by the release script. |
| Images | 45 tracked raster images. The JPEG files carry only JFIF and a colour profile; the PNG files carry no text or EXIF chunks. All show this site or synthetic project data. No third-party site captures and no portraits are in the repository. |
| Datasets | Every demo dataset has a provenance block. Four are synthetic or generated from the projects' own committed synthetic data; one is a simulator re-run on a starter kit's sample case; the population dataset contains state-level totals only, with source, copyright text, licence reference and retrieval date. The repository-metadata snapshot holds public fields and HTTP ETags, no token. |
| Production build | 77 files, 2.3 MB. No source maps, no PDF or Word files, no CV directory, no generator tag, no local paths. No script, font, style or image is loaded from another host and the scripts make no network requests. External links go to github.com, linkedin.com, arcgis.com and docs.github.com. `robots.txt` and the sitemap list the 13 public routes. |
| Workflows | Default permission is `contents: read`. Only the deploy job receives `pages: write` and `id-token: write`. The pull-request workflow has no deploy step and no write permission. Actions are pinned to major versions. The metadata refresh uses the built-in token, read-only. Nothing echoes a secret. The weekly schedule is a single run. |
| Dependencies | `npm audit` and `npm audit --omit=dev`: 0 vulnerabilities. Lockfile present (version 3), all packages resolved from the npm registry. Direct dependencies are MIT, Apache-2.0, MPL-2.0 (test tooling) or OFL-1.1 (fonts). No direct dependency runs an install script. |
| History | The development history is private and stays private (see the release rule). Commit author data uses the published contact address. |
| Release dry run | One commit, no remote, gate passed. |

## Open before publication

These are owner decisions, not defects of the build:

- consent of the teammates named on the two team-project pages;
- naming of third parties in project context lines;
- approval of the CV documents before any of them, or their sources, is published.

## Re-running the checks

```sh
bash scripts/prepare-release.sh <commit> <empty-output-directory>
```

The script stops with a non-zero exit code and leaves nothing behind if the gate finds a forbidden pattern or file type. Its exclusion list and patterns are at the top of the file.

## Addendum: CV downloads

The site can offer six CV PDFs from `public/cv/`. They are released only when the owner has approved them: the release script removes the folder unless it is run with `RELEASE_WITH_CVS=approved` and the manifest is marked approved, and then keeps only the six canonical PDFs after verifying their checksums. Public PDFs contain no phone number, address or date of birth (checked in text, metadata and raw bytes by the CV validation); editable sources and private copies are stored outside the repository.
