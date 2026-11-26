#!/bin/sh
# The ci.yml the kit writes keeps one command in a test job, so the e2e tools and the temp check run inside it.
set -eu
tier="${1:?name the tier to test, unit or e2e}"
if [ "$tier" = e2e ]; then
  scripts/ci-sqlite3.sh
  scripts/ci-no-mistakes.sh
  PATH="$RUNNER_TEMP/sqlite:$RUNNER_TEMP/no-mistakes:$PATH"
  export PATH
fi
TMPDIR="$RUNNER_TEMP/suite-tmp"
BUN_TMPDIR="$RUNNER_TEMP/bun-tmp"
export TMPDIR BUN_TMPDIR
mkdir -p "$TMPDIR" "$BUN_TMPDIR"
TEST_TIER="$tier" bunx checks-ci test
scripts/check-tmp-clean.sh
