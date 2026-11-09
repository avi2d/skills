import { platform, tmpdir } from "node:os";
import { Config, Context, Effect, Equal, FileSystem, Option, Schema } from "effect";
import { ChildProcess, type ChildProcessSpawner } from "effect/process";
import { DEFAULT_GENERATED_ROOT, readGeneratedRoot } from "./bundle";
import { FileFailure, fileFailure } from "../platform/failures";
import { attempt, entryAt, outputOf, unlessAbsent } from "../platform/files";
import { checkout, tally } from "./generate";
import { hubUnder } from "./hub";
import { noMistakesConfigUnder } from "./no-mistakes-config";
import { piLoads, type PiLoad } from "./preflight";
import { installScanner } from "./secret-scanner";
import { main } from "../platform/platform";
import { UserConfigSource } from "./user-config";

// Bun's userInfo().homedir reads $HOME, so only the passwd record names the home a temporary $HOME cannot stand in for.
const unreadable = (detail: string) => new FileFailure({ path: "passwd", message: `cannot tell the account's own home: ${detail}` });

const passwdHome: Effect.Effect<string, FileFailure, ChildProcessSpawner.ChildProcessSpawner> = Effect.gen(function* () {
  const uid = process.getuid?.();
  if (uid === undefined) return yield* unreadable("this platform has no user id");
  const [command, args] = platform() === "darwin" ? ["id", ["-P", String(uid)]] : ["getent", ["passwd", String(uid)]];
  const ran = yield* outputOf(ChildProcess.make(command, args)).pipe(Effect.mapError((error) => unreadable(error.message)));
  // A passwd record ends in home:shell, in both the Linux and the BSD layout.
  const home = ran.stdout.trim().split(":").at(-2);
  if (ran.code !== 0 || !home) return yield* unreadable(`\`${command} ${args.join(" ")}\` printed no record`);
  return home;
});

export const AccountHome = Context.Reference("skills/AccountHome", { defaultValue: () => passwdHome });

export type LinkMap = Readonly<Record<string, string>>;

const CLAUDE_CODE_SETTINGS = "harness/claude-code/settings.json";

export const linksUnder = (root: string): LinkMap => ({
  ".claude/settings.json": CLAUDE_CODE_SETTINGS,
  ".codex/hooks.json": "harness/codex/hooks.json",
  ".pi/agent/claude-bridge.json": "harness/pi/claude-bridge.json",
  ".pi/agent/keybindings.json": "harness/pi/keybindings.json",
  // Credentials in that file go in as `$ENV_VAR` sources: a key written there is a key published.
  ".pi/agent/web-search.json": "harness/pi/web-search.json",
  ".pi/agent/extensions/session-name.ts": "harness/pi/extensions/session-name.ts",
  ".pi/agent/extensions/qwen-tool-calls.ts": "harness/pi/extensions/qwen-tool-calls.ts",
  ".pi/agent/extensions/web-tools.ts": "harness/pi/extensions/web-tools.ts",
  ".pi/agent/extensions/herdr-model-label.ts": "harness/pi/extensions/herdr-model-label.ts",
  ".pi/agent/extensions/transcript-style": "harness/pi/extensions/transcript-style",
  ".pi/agent/extensions/copy-selection.ts": "harness/pi/extensions/copy-selection.ts",
  ".pi/agent/extensions/haiku-compaction.ts": "harness/pi/extensions/haiku-compaction.ts",
  ".pi/agent/extensions/haiku-compaction": "harness/pi/extensions/haiku-compaction",
  ".agents/skills": hubUnder(root),
  ".pi/agent/extensions/skills-dispatch": `${root}/pi/extension`,
  ".claude/skills": hubUnder(root),
  ".claude/skills-dispatch": `${root}/claude-code/dispatcher`,
  ".codex/skills-dispatch": `${root}/codex/dispatcher`,
  ".no-mistakes/config.yaml": noMistakesConfigUnder(root),
  ".orc/orchestrator.md": "harness/orc/orchestrator.md",
});

