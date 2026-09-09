#!/usr/bin/env bash
# Updates Tweakpane in the LOCAL fork by pulling updates from upstream
# (cocopon/tweakpane) and realigning the version used by the demo.
#
# Why it is simple: the Driftpane layer lives ENTIRELY in driftpane/ and uses
# only the public Pane API. It does NOT touch the Tweakpane core, so merges from
# upstream stay clean (no conflicts on the library files).
#
# Usage (from the driftpane/ folder or from any cwd in the repo):
#   ./update-tweakpane.sh            # pull the latest upstream/main
#   ./update-tweakpane.sh v4.1.0     # pull a specific upstream tag/branch
#   ./update-tweakpane.sh upstream/main
set -euo pipefail

# Root of the fork, independent of the cwd (this script lives in driftpane/).
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

REF="${1:-upstream/main}"

pkg_version() {
  node -p "require('./packages/tweakpane/package.json').version" 2>/dev/null \
    || grep -m1 '"version"' packages/tweakpane/package.json \
       | sed -E 's/.*"([0-9.]+)".*/\1/'
}

# 1) Ensure the 'upstream' remote -> cocopon/tweakpane.
if ! git remote get-url upstream >/dev/null 2>&1; then
  echo "[update] 'upstream' remote missing: adding it (cocopon/tweakpane)"
  git remote add upstream https://github.com/cocopon/tweakpane.git
fi

OLDVER="$(pkg_version)"
echo "[update] current Tweakpane version: ${OLDVER}"

# 2) No uncommitted tracked changes (the driftpane/ layer is separate).
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "[update] WARNING: you have uncommitted tracked changes." >&2
  echo "[update] Commit or stash them before updating (the driftpane/ layer" >&2
  echo "[update] stays intact in any case)." >&2
  exit 1
fi

# 3) Fetch updates and tags from upstream.
echo "[update] fetching from upstream..."
git fetch upstream --tags --prune

# 4) Integrate the core updates (usually fast-forward).
echo "[update] integrating '${REF}' into the current branch..."
git merge --no-edit "$REF"

# 5) Realign the Tweakpane version used by the DEMO (CDN pin in the import-map).
NEWVER="$(pkg_version)"
DEMO_HTML="driftpane/demo/index.html"
if [ -n "${NEWVER}" ] && [ -f "${DEMO_HTML}" ]; then
  sed -i '' -E \
    "s#tweakpane@[0-9]+\.[0-9]+\.[0-9]+/dist/tweakpane.js#tweakpane@${NEWVER}/dist/tweakpane.js#g" \
    "${DEMO_HTML}"
  echo "[update] demo import-map aligned to tweakpane@${NEWVER}"
fi

echo
if [ "${OLDVER}" = "${NEWVER}" ]; then
  echo "[update] No version change (already at ${NEWVER}). Any core commits are integrated anyway."
else
  echo "[update] Tweakpane updated: ${OLDVER} -> ${NEWVER}"
fi
echo "[update] Recommended next steps:"
echo "  1) Rebuild the demo:            (cd driftpane/demo && ./build.sh)"
echo "  2) Type-check the layer:        (cd driftpane && tsc -p tsconfig.json)"
echo "  3) Open the demo and verify the public API used by the layer holds up"
echo "     (exportState/importState, addBlade view:'list', on('change')/on('fold'))."
