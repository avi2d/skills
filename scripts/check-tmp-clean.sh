#!/bin/sh
set -eu
left="$(ls -A "${TMPDIR:?set TMPDIR to the temp directory the suite ran in}")"
if [ -n "$left" ]; then
  printf 'check-tmp-clean: the suite left these in the temp directory:\n%s\n' "$left" >&2
  exit 1
fi
