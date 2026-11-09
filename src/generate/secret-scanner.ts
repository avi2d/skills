import * as BunCrypto from "@effect/platform-bun/BunCrypto";
import { Effect, type FileSystem } from "effect";
import { cacheRoot } from "@avi2dg/checks/dependencies/cache-root.ts";
import { pinnedGitleaks } from "@avi2dg/checks/delivery/gitleaks.ts";
import { SCANNER_CONFIG, SCANNER_PIN } from "../dispatcher/redact";
import { UnloadableBundle, type FileFailure } from "../platform/failures";
import { attempt } from "../platform/files";

const KIT_CONFIG = "@avi2dg/checks/delivery/gitleaks.toml";

const KIT_PIN_SOURCE = "@avi2dg/checks/delivery/gitleaks.ts";

const KIT_PIN = /^const GITLEAKS_VERSION = "([^"]+)";$/m;

const kitFiles = Effect.try({
  try: () => ({
    config: new URL(import.meta.resolve(KIT_CONFIG)).pathname,
    source: new URL(import.meta.resolve(KIT_PIN_SOURCE)).pathname,
  }),
  catch: () =>
    new UnloadableBundle({ message: `no installed package resolves ${KIT_CONFIG} or ${KIT_PIN_SOURCE}, so the secret scan has no rules` }),
});

export const installScanner = Effect.gen(function* () {
  return yield* pinnedGitleaks(yield* cacheRoot());
}).pipe(Effect.provide(BunCrypto.layer));

export const scannerFiles = Effect.fnUntraced(function* (): Effect.fn.Return<
  Map<string, Uint8Array>,
  UnloadableBundle | FileFailure,
  FileSystem.FileSystem
> {
  const { config, source } = yield* kitFiles;
  const rules = yield* attempt(config, (fs) => fs.readFile(config));
  const pinned = yield* attempt(source, (fs) => fs.readFileString(source));
  const [, version] = KIT_PIN.exec(pinned) ?? [];
  if (version === undefined) {
    return yield* new UnloadableBundle({ message: `${source} pins no gitleaks version this generator can read` });
  }
  return new Map([
    [SCANNER_CONFIG, rules],
    [SCANNER_PIN, new TextEncoder().encode(`${JSON.stringify({ gitleaks: version })}\n`)],
  ]);
});
