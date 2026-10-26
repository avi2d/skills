import { platform } from "node:os";
import { Effect, Option, type FileSystem } from "effect";
import { loadBodies, type Body, type Harness } from "../bodies/bodies";
import type { IndexedProfile } from "../dispatcher/dispatch";
import type { FileFailure, MalformedBody, MalformedSelection, UncomposableBodies } from "../platform/failures";
import { CLAUDE_BUNDLE, CODEX_BUNDLE, INDEX, PI_BUNDLE, bundle, readGeneratedRoot, type Bundle } from "./bundle";
import { indexBytes, indexFor } from "./dispatch-index";
import { attempt, filesUnder, unlessAbsent } from "../platform/files";
import { consultable, hubUnder, hubs, type HubOutcome } from "./hub";
import { dormantRules, loadSelection, profilesOf, selected } from "../bodies/selection";
import { main } from "../platform/platform";
import { machineDrift, writeMachineFiles } from "./machine-files";
import { machineOn } from "./machine";
import { noMistakesConfigOf, noMistakesConfigUnder, noMistakesYaml, readHome } from "./no-mistakes-config";

export const DISPATCHERS: { harness: Harness; bundle: Bundle }[] = [
  { harness: "pi", bundle: PI_BUNDLE },
  { harness: "claude-code", bundle: CLAUDE_BUNDLE },
  { harness: "codex", bundle: CODEX_BUNDLE },
];

export const active = Effect.fnUntraced(function* (
  repo: string,
): Effect.fn.Return<
  { bodies: Body[]; profiles: IndexedProfile[]; dormant: Body[] },
  MalformedBody | MalformedSelection | UncomposableBodies | FileFailure,
  FileSystem.FileSystem
> {
  const bodies = yield* loadBodies(repo);
  yield* consultable(bodies);
  const selection = yield* loadSelection(repo);
  const chosen = selected(bodies, selection);
  return {
    bodies: chosen,
    profiles: yield* profilesOf(bodies, selection),
    dormant: dormantRules(bodies, chosen),
  };
});

export const emitted = Effect.fnUntraced(function* (
  repo: string,
  bodies: readonly Body[],
  profiles: readonly IndexedProfile[] = [],
  dormant: readonly Body[] = [],
) {
  const root = yield* readGeneratedRoot;
  const out = new Map<string, Uint8Array>();
  for (const { harness, bundle: spec } of DISPATCHERS) {
    for (const [dest, bytes] of yield* bundle(spec, repo)) out.set(dest, bytes);
    out.set(`${root}/${spec.dir}/${INDEX}`, indexBytes(yield* indexFor(harness, bodies, profiles, dormant)));
  }
  const noMistakes = yield* noMistakesYaml(noMistakesConfigOf(machineOn(platform()), yield* readHome));
  out.set(noMistakesConfigUnder(root), new TextEncoder().encode(noMistakes));
  return out;
});

export const generated = Effect.fnUntraced(function* (repo: string) {
  const { bodies, profiles, dormant } = yield* active(repo);
  return yield* emitted(repo, bodies, profiles, dormant);
});

export const drift = Effect.fnUntraced(function* (
  repo: string,
  files: ReadonlyMap<string, Uint8Array>,
): Effect.fn.Return<string[], FileFailure, FileSystem.FileSystem> {
  const out: string[] = [];
  for (const [dest, wanted] of files) {
    const bytes = yield* attempt(dest, (fs) => fs.readFile(`${repo}${dest}`)).pipe(unlessAbsent);
    if (Option.isNone(bytes)) out.push(`${dest} is missing`);
    else if (bytes.value.length !== wanted.length || !bytes.value.every((b, i) => b === wanted[i])) out.push(`${dest} differs`);
  }
  const root = yield* readGeneratedRoot;
  const onDisk = yield* filesUnder(`${repo}${root}`).pipe(unlessAbsent);
  for (const rel of Option.getOrElse(onDisk, (): string[] => [])) {
    const path = `${root}/${rel}`;
    if (path.startsWith(`${hubUnder(root)}/`)) continue;
    if (!files.has(path)) out.push(`${path} is not generated`);
  }
  return out.toSorted();
});

export const write = Effect.fnUntraced(function* (
  repo: string,
  files: ReadonlyMap<string, Uint8Array>,
): Effect.fn.Return<number, FileFailure, FileSystem.FileSystem> {
  // The Hub shares this root and is reconciled rather than written, so wiping the whole of it would take
  // a Body another tool installed along with the Dispatchers.
  const root = yield* readGeneratedRoot;
  const entries = yield* attempt(root, (fs) => fs.readDirectory(`${repo}${root}`)).pipe(unlessAbsent);
  for (const entry of Option.getOrElse(entries, (): string[] => [])) {
    const path = `${root}/${entry}`;
    if (path !== hubUnder(root)) yield* attempt(path, (fs) => fs.remove(`${repo}${path}`, { recursive: true, force: true }));
  }
  for (const [dest, bytes] of files) {
    const path = `${repo}${dest}`;
    yield* attempt(dest, (fs) =>
      fs.makeDirectory(path.slice(0, path.lastIndexOf("/")), { recursive: true }).pipe(Effect.andThen(fs.writeFile(path, bytes))));
  }
  return files.size;
});

export const checkout = Effect.fnUntraced(function* (repo: string) {
  const { bodies, profiles, dormant } = yield* active(repo);
  const wrote = yield* write(repo, yield* emitted(repo, bodies, profiles, dormant));
  return { wrote, hubs: yield* hubs(repo, bodies, dormant) };
});

export function tally(root: string, outcomes: readonly HubOutcome[]): string {
  const counted = new Map<string, number>();
  for (const { state } of outcomes) counted.set(state, (counted.get(state) ?? 0) + 1);
  return `${hubUnder(root)}/: ${[...counted].map(([state, count]) => `${count} ${state}`).join(", ")}`;
}

if (import.meta.main) {
  const repo = new URL("../../", import.meta.url).pathname;
  main(
    Effect.gen(function* () {
      const root = yield* readGeneratedRoot;
      if (process.argv.includes("--check")) {
        const problems = [...(yield* drift(repo, yield* generated(repo))), ...(yield* machineDrift(repo))];
        if (problems.length > 0) {
          for (const problem of problems) console.error(problem);
          process.exitCode = 1;
          return;
        }
        console.log(`${root}/ matches the Bodies, and harness/ the machine sources`);
        return;
      }
      const { wrote, hubs: built } = yield* checkout(repo);
      console.log(`wrote ${wrote} files under ${root}/`);
      console.log(tally(root, built));
      console.log(`wrote ${yield* writeMachineFiles(repo)} machine files under harness/`);
    }),
  );
}
