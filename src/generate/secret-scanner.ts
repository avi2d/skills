import * as BunCrypto from "@effect/platform-bun/BunCrypto";
import { Effect, type FileSystem } from "effect";
import { cacheRoot } from "../../node_modules/@avi2dg/checks/src/dependencies/cache-root.ts";
import { pinnedGitleaks } from "../../node_modules/@avi2dg/checks/src/delivery/gitleaks.ts";
import { SCANNER_CONFIG, SCANNER_PIN } from "../dispatcher/redact";
import { UnloadableBundle, type FileFailure } from "../platform/failures";
import { attempt } from "../platform/files";

// The kit exports none of its gitleaks files, so they are reached beside a file it does export.
const KIT_ANCHOR = "@avi2dg/checks/core/git.ts";

const KIT_PIN = /^const GITLEAKS_VERSION = "([^"]+)";$/m;

const kitDelivery = Effect.try({
  try: () => new URL("../delivery/", import.meta.resolve(KIT_ANCHOR)).pathname,
  catch: () => new UnloadableBundle({ message: `no installed package resolves ${KIT_ANCHOR}, so the secret scan has no rules` }),
});

export const installScanner = Effect.gen(function* () {
  return yield* pinnedGitleaks(yield* cacheRoot());
}).pipe(Effect.provide(BunCrypto.layer));

export const scannerFiles = Effect.fnUntraced(function* (): Effect.fn.Return<
  Map<string, Uint8Array>,
  UnloadableBundle | FileFailure,
  FileSystem.FileSystem
> {
  const delivery = yield* kitDelivery;
  const config = yield* attempt(`${delivery}gitleaks.toml`, (fs) => fs.readFile(`${delivery}gitleaks.toml`));
  const pinned = yield* attempt(`${delivery}gitleaks.ts`, (fs) => fs.readFileString(`${delivery}gitleaks.ts`));
  const [, version] = KIT_PIN.exec(pinned) ?? [];
  if (version === undefined) {
    return yield* new UnloadableBundle({ message: `${delivery}gitleaks.ts pins no gitleaks version this generator can read` });
  }
  return new Map([
    [SCANNER_CONFIG, config],
    [SCANNER_PIN, new TextEncoder().encode(`${JSON.stringify({ gitleaks: version })}\n`)],
  ]);
});
