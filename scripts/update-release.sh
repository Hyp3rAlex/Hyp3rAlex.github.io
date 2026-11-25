#!/usr/bin/env bash
# update-release.sh — bring an approved change from the working repository into the existing
# public release repository, without ever exposing the working repository's history.
#
#   bash scripts/update-release.sh [<commit>] [<release-dir>]
#   RELEASE_WITH_CVS=approved bash scripts/update-release.sh        # when CV PDFs are part of the release
#
# It runs prepare-release.sh into a temporary directory (same export, same exclusions, same content
# gate), then mirrors that tree into the release repository's working copy (everything except .git).
# It does not commit and does not push: review `git status` / `git diff` there, then commit and push
# yourself. Defaults: commit HEAD, release directory ../_release/Hyp3rAlex.github.io.
set -euo pipefail

SRC=$(git -C "$(dirname -- "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)
REL=${1:-HEAD}
DEST=$(realpath -m -- "${2:-$SRC/../_release/Hyp3rAlex.github.io}")

[ -d "$DEST/.git" ] || { echo "update-release: no release repository at $DEST (first release: use prepare-release.sh)" >&2; exit 1; }
case "$DEST/" in "$SRC"/*) echo "update-release: the release repository must be outside the working repository" >&2; exit 1 ;; esac
if [ -n "$(git -C "$DEST" status --porcelain)" ]; then
  echo "update-release: the release repository has uncommitted changes; commit or discard them first" >&2; exit 1
fi

TMP=$(mktemp -d)
trap 'rm -rf -- "$TMP"' EXIT
bash "$SRC/scripts/prepare-release.sh" "$REL" "$TMP/export" >/dev/null || {
  echo "update-release: the export or its content gate failed; run prepare-release.sh to see why" >&2; exit 1; }

# Mirror the gated tree over the release working copy; keep its .git and never copy the temporary one.
rsync -a --delete --exclude '.git/' --exclude 'node_modules/' --exclude 'dist/' --exclude '.astro/' \
  --exclude 'test-results/' --exclude 'playwright-report/' "$TMP/export/" "$DEST/"

echo "Release working copy updated from $(git -C "$SRC" rev-parse --short "$REL")."
echo "Nothing was committed or pushed. Next, in $DEST:"
echo "  git status && git diff --stat"
echo "  npm ci && npm run lint && npm run check && npm test && npm run build"
echo "  git add -A && git commit -m \"<what changed>\" && git push"
git -C "$DEST" status --short | head -n 40
