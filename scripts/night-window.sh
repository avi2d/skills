#!/bin/sh
set -eu
need=$1
if [ "$GITHUB_EVENT_NAME" = schedule ]; then
  left=0
  case "$(date -u +%H)" in
    02|03|04) left=$(( ($(date -u -d 05:00 +%s) - $(date -u +%s)) / 60 )) ;;
  esac
  if [ "$left" -lt "$need" ]; then
    echo "::notice::skipping $2, which needs $need minutes, with $left left in the 02:00-05:00 UTC night window"
    exit 0
  fi
  echo "minutes=$left" >> "$GITHUB_OUTPUT"
fi
echo "ran=true" >> "$GITHUB_OUTPUT"