export const LINKS = linksUnder(DEFAULT_GENERATED_ROOT);

export type Merge = { readonly from: string; readonly ownKeys: readonly string[] };

// Pi writes through a link, and layers no second settings file over this one, so it gets a file of its own.
export const MERGED: Readonly<Record<string, Merge>> = {
  ".pi/agent/settings.json": { from: "harness/pi/settings.json", ownKeys: ["deviceId", "lastChangelogVersion", "trackingId"] },
};

export type Graft = { readonly from: string; readonly keys: readonly string[] };

export type GraftMap = Readonly<Record<string, Graft>>;

export const CLAUDE_CONFIG_GRAFT: Graft = { from: CLAUDE_CODE_SETTINGS, keys: ["hooks"] };

export const claudeSettingsIn = (dir: string): string => `${dir}/settings.json`;

// Claude Code writes an account's own keys, such as its statusLine, into this file, so a link would carry them into the checkout.
export const graftsInto = (claudeConfigDirs: readonly string[]): GraftMap =>
  Object.fromEntries(claudeConfigDirs.map((dir) => [claudeSettingsIn(dir), CLAUDE_CONFIG_GRAFT]));

export const RETIRED: readonly string[] = [
  ".pi/agent/effect-codemode",
  ".claude/agents",
  ".claude/CLAUDE.md",
  ".codex/AGENTS.md",
  ".config/opencode/AGENTS.md",
  ".pi/agent/AGENTS.md",
  ".pi/agent/extensions/compaction-points.ts",
  ".pi/agent/extensions/transcript-style.ts",
];

export const REPO = new URL("../../", import.meta.url).pathname;

type LinkState = "kept" | "linked" | "relinked" | "refused" | "retired";

export type Replaced = { readonly key: string; readonly was: unknown };

export type Outcome =
  | { readonly home: string; readonly state: LinkState }
  | { readonly home: string; readonly state: "written"; readonly replaced: readonly Replaced[] }
  | { readonly home: string; readonly state: "restored"; readonly from: string };

const temporary = (home: string): boolean => {
  const base = tmpdir().replace(/\/+$/, "");
  return home === base || home.startsWith(`${base}/`);
};

const resolved = (path: string): Effect.Effect<string, FileFailure, FileSystem.FileSystem> =>
  unlessAbsent(attempt(path, (fs) => fs.realPath(path))).pipe(Effect.map(Option.getOrElse(() => path.replace(/\/+$/, ""))));

const git = (repo: string, args: readonly string[]) =>
  Effect.option(outputOf(ChildProcess.make("git", args, { cwd: repo }))).pipe(Effect.map(Option.filter((ran) => ran.code === 0)));

// `git worktree list --porcelain` prints the main worktree's record first, and marks it `bare` when it has no work tree.
const mainCheckoutOf = (repo: string) =>
  git(repo, ["worktree", "list", "--porcelain"]).pipe(
    Effect.map(
      Option.flatMap((ran) => {
        const [first = "", ...rest] = (ran.stdout.split("\n\n")[0] ?? "").split("\n");
        return first.startsWith("worktree ") && !rest.includes("bare") ? Option.some(first.slice("worktree ".length)) : Option.none();
      }),
    ),
  );

