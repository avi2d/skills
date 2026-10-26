#!/bin/sh
set -eu
if [ -n "$(git status --porcelain)" ]; then
  echo "mutate: refusing to run on a dirty tree; the sandbox copies uncommitted work, so the score would describe no commit." >&2
  git status --porcelain >&2
  exit 1
fi
