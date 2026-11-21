#!/bin/sh
# The no-mistakes e2e tests drive the real `no-mistakes doctor`, which the default runner does not have.
set -eu
VERSION="1.111.0+avi2d.37"
case "$(uname -s)-$(uname -m)" in
Linux-x86_64) PLATFORM="linux-amd64" SUM="e21b96909b2db2f5954a559c9a96e91fcad4a3c513f188c9ad0afc20b78df19a" ;;
Linux-aarch64 | Linux-arm64) PLATFORM="linux-arm64" SUM="280169886f54564d5b96a226588ba025d3e2c96140ae589045ff3d4535550301" ;;
Darwin-x86_64) PLATFORM="darwin-amd64" SUM="a4faad6a860984411fd804553bbbc37fbb73c4ba98a7ea7358575bd81f067427" ;;
Darwin-arm64) PLATFORM="darwin-arm64" SUM="bac0275743e4d81a2f42bb8735035c65e82b0c4f98c43488233028ba6bed4811" ;;
*) echo "ci-no-mistakes: no pinned binary for $(uname -s)-$(uname -m)" >&2; exit 1 ;;
esac
FILE="no-mistakes-v$VERSION-$PLATFORM.tar.gz"
curl -fsSLo "$RUNNER_TEMP/$FILE" "https://github.com/avi2d/no-mistakes/releases/download/v$VERSION/$FILE"
echo "$SUM  $RUNNER_TEMP/$FILE" | sha256sum -c -
mkdir -p "$RUNNER_TEMP/no-mistakes"
tar -xzf "$RUNNER_TEMP/$FILE" -C "$RUNNER_TEMP/no-mistakes"
echo "$RUNNER_TEMP/no-mistakes" >> "$GITHUB_PATH"