const refuseAccountHomeFromWorktree = Effect.fnUntraced(function* (
  repo: string,
  home: string,
): Effect.fn.Return<void, FileFailure, FileSystem.FileSystem | ChildProcessSpawner.ChildProcessSpawner> {
  if ((yield* resolved(home)) !== (yield* resolved(yield* yield* AccountHome))) return;
  const refused = (why: string) =>
    new FileFailure({
      path: home,
      message: `refusing to link the account's own home \`${home}\` from \`${repo}\`, ${why}, or set HOME to a temporary directory`,
    });
  const notCheckedOut = refused("which git does not check out; clone the repository and run it from the clone");
  const dirs = yield* git(repo, ["rev-parse", "--absolute-git-dir", "--git-common-dir", "--show-toplevel"]);
  const [gitDir, commonDir, topLevel] = Option.match(dirs, { onNone: () => [], onSome: (ran) => ran.stdout.trim().split("\n") });
  if (gitDir === undefined || commonDir === undefined || topLevel === undefined) return yield* notCheckedOut;
  // A linked worktree keeps its own git dir apart from the common dir every worktree of the repository shares.
  const sharedDir = commonDir.startsWith("/") ? commonDir : `${repo.replace(/\/+$/, "")}/${commonDir}`;
  if ((yield* resolved(gitDir)) !== (yield* resolved(sharedDir))) {
    return yield* refused(
      Option.match(yield* mainCheckoutOf(repo), {
        onNone: () => "a linked worktree with no main checkout; clone the repository and run it from the clone",
        onSome: (checkoutPath) => `a linked worktree; run it from the main checkout \`${checkoutPath}\``,
      }),
    );
  }
  // git answers for the repository of an enclosing directory, so a copy inside another checkout passes the check above.
  if ((yield* resolved(topLevel)) !== (yield* resolved(repo))) return yield* notCheckedOut;
});

const linked = Effect.fnUntraced(function* (dest: string, to: string): Effect.fn.Return<LinkState, FileFailure, FileSystem.FileSystem> {
  const found = Option.getOrUndefined(yield* unlessAbsent(entryAt(dest)));
  if (found && found.kind !== "link") return "refused";
  if (found && found.points === to) return "kept";
  const parent = dest.slice(0, dest.lastIndexOf("/"));
  yield* attempt(parent, (fs) => fs.makeDirectory(parent, { recursive: true }));
  if (found) yield* attempt(dest, (fs) => fs.remove(dest));
  yield* attempt(dest, (fs) => fs.symlink(to, dest));
  return found ? "relinked" : "linked";
});

const retired = Effect.fnUntraced(function* (
  repo: string,
  dest: string,
): Effect.fn.Return<LinkState | undefined, FileFailure, FileSystem.FileSystem> {
  const found = Option.getOrUndefined(yield* unlessAbsent(entryAt(dest)));
  if (!found) return undefined;
  if (found.kind !== "link" || !found.points.startsWith(repo)) return "kept";
  yield* attempt(dest, (fs) => fs.remove(dest));
  return "retired";
});

type Settings = Readonly<Record<string, unknown>>;

const decodeSettings = Schema.decodeUnknownEffect(Schema.fromJsonString(Schema.Record(Schema.String, Schema.Unknown)));

const settingsIn = (path: string, text: string): Effect.Effect<Settings, FileFailure> =>
  decodeSettings(text).pipe(Effect.mapError((cause) => new FileFailure({ path, message: `${path} holds no JSON object of settings: ${cause.message}` })));

const settingsAt = Effect.fnUntraced(function* (path: string): Effect.fn.Return<Option.Option<Settings>, FileFailure, FileSystem.FileSystem> {
  const text = yield* unlessAbsent(attempt(path, (fs) => fs.readFileString(path)));
  return Option.isSome(text) ? Option.some(yield* settingsIn(path, text.value)) : Option.none();
});

const keysOf = (settings: Settings, keep: (key: string) => boolean): Settings =>
  Object.fromEntries(Object.entries(settings).filter(([key]) => keep(key)));

