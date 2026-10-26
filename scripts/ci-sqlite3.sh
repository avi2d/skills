#!/bin/sh
# The context index tests run the sqlite3 binary, which the self-hosted runner does not have.
set -eu
curl -fsSLo "$RUNNER_TEMP/sqlite.zip" https://sqlite.org/2026/sqlite-tools-linux-x64-3530400.zip
echo "7a6f4d1720e4bc13faa3d934bfce37b816a496c0a2480deacd64cfd8be6cf224  $RUNNER_TEMP/sqlite.zip" | sha256sum -c -
python3 -m zipfile -e "$RUNNER_TEMP/sqlite.zip" "$RUNNER_TEMP/sqlite"
chmod +x "$RUNNER_TEMP/sqlite/sqlite3"
echo "$RUNNER_TEMP/sqlite" >> "$GITHUB_PATH"
