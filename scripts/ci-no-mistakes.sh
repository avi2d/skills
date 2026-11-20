#!/bin/sh
# The no-mistakes e2e tests drive the real `no-mistakes doctor`, which the default runner does not have.
set -eu
VERSION="1.111.0+avi2d.36"
case "$(uname -s)-$(uname -m)" in
Linux-x86_64) PLATFORM="linux-amd64" SUM="c88017142e796b66a4079105a63156c7fd16bbf3a5b74a9ad17d8c0cdaaccbd7" ;;
Linux-aarch64 | Linux-arm64) PLATFORM="linux-arm64" SUM="f188fc72ca4bf10df408ab58c1bdd6acef7b91aeba539589352e9259de58fccb" ;;
Darwin-x86_64) PLATFORM="darwin-amd64" SUM="e2eb520f423ddebf6e1f6d1906ad479ff19a417b9bc59dc25e3ce5e9a0939336" ;;
Darwin-arm64) PLATFORM="darwin-arm64" SUM="604a932bde4ad320c782b03fa9ee684f9d71228ba4623eddfa557c503a61dcfc" ;;
*) echo "ci-no-mistakes: no pinned binary for $(uname -s)-$(uname -m)" >&2; exit 1 ;;
esac
FILE="no-mistakes-v$VERSION-$PLATFORM.tar.gz"
curl -fsSLo "$RUNNER_TEMP/$FILE" "https://github.com/avi2d/no-mistakes/releases/download/v$VERSION/$FILE"
echo "$SUM  $RUNNER_TEMP/$FILE" | sha256sum -c -
mkdir -p "$RUNNER_TEMP/no-mistakes"
tar -xzf "$RUNNER_TEMP/$FILE" -C "$RUNNER_TEMP/no-mistakes"
echo "$RUNNER_TEMP/no-mistakes" >> "$GITHUB_PATH"