const written = Effect.fnUntraced(function* (
  repo: string,
  home: string,
  rel: string,
  from: string,
  isOwn: (key: string) => boolean,
): Effect.fn.Return<Outcome, FileFailure, FileSystem.FileSystem> {
  const dest = `${home}/${rel}`;
  const found = Option.getOrUndefined(yield* unlessAbsent(entryAt(dest)));
  const live = Option.getOrElse(yield* settingsAt(dest), (): Settings => ({}));
  const source = `${repo}${from}`;
  const tracked = keysOf(yield* settingsIn(source, yield* attempt(source, (fs) => fs.readFileString(source))), (key) => !isOwn(key));
  const wanted = { ...tracked, ...keysOf(live, isOwn) };
  if (found?.kind === "file" && Equal.equals(live, wanted)) return { home: rel, state: "kept" };
  const replaced = Object.entries(keysOf(live, (key) => !isOwn(key)))
    .filter(([key, was]) => !Equal.equals(was, tracked[key]))
    .map(([key, was]) => ({ key, was }));
  const parent = dest.slice(0, dest.lastIndexOf("/"));
  yield* attempt(parent, (fs) => fs.makeDirectory(parent, { recursive: true }));
  if (found?.kind === "link") yield* attempt(dest, (fs) => fs.remove(dest));
  yield* attempt(dest, (fs) => fs.writeFileString(dest, JSON.stringify(wanted, null, 2)));
  return { home: rel, state: "written", replaced };
});

const merged = (repo: string, home: string, rel: string, { from, ownKeys }: Merge) => written(repo, home, rel, from, (key) => ownKeys.includes(key));

const grafted = (repo: string, home: string, rel: string, { from, keys }: Graft) => written(repo, home, rel, from, (key) => !keys.includes(key));

const restored = Effect.fnUntraced(function* (
  repo: string,
  rel: string,
  { from, ownKeys }: Merge,
): Effect.fn.Return<Outcome | undefined, FileFailure, FileSystem.FileSystem | ChildProcessSpawner.ChildProcessSpawner> {
  const committed = yield* git(repo, ["show", `HEAD:./${from}`]);
  const source = `${repo}${from}`;
  const working = yield* settingsAt(source);
  if (Option.isNone(committed) || Option.isNone(working)) return undefined;
  const atHead = yield* settingsIn(`${source} at HEAD`, committed.value.stdout);
  const notOwn = (key: string) => !ownKeys.includes(key);
  if (Equal.equals(working.value, atHead) || !Equal.equals(keysOf(working.value, notOwn), keysOf(atHead, notOwn))) return undefined;
  const indexAtHead = yield* git(repo, ["diff", "--cached", "--quiet", "--", `./${from}`]);
  if (Option.isNone(indexAtHead)) return undefined;
  const checkedOut = yield* git(repo, ["checkout", "HEAD", "--", `./${from}`]);
  if (Option.isNone(checkedOut)) return yield* new FileFailure({ path: source, message: `${source} holds only keys pi writes itself, and git could not restore it` });
  return { home: rel, state: "restored", from };
});

const placed = Effect.fnUntraced(function* (repo: string, home: string): Effect.fn.Return<Outcome[], FileFailure, FileSystem.FileSystem | ChildProcessSpawner.ChildProcessSpawner> {
  const outcomes: Outcome[] = [];
  // A mutant forcing link's own main block would otherwise point every live link at a sandbox.
  const underTest = yield* Config.String("SKILLS_UNDER_TEST").pipe(
    Config.withDefault(""),
    Effect.mapError((cause) => new FileFailure({ path: "$SKILLS_UNDER_TEST", message: cause.message })),
  );
  if (underTest === "1" && !temporary(home)) {
    return yield* new FileFailure({ path: home, message: `refusing to link into \`${home}\` outside the test's temporary scope` });
  }
  yield* refuseAccountHomeFromWorktree(repo, home);
  const { claudeConfigDirs = [] } = yield* yield* UserConfigSource;
  for (const [rel, target] of Object.entries(linksUnder(yield* readGeneratedRoot))) {
    outcomes.push({ home: rel, state: yield* linked(`${home}/${rel}`, `${repo}${target}`) });
  }
  for (const [rel, merge] of Object.entries(MERGED)) outcomes.push(yield* merged(repo, home, rel, merge));
  for (const [rel, graft] of Object.entries(graftsInto(claudeConfigDirs))) outcomes.push(yield* grafted(repo, home, rel, graft));
  for (const rel of RETIRED) {
    const state = yield* retired(repo, `${home}/${rel}`);
    if (state) outcomes.push({ home: rel, state });
  }
  return outcomes;
});

