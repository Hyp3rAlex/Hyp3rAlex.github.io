#!/usr/bin/env bash
# Prepare a sanitized, single-commit copy of the site for the public repository.
#
#   bash scripts/prepare-release.sh [<commit>] [<output-dir>]
#
#   <commit>      commit of the working repository to release (default: HEAD)
#   <output-dir>  where the release repository is created
#                 (default: ../_release/Hyp3rAlex.github.io next to the working repository)
#
# What it does:
#   1. exports the TRACKED tree of <commit> with `git archive` (the working repository's .git directory,
#      ignored files and uncommitted changes are never copied);
#   2. removes the paths in RELEASE_EXCLUDE;
#   3. runs a grep gate over the exported tree and aborts on any forbidden pattern or file type;
#   4. creates a NEW repository with exactly one commit, "Initial public release";
#   5. prints the commands that publish it. It does not run them.
#
# What it never does: push, create a remote, call `gh`, deploy, or modify the working repository
# (no commit, no ref, no config change, no history rewrite). The release repository shares no git
# object history with the working repository.
#
# Re-running is safe: it refuses to touch an output directory that already holds a repository or any
# other content, and on a failed gate it removes only the directory it created itself.

set -euo pipefail

# --- configuration ----------------------------------------------------------------------------------

# Tracked paths that are NOT part of the public tree (relative to the repository root; a trailing
# slash marks a directory). Remove an entry only when the reason given no longer applies.
RELEASE_EXCLUDE=(
  'cv/'                        # CV pipeline and content source: held back until the CV documents are approved
  'PROGRESS.md'                # internal working log (workspace layout, process state)
  'CLAUDE.md'                  # working instructions for the coding assistant
  'docs/COMPLIANCE_MATRIX.md'  # internal audit against a specification that is not published
  'docs/REFERENCE_REVIEW.md'   # research notes assessing third-party sites by name
  'docs/VERSIONS.md'           # local backup and restore notes for the working copy
  'docs/TOOLING.md'            # description of the development machine
  'docs/PUBLICATION.md'        # owner's runbook for the working copy
)

# The only e-mail address that may appear in the tree (besides noreply/example addresses).
APPROVED_EMAIL='alexander.yordanov.bg@gmail.com'

# Optional file with additional forbidden patterns that must not be written into a public script
# (one extended regular expression per line; '#' comments). Kept outside the repository.
EXTRA_PATTERNS_FILE_DEFAULT='../_private/release-forbidden-patterns.txt'

# Forbidden content: label<TAB>extended regular expression (case-insensitive).
FORBIDDEN_PATTERNS=(
  $'local home path\t(^|[^A-Za-z0-9._-])/home/[a-z_][a-z0-9_-]*/'
  $'Windows mount path\t/mnt/[a-z]/'
  $'Windows user path\t[A-Za-z]:\\\\+Users'
  $'temporary session path\t/tmp/claude-'
  $'private workspace directory\t_private|_sources/|portfolio-backups|job-search'
  $'private file name\tclaims\\.yaml|forbidden-claims|MASTER_PROMPT|NOTES_audit|RECOVERY_AUDIT|INDEPENDENT_REVIEW|CV_RECRUITMENT|PHASE2_SPEC'
  $'phone number (international)\t(\\+|00)(49|359)[ ./-]?\\(?[0-9]{2,4}\\)?[ ./-]?[0-9][0-9 ./-]{5,}'
  $'phone number (German mobile)\t(^|[^0-9.,:#x-])01[5-7][0-9][ /-]?[0-9]{3,4}[ -]?[0-9]{3,4}([^0-9]|$)'
  $'university mail address\t@(my)?tum\\.de|@[a-z.]+\\.tum\\.de'
  $'credential\tghp_[A-Za-z0-9]{20}|gho_[A-Za-z0-9]{20}|github_pat_[A-Za-z0-9_]{20}|AKIA[0-9A-Z]{16}|BEGIN [A-Z ]*PRIVATE KEY|xox[baprs]-[A-Za-z0-9-]{10}|AIza[0-9A-Za-z_-]{35}'
  $'browser profile artefact\tAppData|Login Data|lighthouse\\.[A-Za-z0-9]{6}/'
)

# Forbidden file names / types anywhere in the exported tree (find -iname patterns).
FORBIDDEN_FILES=(
  '*.pdf' '*.docx' '*.doc' '*.xlsx' '*.pyc' '*.sqlite' '*.sqlite3' '*.db' '*.pem' '*.key' '*.p12'
  '.env' '.env.*' 'id_rsa*' '*.map' '*.Zone.Identifier' 'Cookies' 'Login Data*' '__pycache__'
  'claims.yaml' 'C:*' '*.tmp*.config.ts' '.venv'
)

