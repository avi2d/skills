#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 2 ]; then
  printf 'Usage: %s BUILD_DIRECTORY PAGES_PROJECT\n' "$0" >&2
  exit 2
fi

build_directory=$1
project=$2
if [ ! -d "$build_directory" ]; then
  printf 'Build directory not found: %s\n' "$build_directory" >&2
  exit 1
fi
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  printf 'Commit tracked changes before deploying a preview.\n' >&2
  exit 1
fi
commit=$(git rev-parse --verify HEAD)
wrangler pages deploy "$build_directory" --project-name "$project" --branch "preview-$commit" --commit-hash "$commit" --commit-dirty=false