export const link = Effect.fnUntraced(function* (
  repo: string,
  home: string,
): Effect.fn.Return<Outcome[], FileFailure, FileSystem.FileSystem | ChildProcessSpawner.ChildProcessSpawner> {
  const outcomes = yield* placed(repo, home);
  for (const [rel, merge] of Object.entries(MERGED)) {
    const restore = yield* restored(repo, rel, merge);
    if (restore) outcomes.push(restore);
  }
  return outcomes;
});

export const preflight = (
  repo: string,
  pi: string,
): Effect.Effect<PiLoad, FileFailure, FileSystem.FileSystem | ChildProcessSpawner.ChildProcessSpawner> =>
  Effect.scoped(
    Effect.gen(function* () {
      const root = yield* (yield* FileSystem.FileSystem)
        .makeTempDirectoryScoped({ prefix: "skills-preflight-" })
        .pipe(Effect.mapError((error) => fileFailure("$TMPDIR", error.cause ?? error)));
      const home = `${root}/home`;
      yield* placed(repo, home);
      return yield* piLoads(repo, pi, root, home);
    }),
  );

type Refused = Extract<PiLoad, { readonly state: "refused" }>;

type Linked = Refused | { readonly state: "linked"; readonly load: Exclude<PiLoad, Refused>; readonly outcomes: readonly Outcome[] };

export const install = Effect.fnUntraced(function* (repo: string, home: string, pi: string) {
  yield* refuseAccountHomeFromWorktree(repo, home);
  const { wrote, hubs } = yield* checkout(repo);
  const load = yield* preflight(repo, pi);
  const linking: Linked = load.state === "refused" ? load : { state: "linked", load, outcomes: yield* link(repo, home) };
  return { wrote, hubs, ...linking };
});

if (import.meta.main) {
  main(
    Effect.gen(function* () {
      const home = yield* Config.NonEmptyString("HOME").pipe(
        Effect.mapError(() => new FileFailure({ path: "$HOME", message: "no $HOME to link into" })),
      );
      const installed = yield* install(REPO, home, "pi");
      const root = yield* readGeneratedRoot;
      console.log(`wrote ${installed.wrote} files under ${root}/`);
      console.log(tally(root, installed.hubs));
      console.log();
      if (installed.state === "refused") {
        console.error(`refused: pi ${installed.pi.version} at ${installed.pi.path} could not load what this checkout links, so ${home} keeps the links it had.`);
        for (const reason of installed.reasons) console.error(`  ${reason}`);
        process.exitCode = 1;
        return;
      }
      const { load, outcomes } = installed;
      console.log(`gitleaks at ${yield* installScanner}, which the Dispatchers scan tool output with`);
      console.log(
        load.state === "loaded"
          ? `pi ${load.pi.version} at ${load.pi.path} loaded every extension in a temporary $HOME first`
          : "pi is not on $PATH, so no pi extension was load-checked",
      );
      for (const outcome of outcomes) {
        if (outcome.state === "restored") {
          console.log(`restored ${outcome.from}, which held only keys pi writes itself`);
          continue;
        }
        console.log(`${outcome.state.padEnd(8)} ~/${outcome.home}`);
        if (outcome.state !== "written") continue;
        for (const { key, was } of outcome.replaced) console.log(`         replaced ${key}, which the file held as ${JSON.stringify(was)}`);
      }
      const refused = outcomes.filter((o) => o.state === "refused");
      if (refused.length) {
        console.error(
          `\nrefused: a real file stands where a link belongs. If home-manager wrote it,` +
            ` remove the path from the dotfiles tree and rebuild first; otherwise move it aside.`,
        );
        process.exitCode = 1;
      }
    }),
  );
}
