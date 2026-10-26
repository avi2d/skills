import { Config, Effect, Option, type FileSystem } from "effect";
import { FileFailure, UnloadableBundle } from "../platform/failures";
import { attempt, unlessAbsent } from "../platform/files";

// Parallel test runners share one tree, so each test process takes its own
// generated output. The preload names it; anything else is rejected.
export const DEFAULT_GENERATED_ROOT = "generated";

export const generatedRoot = (override: string | undefined): string =>
  override !== undefined && /^generated-\d+$/.test(override) ? override : DEFAULT_GENERATED_ROOT;

export const readGeneratedRoot = Config.String("SKILLS_GENERATED_ROOT").pipe(
  Config.withDefault(DEFAULT_GENERATED_ROOT),
  Config.map(generatedRoot),
  Effect.mapError((cause) => new FileFailure({ path: "$SKILLS_GENERATED_ROOT", message: cause.message })),
);

export const ENTRY = "index.ts";

export const INDEX = "dispatch.json";

export const KIT_COMMENTS = "@avi2dg/checks/scripts/comment-matchers.ts";

export const KIT_PROSE = "@avi2dg/checks/scripts/prose-matchers.ts";

export type Bundle = {
  files: Record<string, string>;
  dir: string;
  externals?: readonly string[];
};

const CORE_FILES = {
  "src/dispatcher/dispatch.ts": "dispatch.ts",
  "src/dispatcher/dispatch-log.ts": "dispatch-log.ts",
  "src/dispatcher/model-scope.ts": "model-scope.ts",
  "src/dispatcher/verdict.ts": "verdict.ts",
  "src/dispatcher/forbid.ts": "forbid.ts",
  [KIT_COMMENTS]: "comments.ts",
  [KIT_PROSE]: "prose.ts",
  "src/dispatcher/glob.ts": "glob.ts",
  "src/dispatcher/project.ts": "project.ts",
  "src/dispatcher/repo-walk.ts": "repo-walk.ts",
  "src/dispatcher/run-state.ts": "run-state.ts",
  "src/dispatcher/gate.ts": "gate.ts",
  "src/dispatcher/gate-config.ts": "gate-config.ts",
  "src/dispatcher/read-index.ts": "read-index.ts",
  "src/dispatcher/job-queue.ts": "job-queue.ts",
  "src/dispatcher/shell-words.ts": "shell-words.ts",
};

const HOOK_FILES = {
  ...CORE_FILES,
  "src/dispatcher/hook-harness.ts": "hook-harness.ts",
  "src/dispatcher/transcript.ts": "transcript.ts",
};

export const PI_BUNDLE: Bundle = {
  dir: "pi/extension",
  files: {
    "src/dispatcher/pi-dispatcher.ts": ENTRY,
    ...CORE_FILES,
  },
  externals: ["@earendil-works/pi-coding-agent"],
};

export const CLAUDE_BUNDLE: Bundle = {
  dir: "claude-code/dispatcher",
  files: {
    "src/dispatcher/claude-dispatcher.ts": ENTRY,
    ...HOOK_FILES,
  },
};

export const CODEX_BUNDLE: Bundle = {
  dir: "codex/dispatcher",
  files: {
    "src/dispatcher/codex-dispatcher.ts": ENTRY,
    ...HOOK_FILES,
  },
};

function imported(source: string): string[] {
  return new Bun.Transpiler({ loader: "ts" })
    .scanImports(source)
    .filter((found) => found.kind === "import-statement" || found.kind === "dynamic-import")
    .map((found) => found.path);
}

export function runtimeImports(source: string): string[] {
  return imported(source).filter((path) => path.startsWith("."));
}

export function packageImports(source: string): string[] {
  return imported(source).filter((path) => !path.startsWith(".") && !path.startsWith("node:"));
}

type Source = { name: string; text: string; bytes: Uint8Array };

export const sourcePath = (from: string, repo: string): string =>
  from.startsWith("@") ? new URL(import.meta.resolve(from)).pathname : `${repo}${from}`;

const readSources = Effect.fnUntraced(function* (
  spec: Bundle,
  root: string,
  repo: string,
): Effect.fn.Return<Map<string, Source>, UnloadableBundle | FileFailure, FileSystem.FileSystem> {
  const sources = new Map<string, Source>();
  for (const [from, name] of Object.entries(spec.files)) {
    const path = yield* Effect.try({
      try: () => sourcePath(from, repo),
      catch: () =>
        new UnloadableBundle({
          message: `the ${root} bundle names ${from} (as ${name}), and no installed package resolves it`,
        }),
    });
    const bytes = yield* attempt(from, (fs) => fs.readFile(path)).pipe(unlessAbsent);
    if (Option.isNone(bytes)) {
      return yield* new UnloadableBundle({
        message: `the ${root} bundle names ${from} (as ${name}), and there is no such file`,
      });
    }
    sources.set(from, { name, text: new TextDecoder().decode(bytes.value), bytes: bytes.value });
  }
  return sources;
});

function unheldImport(from: string, text: string, held: ReadonlySet<string>): string | undefined {
  for (const specifier of runtimeImports(text)) {
    const segments = specifier.split("/");
    if (segments[0] !== "." || segments.includes("..")) {
      return `${from} imports ${JSON.stringify(specifier)}, which climbs out of the one directory a harness links`;
    }
    const stem = segments.slice(1).join("/");
    if (held.has(stem) || held.has(`${stem}.ts`)) continue;
    const entry = [...from.split("/").slice(0, -1), `${stem}.ts`].join("/");
    return `${from} needs ${JSON.stringify(specifier)} at runtime, and the bundle does not hold it: add ${entry} to its files`;
  }
  return undefined;
}

function unsuppliedPackage(spec: Bundle, root: string, from: string, text: string): string | undefined {
  const external = new Set(spec.externals ?? []);
  const specifier = packageImports(text).find((name) => !external.has(name));
  if (specifier === undefined) return undefined;
  return (
    `${from} imports ${JSON.stringify(specifier)} at runtime, and a linked directory has no node_modules to resolve it from: `
    + `drop it, reach it through a type-only import, or add it to the ${root} bundle's externals if its harness supplies it`
  );
}

export const bundle = Effect.fnUntraced(function* (
  spec: Bundle,
  repo: string,
): Effect.fn.Return<Map<string, Uint8Array>, UnloadableBundle | FileFailure, FileSystem.FileSystem> {
  const root = `${yield* readGeneratedRoot}/${spec.dir}`;
  const sources = yield* readSources(spec, root, repo);
  const held = new Set([...sources.values()].map((bundled) => bundled.name));
  for (const [from, { text }] of sources) {
    const stray = unheldImport(from, text, held);
    if (stray !== undefined) return yield* new UnloadableBundle({ message: stray });
  }
  for (const [from, { text }] of sources) {
    const stray = unsuppliedPackage(spec, root, from, text);
    if (stray !== undefined) return yield* new UnloadableBundle({ message: stray });
  }

  const out = new Map<string, Uint8Array>();
  for (const { name, bytes } of sources.values()) out.set(`${root}/${name}`, bytes);
  return out;
});
