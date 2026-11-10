import { Effect, Option, type FileSystem } from "effect";
import type { FileFailure, MalformedMachineConfig } from "../platform/failures";
import { attempt, unlessAbsent } from "../platform/files";
import { crewDispatchJson } from "./crew-dispatch";
import { CREW_DISPATCH_RULES } from "./crew-dispatch-config";
import { FIRSTMATE_PINS } from "./firstmate-pins";

export const CREW_DISPATCH = "harness/firstmate/crew-dispatch.json";

export const machineFiles = Effect.fnUntraced(function* (): Effect.fn.Return<ReadonlyMap<string, string>, MalformedMachineConfig> {
  const files = new Map<string, string>([[CREW_DISPATCH, yield* crewDispatchJson(CREW_DISPATCH_RULES)]]);
  for (const [rel, text] of Object.entries(FIRSTMATE_PINS)) files.set(rel, text);
  return files;
});

export const writeMachineFiles = Effect.fnUntraced(function* (
  repo: string,
): Effect.fn.Return<number, FileFailure | MalformedMachineConfig, FileSystem.FileSystem> {
  const files = yield* machineFiles();
  for (const [rel, text] of files) {
    const path = `${repo}${rel}`;
    yield* attempt(rel, (fs) =>
      fs.makeDirectory(path.slice(0, path.lastIndexOf("/")), { recursive: true }).pipe(Effect.andThen(fs.writeFileString(path, text))));
  }
  return files.size;
});

export const machineDrift = Effect.fnUntraced(function* (
  repo: string,
): Effect.fn.Return<string[], FileFailure | MalformedMachineConfig, FileSystem.FileSystem> {
  const out: string[] = [];
  for (const [rel, wanted] of yield* machineFiles()) {
    const held = yield* attempt(rel, (fs) => fs.readFileString(`${repo}${rel}`)).pipe(unlessAbsent);
    if (Option.isNone(held)) out.push(`${rel} is missing`);
    else if (held.value !== wanted) out.push(`${rel} differs from what \`bun run generate\` writes`);
  }
  return out;
});
