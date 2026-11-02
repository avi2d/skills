#!/bin/sh
# The no-mistakes e2e tests drive the real `no-mistakes doctor`, which the default runner does not have.
set -eu
VERSION="1.104.0+avi2d.32"
case "$(uname -s)-$(uname -m)" in
Linux-x86_64) PLATFORM="linux-amd64" SUM="cde63e0a02972f0046fd3244ee78d9db80425566c318ef8cd9c715abac1f091a" ;;
Linux-aarch64 | Linux-arm64) PLATFORM="linux-arm64" SUM="741bb09a23fc18fa977405fa79be4044941aafe00c2f8ec5f7ed623f293a4740" ;;
Darwin-x86_64) PLATFORM="darwin-amd64" SUM="7b7ab21a5125b0646bb3497f193a4fd9bfbc2bc150b9763b673217883926d284" ;;
Darwin-arm64) PLATFORM="darwin-arm64" SUM="0fa80893f9b99df8caecc629eb5a65cbdb7f22dd00b937ba7cf79f5ca795596d" ;;
*) echo "ci-no-mistakes: no pinned binary for $(uname -s)-$(uname -m)" >&2; exit 1 ;;
esac
FILE="no-mistakes-v$VERSION-$PLATFORM.tar.gz"
curl -fsSLo "$RUNNER_TEMP/$FILE" "https://github.com/avi2d/no-mistakes/releases/download/v$VERSION/$FILE"
echo "$SUM  $RUNNER_TEMP/$FILE" | sha256sum -c -
mkdir -p "$RUNNER_TEMP/no-mistakes"
tar -xzf "$RUNNER_TEMP/$FILE" -C "$RUNNER_TEMP/no-mistakes"
echo "$RUNNER_TEMP/no-mistakes" >> "$GITHUB_PATH"
