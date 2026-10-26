import { Effect, FileSystem, Option, Stream, type PlatformError } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/process";
import { ABSENT, fileFailure, type FileFailure } from "./failures";

export const MACOS_INDEX = ".DS_Store";

const NOT_A_LINK = "EINVAL";

// A PlatformError's cause is the system's own error, whose code and message are what a FileFailure keeps.
export const attempt = <A>(
  path: string,
  use: (fs: FileSystem.FileSystem) => Effect.Effect<A, PlatformError.PlatformError>,
): Effect.Effect<A, FileFailure, FileSystem.FileSystem> =>
  FileSystem.FileSystem.use(use).pipe(Effect.mapError((error) => fileFailure(path, error.cause ?? error)));

export type Ran = { readonly code: number; readonly stdout: string; readonly stderr: string };

export const outputOf = (command: ChildProcess.Command): Effect.Effect<Ran, PlatformError.PlatformError, ChildProcessSpawner.ChildProcessSpawner> =>
  Effect.scoped(
    Effect.gen(function* () {
      const handle = yield* (yield* ChildProcessSpawner.ChildProcessSpawner).spawn(command);
      const [stdout, stderr, code] = yield* Effect.all(
        [Stream.mkString(Stream.decodeText(handle.stdout)), Stream.mkString(Stream.decodeText(handle.stderr)), handle.exitCode],
        { concurrency: "unbounded" },
      );
      return { code, stdout, stderr };
    }),
  );

const unless = (code: string) => <A, R>(effect: Effect.Effect<A, FileFailure, R>): Effect.Effect<Option.Option<A>, FileFailure, R> =>
  effect.pipe(
    Effect.asSome,
    Effect.catchTag("FileFailure", (failure) => (failure.code === code ? Effect.succeedNone : Effect.fail(failure))),
  );

export const unlessAbsent = unless(ABSENT);

export type Entry = { readonly kind: "link"; readonly points: string } | { readonly kind: "directory" | "file" | "other" };

// FileSystem's stat follows a link, so only a readlink that succeeds tells a link from what it points at.
export const entryAt = Effect.fnUntraced(function* (path: string): Effect.fn.Return<Entry, FileFailure, FileSystem.FileSystem> {
  const points = yield* attempt(path, (fs) => fs.readLink(path)).pipe(unless(NOT_A_LINK));
  if (Option.isSome(points)) return { kind: "link", points: points.value };
  const { type } = yield* attempt(path, (fs) => fs.stat(path));
  return { kind: type === "Directory" ? "directory" : type === "File" ? "file" : "other" };
});

export const entriesOf = Effect.fnUntraced(function* (
  dir: string,
): Effect.fn.Return<{ name: string; entry: Entry }[], FileFailure, FileSystem.FileSystem> {
  const out: { name: string; entry: Entry }[] = [];
  for (const name of yield* attempt(dir, (fs) => fs.readDirectory(dir))) out.push({ name, entry: yield* entryAt(`${dir}/${name}`) });
  return out.toSorted((a, b) => a.name.localeCompare(b.name));
});

const walk = Effect.fnUntraced(function* (
  root: string,
  rel: string,
): Effect.fn.Return<string[], FileFailure, FileSystem.FileSystem> {
  const out: string[] = [];
  for (const { name, entry } of yield* entriesOf(rel === "" ? root : `${root}/${rel}`)) {
    const path = rel === "" ? name : `${rel}/${name}`;
    if (entry.kind === "directory") out.push(...(yield* walk(root, path)));
    else if (entry.kind === "file" && name !== MACOS_INDEX) out.push(path);
  }
  return out;
});

export const filesUnder = (dir: string): Effect.Effect<string[], FileFailure, FileSystem.FileSystem> =>
  walk(dir, "").pipe(Effect.map((files) => files.toSorted()));
