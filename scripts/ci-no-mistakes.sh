#!/bin/sh
# The no-mistakes e2e tests drive the real `no-mistakes doctor`, which the default runner does not have.
set -eu
VERSION="1.99.1+avi2d.24"
case "$(uname -s)-$(uname -m)" in
Linux-x86_64) PLATFORM="linux-amd64" SUM="0bd73843c3596b4bde0f6323e10ed13d7741245e6e7a729d5ba87c01fdc90247" ;;
Linux-aarch64 | Linux-arm64) PLATFORM="linux-arm64" SUM="cd380a9231235afca159a1b60795d18e88f57c0e90911c9027bdc4d33e70d093" ;;
Darwin-x86_64) PLATFORM="darwin-amd64" SUM="0f0569da12ebf595bd4f08f8051acde60bac0f856fd0ab1e88c6fd1d19ba2d77" ;;
Darwin-arm64) PLATFORM="darwin-arm64" SUM="40a56cf763a267f4d3f19d4e4119e24034e9b8189ba1209b875ac182bac4416d" ;;
*) echo "ci-no-mistakes: no pinned binary for $(uname -s)-$(uname -m)" >&2; exit 1 ;;
esac
FILE="no-mistakes-v$VERSION-$PLATFORM.tar.gz"
curl -fsSLo "$RUNNER_TEMP/$FILE" "https://github.com/avi2d/no-mistakes/releases/download/v$VERSION/$FILE"
echo "$SUM  $RUNNER_TEMP/$FILE" | sha256sum -c -
mkdir -p "$RUNNER_TEMP/no-mistakes"
tar -xzf "$RUNNER_TEMP/$FILE" -C "$RUNNER_TEMP/no-mistakes"
echo "$RUNNER_TEMP/no-mistakes" >> "$GITHUB_PATH"
