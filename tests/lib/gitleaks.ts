import { mkdirSync, symlinkSync } from "node:fs";
import { join, resolve } from "node:path";
import { installScanner } from "../../src/generate/secret-scanner";
import { valueOf } from "./effect";

let installing: Promise<string> | undefined;

export const installedScanner = (): Promise<string> => (installing ??= valueOf(installScanner));

// A Dispatcher looks for gitleaks under its $HOME, which a test points at a directory of its own.
export async function lendScanner(home: string): Promise<void> {
  const cache = resolve(await installedScanner(), "../../../..");
  mkdirSync(join(home, ".cache"), { recursive: true });
  symlinkSync(cache, join(home, ".cache", "avi2dg-checks"), "dir");
}
