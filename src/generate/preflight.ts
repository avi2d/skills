import { Config, Duration, Effect, Option, type FileSystem } from "effect";
import { ChildProcess, type ChildProcessSpawner } from "effect/process";
import { FileFailure } from "../platform/failures";
import { attempt, outputOf, unlessAbsent } from "../platform/files";

type Pi = { readonly path: string; readonly version: string };

export type PiLoad =
  | { readonly state: "loaded"; readonly pi: Pi }
  | { readonly state: "no-pi" }
  | { readonly state: "refused"; readonly pi: Pi; readonly reasons: readonly string[] };

const LOAD_LIMIT = Duration.seconds(60);

const FAILED = "Failed to load extension ";

export const loadFailures = (stderr: string, home: string): string[] =>
  stderr
    .split("\n")
    .filter((line) => line.includes(FAILED))
    .map((line) => line.slice(line.indexOf(FAILED)).replaceAll(`${home}/`, "~/"));

const BIN = "/node_modules/.bin";

// `bun run` puts node_modules/.bin of the checkout and of each directory above it first, where the checkout's pinned pi would answer for the installed one.
export const outsideCheckout = (path: string, repo: string): string =>
  path
    .split(":")
    .filter((entry) => {
      const dir = entry.replace(/\/+$/, "");
      return !dir.endsWith(BIN) || !(repo.startsWith(`${dir.slice(0, -BIN.length)}/`) || dir.startsWith(repo));
    })
    .join(":");

const isExecutable = (path: string): Effect.Effect<boolean, never, FileSystem.FileSystem> =>
  Effect.option(attempt(path, (fs) => fs.stat(path))).pipe(Effect.map(Option.exists((info) => info.type === "File" && (info.mode & 0o111) !== 0)));

// Spawning a bare name would leave which pi ran unknown, so the lookup is done here and the path it finds is the one run and reported.
const located = Effect.fnUntraced(function* (pi: string, path: string): Effect.fn.Return<Option.Option<string>, never, FileSystem.FileSystem> {
  const candidates = pi.includes("/") ? [pi] : path.split(":").flatMap((dir) => (dir === "" ? [] : [`${dir}/${pi}`]));
  for (const candidate of candidates) if (yield* isExecutable(candidate)) return Option.some(candidate);
  return Option.none();
});

const UNKNOWN_VERSION = "of unknown version";

const versionOf = (command: ChildProcess.Command): Effect.Effect<string, never, ChildProcessSpawner.ChildProcessSpawner> =>
  outputOf(command).pipe(
    Effect.timeoutOption(LOAD_LIMIT),
    Effect.map(Option.match({ onNone: () => UNKNOWN_VERSION, onSome: ({ code, stdout }) => (code === 0 && stdout.trim() !== "" ? stdout.trim() : UNKNOWN_VERSION) })),
    Effect.orElseSucceed(() => UNKNOWN_VERSION),
  );

const markingExtension = (marker: string): string =>
  `import { writeFileSync } from "node:fs";\nexport default function () {\n  writeFileSync(${JSON.stringify(marker)}, "");\n}\n`;

// `--print` with no prompt loads every extension and exits before any model is asked, so no credential is needed.
// The environment is replaced rather than extended, so no API key or PI_CODING_AGENT_DIR reaches pi.
export const piLoads = Effect.fnUntraced(function* (
  repo: string,
  pi: string,
  root: string,
  home: string,
): Effect.fn.Return<PiLoad, FileFailure, FileSystem.FileSystem | ChildProcessSpawner.ChildProcessSpawner> {
  const path = yield* Config.String("PATH").pipe(
    Config.withDefault(""),
    Effect.map((inherited) => outsideCheckout(inherited, repo)),
    Effect.mapError((cause) => new FileFailure({ path: "$PATH", message: cause.message })),
  );
  const found = yield* located(pi, path);
  if (Option.isNone(found)) return { state: "no-pi" };
  const tmp = `${root}/tmp`;
  const marker = `${root}/loaded`;
  const extension = `${root}/loaded.ts`;
  yield* attempt(tmp, (fs) => fs.makeDirectory(tmp, { recursive: true }));
  yield* attempt(extension, (fs) => fs.writeFileString(extension, markingExtension(marker)));
  const run = (args: readonly string[]) =>
    ChildProcess.make(found.value, args, {
      cwd: home,
      env: { HOME: home, PATH: path, TMPDIR: tmp, NO_COLOR: "1" },
      stdin: "ignore",
      forceKillAfter: "5 seconds",
    });
  const checked: Pi = { path: found.value, version: yield* versionOf(run(["--version"])) };
  const refused = (...reasons: string[]): PiLoad => ({ state: "refused", pi: checked, reasons });
  const ran = yield* outputOf(run(["--offline", "--print", "--no-session", "--no-approve", "--extension", extension])).pipe(
    Effect.timeoutOption(LOAD_LIMIT),
    Effect.mapError((error) => new FileFailure({ path: found.value, message: `running pi: ${error.message}` })),
  );
  if (Option.isNone(ran)) return refused(`pi did not finish loading its extensions within ${Duration.format(LOAD_LIMIT)}`);
  const { code, stderr } = ran.value;
  const failures = loadFailures(stderr, home);
  if (failures.length > 0) return refused(...failures);
  if (code !== 0) return refused(`pi exited ${code}: ${stderr.trim()}`);
  const marked = yield* unlessAbsent(attempt(marker, (fs) => fs.stat(marker)));
  if (Option.isNone(marked)) return refused("pi exited without loading any extension, so none was checked");
  return { state: "loaded", pi: checked };
});