# Files the content gate does not read: this script (it has to spell the patterns out) and the
# lockfile (registry URLs and integrity hashes only).
GATE_SKIP=('scripts/prepare-release.sh' 'package-lock.json')

# --- helpers ----------------------------------------------------------------------------------------

say()  { printf '%s\n' "$*"; }
fail() { printf 'prepare-release: %s\n' "$*" >&2; exit 1; }

# --- arguments and preconditions ---------------------------------------------------------------------

[ "$#" -le 2 ] || fail "usage: bash scripts/prepare-release.sh [<commit>] [<output-dir>]"

SRC=$(git -C "$(dirname -- "${BASH_SOURCE[0]}")" rev-parse --show-toplevel 2>/dev/null) \
  || fail "this script must live inside the working repository"
REL_INPUT=${1:-HEAD}
REL=$(git -C "$SRC" rev-parse --verify --quiet "${REL_INPUT}^{commit}") \
  || fail "not a commit in the working repository: $REL_INPUT"

OUT_INPUT=${2:-"$SRC/../_release/Hyp3rAlex.github.io"}
case "$OUT_INPUT" in /*) ;; *) OUT_INPUT="$PWD/$OUT_INPUT" ;; esac
OUT=$(realpath -m -- "$OUT_INPUT")

case "$OUT/" in "$SRC"/*) fail "the output directory must be outside the working repository: $OUT" ;; esac
[ ! -e "$OUT/.git" ] || fail "refusing to run: $OUT already contains a .git (an existing release repository is never overwritten)"
if [ -e "$OUT" ]; then
  [ -d "$OUT" ] || fail "output path exists and is not a directory: $OUT"
  [ -z "$(ls -A -- "$OUT")" ] || fail "refusing to run: $OUT exists and is not empty"
fi

AUTHOR_NAME=$(git -C "$SRC" config user.name || true)
AUTHOR_EMAIL=$(git -C "$SRC" config user.email || true)
[ -n "$AUTHOR_NAME" ] && [ -n "$AUTHOR_EMAIL" ] || fail "git user.name / user.email are not configured for the working repository"
[ "$AUTHOR_EMAIL" = "$APPROVED_EMAIL" ] \
  || fail "git user.email ($AUTHOR_EMAIL) is not the approved public address; the commit would publish it"

say "Working repository : $SRC"
say "Commit to release  : $REL ($REL_INPUT)"
say "Output directory   : $OUT"
if [ -n "$(git -C "$SRC" status --porcelain)" ]; then
  say "NOTE: the working tree has uncommitted or untracked changes. They are NOT part of this release;"
  say "      only the tracked tree of the commit above is exported."
fi

CREATED_OUT=0
[ -e "$OUT" ] || { mkdir -p -- "$OUT"; CREATED_OUT=1; }
DONE=0
cleanup() {
  if [ "$DONE" -ne 1 ]; then
    # Remove only what this run produced; the directory was verified empty or absent before.
    if [ "$CREATED_OUT" -eq 1 ]; then rm -rf -- "$OUT"; else find "$OUT" -mindepth 1 -delete 2>/dev/null || true; fi
    printf 'prepare-release: aborted; nothing was left in %s\n' "$OUT" >&2
  fi
}
trap cleanup EXIT

# --- 1. export the tracked tree -----------------------------------------------------------------------

git -C "$SRC" archive --format=tar "$REL" | tar -x -C "$OUT"
[ ! -e "$OUT/.git" ] || fail "export unexpectedly contains .git"

# --- 2. remove excluded paths -------------------------------------------------------------------------

# CV documents: public/cv/ is part of the release ONLY when the owner has approved the documents:
#   RELEASE_WITH_CVS=approved bash scripts/prepare-release.sh ...
# and public/cv/manifest.json says "status": "approved". Then exactly the six canonical PDFs listed in
# the manifest are kept (checksums verified); everything else in that folder is removed. Without the
# variable the folder is removed entirely and the site falls back to "request by email".
CV_DIR="$OUT/public/cv"
if [ "${RELEASE_WITH_CVS:-}" = "approved" ]; then
  [ -f "$CV_DIR/manifest.json" ] || fail "RELEASE_WITH_CVS=approved, but the commit has no public/cv/manifest.json"
  grep -Eq '"status"[[:space:]]*:[[:space:]]*"approved"' "$CV_DIR/manifest.json" \
    || fail "public/cv/manifest.json is not marked \"status\": \"approved\" — the CVs have not been approved for publication"
  KEEP=$(grep -Eo '"file"[[:space:]]*:[[:space:]]*"[^"]+"' "$CV_DIR/manifest.json" | sed -E 's/.*"([^"]+)"$/\1/')
  [ "$(printf '%s\n' "$KEEP" | grep -c .)" -eq 6 ] || fail "the CV manifest must list exactly six files"
  for f in $KEEP; do
    case "$f" in
      Alexander_Yordanov_CV_Software_Engineering_EN.pdf|Alexander_Yordanov_Lebenslauf_Software_Engineering_DE.pdf|\
      Alexander_Yordanov_CV_Data_Engineering_EN.pdf|Alexander_Yordanov_Lebenslauf_Data_Engineering_DE.pdf|\
      Alexander_Yordanov_CV_Engineering_Software_EN.pdf|Alexander_Yordanov_Lebenslauf_Engineering_Software_DE.pdf) ;;
      *) fail "unexpected CV file name in the manifest: $f" ;;
    esac
    [ -f "$CV_DIR/$f" ] || fail "CV listed in the manifest is missing: $f"
    want=$(grep -A8 -F "\"$f\"" "$CV_DIR/manifest.json" | grep -Eo '"sha256"[[:space:]]*:[[:space:]]*"[0-9a-f]{64}"' | head -n1 | grep -Eo '[0-9a-f]{64}')
    have=$(sha256sum "$CV_DIR/$f" | cut -d' ' -f1)
    [ -n "$want" ] && [ "$want" = "$have" ] || fail "checksum of $f does not match the manifest"
  done
  for existing in "$CV_DIR"/*; do
    b=$(basename -- "$existing")
    [ "$b" = "manifest.json" ] && continue
    printf '%s\n' "$KEEP" | grep -qxF "$b" || rm -rf -- "$existing"
  done
  CVS_INCLUDED=1
else
  rm -rf -- "$CV_DIR"
  CVS_INCLUDED=0
fi

say
say "Excluded from the public tree:"
for p in "${RELEASE_EXCLUDE[@]}"; do
  case "$p" in /*|*..*) fail "invalid RELEASE_EXCLUDE entry: $p" ;; esac
  if [ -e "$OUT/${p%/}" ]; then rm -rf -- "${OUT:?}/${p%/}"; say "  removed  $p"; else say "  absent   $p"; fi
done

# References to excluded paths left in the published files (broken links). Reported, not fatal.
WARN=0
for p in "${RELEASE_EXCLUDE[@]}"; do
  hits=$(cd "$OUT" && grep -rIlF -- "${p}" . --exclude=prepare-release.sh --exclude=package-lock.json 2>/dev/null | sed 's|^\./||' | tr '\n' ' ' || true)
  if [ -n "$hits" ]; then
    [ "$WARN" -eq 1 ] || { say; say "WARNING: published files still refer to excluded paths (fix in the working repository):"; WARN=1; }
    say "  $p  <-  $hits"
  fi
done

# --- 3. gate ------------------------------------------------------------------------------------------

say
say "Gate:"
GATE_FAILED=0
skip_args=()
for s in "${GATE_SKIP[@]}"; do skip_args+=( ':!'"$s" ); done

gate_grep() { # label, pattern
  local out
  # git grep --no-index: plain recursive search of the exported directory, honouring the skip list.
  out=$(cd "$OUT" && git grep --no-index -nIiE -e "$2" -- . "${skip_args[@]}" 2>/dev/null | cut -c1-200 | head -n 20 || true)
  if [ -n "$out" ]; then
    GATE_FAILED=1
    say "  FAIL  $1"
    printf '%s\n' "$out" | sed 's/^/          /'
  else
    say "  ok    $1"
  fi
}

for entry in "${FORBIDDEN_PATTERNS[@]}"; do
  gate_grep "${entry%%$'\t'*}" "${entry#*$'\t'}"
done

# The local account and machine names, taken from the environment rather than written down here.
for word in "$(id -un)" "$(hostname)"; do
  if [ "${#word}" -ge 5 ]; then gate_grep "local account or machine name" "$(printf '%s' "$word" | sed 's/[][\\.^$*+?(){}|]/\\&/g')"; fi
done

EXTRA=${RELEASE_EXTRA_PATTERNS:-"$SRC/$EXTRA_PATTERNS_FILE_DEFAULT"}
if [ -f "$EXTRA" ]; then
  n=0
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in ''|'#'*) continue ;; esac
    n=$((n + 1))
    # The pattern itself is private: report only its number and the matching files.
    files=$(cd "$OUT" && git grep --no-index -lIiE -e "$line" -- . "${skip_args[@]}" 2>/dev/null | head -n 20 | tr '\n' ' ' || true)
    if [ -n "$files" ]; then GATE_FAILED=1; say "  FAIL  private pattern #$n in: $files"; fi
  done < "$EXTRA"
  say "  ok    $n private pattern(s) from the owner's list checked"
else
  say "  NOTE  no private pattern list found; only the built-in patterns were checked"
fi

# E-mail addresses: only the approved one, noreply and documentation examples.
mails=$(cd "$OUT" && git grep --no-index -hoIE -e '[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}' -- . "${skip_args[@]}" 2>/dev/null \
  | grep -viE "^${APPROVED_EMAIL//./\\.}\$|noreply|@example\.(com|org|net)\$|@[0-9]+x?\.(png|jpg|webp)\$" | sort -u || true)
if [ -n "$mails" ]; then
  GATE_FAILED=1; say "  FAIL  e-mail address other than the approved one:"; printf '%s\n' "$mails" | sed 's/^/          /'
else
  say "  ok    e-mail addresses"
fi

# File names and types.
find_args=()
for f in "${FORBIDDEN_FILES[@]}"; do find_args+=( -o -iname "$f" ); done
badfiles=$(cd "$OUT" && find . \( -false "${find_args[@]}" \) -print | sed 's|^\./||' \
  | { if [ "$CVS_INCLUDED" -eq 1 ]; then grep -Ev '^public/cv/Alexander_Yordanov_(CV|Lebenslauf)_(Software_Engineering|Data_Engineering|Engineering_Software)_(EN|DE)\.pdf$' || true; else cat; fi; } \
  | head -n 40)
if [ -n "$badfiles" ]; then
  GATE_FAILED=1; say "  FAIL  forbidden file name or type:"; printf '%s\n' "$badfiles" | sed 's/^/          /'
else
  say "  ok    file names and types"
fi

# Nothing but regular files and directories (no symlinks that could point outside the tree).
odd=$(cd "$OUT" && find . ! -type f ! -type d -print | head -n 10)
if [ -n "$odd" ]; then GATE_FAILED=1; say "  FAIL  symlink or special file:"; printf '%s\n' "$odd" | sed 's/^/          /'; else say "  ok    regular files only"; fi

[ "$GATE_FAILED" -eq 0 ] || fail "gate failed. Fix the findings in the working repository (or extend RELEASE_EXCLUDE), commit, and run again."

# --- 4. one commit ------------------------------------------------------------------------------------

git -C "$OUT" init -q -b main
git -C "$OUT" config user.name "$AUTHOR_NAME"
git -C "$OUT" config user.email "$AUTHOR_EMAIL"
git -C "$OUT" add -A
git -C "$OUT" commit -q -m "Initial public release"

COUNT=$(git -C "$OUT" rev-list --count --all)
[ "$COUNT" = "1" ] || fail "expected exactly one commit in the release repository, found $COUNT"
[ -z "$(git -C "$OUT" remote)" ] || fail "release repository unexpectedly has a remote"

DONE=1
FILES=$(git -C "$OUT" ls-files | wc -l | tr -d ' ')
SIZE=$(cd "$OUT" && git ls-files -z | xargs -0 du -cb | tail -n 1 | cut -f1)

say
say "Release repository ready: $OUT"
say "  commits : $COUNT  ($(git -C "$OUT" log -1 --format='%h %an <%ae> %s'))"
say "  files   : $FILES"
say "  size    : $SIZE bytes (tracked files)"
say "  remote  : none"
say
say "Nothing has been published. Before publishing, in the release repository:"
say "  npm ci && npm run lint && npm run check && npm test && npm run build"
say
say "Then, after the owner's approval, run these commands yourself:"
say "  cd \"$OUT\""
say "  gh repo create Hyp3rAlex/Hyp3rAlex.github.io --public --source . --remote origin"
say "  git push -u origin main"
say "  # then: repository Settings -> Pages -> Build and deployment -> Source: GitHub Actions"
say
say "Never push a branch or tag of the working repository itself; its history is private."
