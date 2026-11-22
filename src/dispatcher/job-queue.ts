import { spawnSync } from "node:child_process";
import { segments, type Word } from "./shell-words";
import { compileGlob, hasConfig, program, RESERVED_WORDS, SCRIPT_RUNNERS, startsWith, stripped, texts } from "./shell-commands";
import { readSkillsSettings } from "./project-settings";

export type Group = "tests" | "gpu" | "evals";

export type Steered = { type: "queue"; group: Group; command: string } | { type: "refuse"; groups: readonly Group[]; text: string } | { type: "pass"; group: Group; reason: string; text: string };

type Entry = { group: Group; runs: readonly string[]; when: (args: readonly string[]) => boolean };

const WATCH_OPTIONS = ["-w", "--watch", "--watchAll"];

const watching = (arg: string): boolean => {
  const [name = "", value] = arg.split(/=(.*)/s);
  return WATCH_OPTIONS.includes(name) && value !== "false";
};

const always = (): boolean => true;

const prompted = (args: readonly string[]): boolean => args.filter((arg) => !arg.startsWith("-")).length >= 2;

const exits = (args: readonly string[]): boolean => !args.some(watching);

const scripts = (...runner: string[]): Entry[] => [
  { group: "tests", runs: [...runner, "test"], when: exits },
  { group: "tests", runs: [...runner, "test:fast"], when: exits },
  { group: "tests", runs: [...runner, "mutate"], when: always },
  { group: "tests", runs: [...runner, "mutate:incremental"], when: always },
];

const evalScripts = (...runner: string[]): Entry[] => [{ group: "evals", runs: [...runner, "eval"], when: exits }];


type Gate = (args: readonly string[]) => boolean;

const rembgRuns: Gate = (args) => (args[0] === "i" || args[0] === "p") && exits(args);

const INFERENCE_COMMANDS: ReadonlyMap<string, Gate> = new Map([
  ["rembg", rembgRuns],
  ["whisper", always],
  ["whisper-cli", always],
  ["whisper-cpp", always],
]);

const INFERENCE_MODULES: ReadonlyMap<string, Gate> = new Map([
  ["rembg", rembgRuns],
  ["whisper", always],
]);

const INFERENCE_PACKAGES: readonly string[] = ["rembg", "onnxruntime", "torch", "transformers", "diffusers", "llama-cpp-python", "faster-whisper", "openai-whisper"];

const DECLARING = ["-w", "--with", "--from"];

const UV_VALUES = [
  ...DECLARING,
  ...["-p", "--python", "--python-platform", "--torch-backend", "--with-editable", "--with-requirements", "-c", "--constraints", "-b", "--build-constraints", "--overrides"],
  ...["--extra", "--no-extra", "--group", "--no-group", "--only-group", "--package", "--no-editable-package", "--env-file", "--project", "--directory", "--config-file", "--cache-dir", "--color"],
  ...["--index", "--default-index", "-i", "--index-url", "--extra-index-url", "-f", "--find-links", "--index-strategy", "--keyring-provider", "--allow-insecure-host"],
  ...["-P", "--upgrade-package", "--upgrade-group", "--resolution", "--prerelease", "--prerelease-package", "--fork-strategy", "--exclude-newer", "--exclude-newer-package"],
  ...["--no-sources-package", "--reinstall-package", "--refresh-package", "--link-mode", "-C", "--config-setting", "--config-settings-package"],
  ...["--no-build-isolation-package", "--no-build-package", "--no-binary-package"],
];

type Invocation = { tool: string; rest: readonly string[]; declared: readonly string[] };

function invocation(args: readonly string[]): Invocation {
  const declared: string[] = [];
  for (let at = 0; at < args.length; at += 1) {
    const arg = args[at] ?? "";
    if (arg === "--") return { tool: args[at + 1] ?? "", rest: args.slice(at + 2), declared };
    if (!arg.startsWith("-") || arg === "-") return { tool: arg, rest: args.slice(at + 1), declared };
    const [name = "", value] = arg.split(/=(.*)/s);
    if (!UV_VALUES.includes(name)) continue;
    if (value === undefined) at += 1;
    if (DECLARING.includes(name)) declared.push(...(value ?? args[at] ?? "").split(","));
  }
  return { tool: "", rest: [], declared };
}

const packageName = (spec: string): string => (/^[A-Za-z0-9._-]+/.exec(spec.trim())?.[0] ?? "").toLowerCase().replace(/[-_.]+/g, "-");

const declaresInference = (declared: readonly string[]): boolean => declared.some((spec) => INFERENCE_PACKAGES.includes(packageName(spec)));

const isScript = (word: string): boolean => word.endsWith(".py");

function pythonRunsInference(args: readonly string[], declared: readonly string[]): boolean {
  if (args[0] === "-m") return INFERENCE_MODULES.get(args[1] ?? "")?.(args.slice(2)) ?? false;
  return isScript(args[0] ?? "") && declaresInference(declared);
}

const isPython = (runner: string): boolean => runner === "python" || runner === "python3";

const runsInference: Gate = (args) => {
  const { tool, rest, declared } = invocation(args);
  const runner = program(tool);
  if (isPython(runner)) return pythonRunsInference(rest, declared);
  if (isScript(runner)) return declaresInference(declared);
  return INFERENCE_COMMANDS.get(runner)?.(rest) ?? false;
};

const runsInferenceModule: Gate = (args) => pythonRunsInference(args, []);

const TABLE: readonly Entry[] = [
  { group: "tests", runs: ["bun", "test"], when: exits },
  ...scripts("bun", "run"),
  ...scripts("npm", "run"),
  ...scripts("pnpm", "run"),
  ...scripts("yarn", "run"),
  ...scripts("npm"),
  ...scripts("pnpm"),
  ...scripts("yarn"),
  ...evalScripts("bun", "run"),
  ...evalScripts("npm", "run"),
  ...evalScripts("pnpm", "run"),
  ...evalScripts("yarn", "run"),
  ...evalScripts("pnpm"),
  ...evalScripts("yarn"),
  { group: "tests", runs: ["vitest", "run"], when: exits },
  { group: "tests", runs: ["stryker", "run"], when: always },
  { group: "tests", runs: ["cargo", "test"], when: exits },
  { group: "tests", runs: ["pytest"], when: exits },
  { group: "tests", runs: ["checks-test"], when: exits },
  { group: "tests", runs: ["go", "test"], when: exits },
  { group: "tests", runs: ["xcrun", "simctl", "boot"], when: always },
  { group: "tests", runs: ["xcrun", "simctl", "io"], when: always },
  { group: "gpu", runs: ["llama-bench"], when: always },
  { group: "gpu", runs: ["llama-batched-bench"], when: always },
  { group: "gpu", runs: ["ollama", "run"], when: prompted },
  ...[...INFERENCE_COMMANDS].map(([command, when]): Entry => ({ group: "gpu", runs: [command], when })),
  { group: "gpu", runs: ["uv", "run"], when: runsInference },
  { group: "gpu", runs: ["uvx"], when: runsInference },
  { group: "gpu", runs: ["python"], when: runsInferenceModule },
  { group: "gpu", runs: ["python3"], when: runsInferenceModule },
];

type Queued = { group: Group; words: readonly Word[]; prefix: number };

const base = (word: string): string => word.slice(word.lastIndexOf("/") + 1);


const TOOL_PATHS = new Set(["lint", "typecheck", "build"]);

const scripted = (bare: readonly string[], scriptPaths: readonly RegExp[]): { group: Group } | undefined => {
  const [rawHead = "", ...rawRest] = bare;
  const through = SCRIPT_RUNNERS.has(program(rawHead)) ? rawRest : bare;
  const [first = "", ...args] = through;
  if (args.some(watching)) return undefined;
  if (first.includes("/") && TOOL_PATHS.has(base(first))) return { group: "tests" };
  if (base(first) === "fm-sim-boot.sh") return { group: "tests" };
  if (scriptPaths.some((script) => script.test(first))) return { group: "tests" };
  return undefined;
};

function queuedSegments(command: string, cwd: string): Queued[] {
  const git = spawnSync("git", ["-C", cwd, "rev-parse", "--show-toplevel"], { encoding: "utf8", timeout: 3_000 });
  const read = readSkillsSettings(git.status === 0 ? git.stdout.trim() : cwd);
  const settings = read !== undefined && "settings" in read ? read.settings.agentTests : undefined;
  const paths = (globs: readonly string[]): RegExp[] => globs.flatMap((glob) => {
    try { return [compileGlob("**/" + glob)]; } catch { return []; }
  });
  const parts = segments(command);
  const dirFlags = (flags: readonly string[], arg: string): boolean =>
    flags.some((flag) => arg === flag || (flag.startsWith("--") ? arg.startsWith(flag + "=") : arg.length > flag.length && arg.startsWith(flag)));
  const moves = parts.some((words) => {
    const raw = texts(words);
    const head = program(raw[0] ?? "");
    if (head === "cd" || head === "pushd" || head === "popd") return true;
    const scope = head === "env" ? { flags: ["-C", "--chdir"], args: raw.slice(1) }
      : head === "pnpm" && raw[1] === "exec" ? { flags: ["-C", "--dir"], args: raw.slice(2) }
      : undefined;
    return scope !== undefined && scope.args.some((arg) => dirFlags(scope.flags, arg));
  });
  const scriptPaths = moves ? [] : paths(settings?.testScripts ?? []);
  const configs = moves ? [] : paths(settings?.evalConfigs ?? []);
  return parts.flatMap((words) => {
    const bare = stripped(texts(words));
    const named = bare.map((word, at) => (at === 0 ? program(word) : word));
    if (startsWith(named, ["vitest", "run"]) && exits(named.slice(2)) && hasConfig(named.slice(2), configs)) {
      return [{ group: "evals" as const, words, prefix: words.length - bare.length }];
    }
    const entry = TABLE.find(({ runs, when }) => startsWith(named, runs) && when(named.slice(runs.length)));
    if (entry !== undefined) return [{ group: entry.group, words, prefix: words.length - bare.length }];
    const fallback = scripted(bare, scriptPaths);
    return fallback === undefined ? [] : [{ ...fallback, words, prefix: words.length - bare.length }];
  });
}

const groupsOf = (found: readonly Queued[]): Group[] => [...new Set(found.map(({ group }) => group))];

export const queueFor = (command: string, cwd: string): Group[] => groupsOf(queuedSegments(command, cwd));

const quoted = (text: string): string => `'${text.replaceAll("'", `'\\''`)}'`;

export const LOG_LINES = 40;

export function queued(command: string, group: Group, priority?: number): string {
  const selected = priority === undefined ? "" : ` --priority ${priority}`;
  const workload = `nice -n 19 bash -c ${quoted(command)}`;
  return [
    `id=$(pueue add${selected} --print-task-id --group ${group} -- ${quoted(workload)}) && {`,
    `echo "queued as pueue task $id in group ${group}"`,
    `pueue wait --quiet --status success "$id"; ok=$?`,
    `pueue log --lines ${LOG_LINES} "$id"`,
    `(exit "$ok")`,
    `}`,
  ].join("\n");
}

function pueueGroups(): readonly string[] | undefined {
  // Without env, Bun looks pueue up on the PATH the process started with, not the one it has now.
  const listed = spawnSync("pueue", ["group", "--json"], { encoding: "utf8", timeout: 5_000, env: process.env });
  if (listed.status !== 0) return undefined;
  try {
    const parsed: unknown = JSON.parse(listed.stdout);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? Object.keys(parsed) : undefined;
  } catch {
    return undefined;
  }
}

export const SEPARATE_CALLS = "This call runs a test suite and a GPU command, which queue in different pueue groups. Run the tests and the GPU command as separate tool calls.";

export const SEPARATE_EVAL_CALLS = "This call runs an eval and another heavy command, which queue in different pueue groups. Run the eval and the other command as separate tool calls.";

export const EVAL_CONCURRENCY_CAP = 3;

const EVAL_ASSIGNMENT = /^EVAL_CONCURRENCY=(\S*)$/;

const fitsCap = (value: string): boolean => /^\d+$/.test(value) && Number(value) <= EVAL_CONCURRENCY_CAP;

type Edit = { from: number; to: number; text: string };

// The harness default is 4, past the cap, so a run that sets nothing still needs the assignment.
function evalCapEdits({ words, prefix }: Queued): Edit[] {
  const assigned = words.slice(0, prefix).filter(({ text }) => EVAL_ASSIGNMENT.test(text));
  const capped = `EVAL_CONCURRENCY=${EVAL_CONCURRENCY_CAP}`;
  const [first] = words;
  if (assigned.length === 0) {
    if (first === undefined) return [];
    const anchor = words.find(({ text }) => !RESERVED_WORDS.has(text)) ?? first;
    return [{ from: anchor.from, to: anchor.from, text: `${capped} ` }];
  }
  return assigned.filter(({ text }) => !fitsCap(EVAL_ASSIGNMENT.exec(text)?.[1] ?? "")).map(({ from, to }) => ({ from, to, text: capped }));
}

const edited = (command: string, edits: readonly Edit[]): string =>
  [...edits].sort((a, b) => b.from - a.from).reduce((out, { from, to, text }) => out.slice(0, from) + text + out.slice(to), command);

const unavailable = (group: Group, reason: string): Steered => ({
  type: "pass",
  group,
  reason,
  text: `The ${group} queue is unavailable because ${reason}, so the command runs directly.`,
});

export function steer(command: string, cwd: string, available: () => readonly string[] | undefined = pueueGroups): Steered | undefined {
  if (process.env.PUEUE_GROUP !== undefined || process.env.PUEUE_WORKER_ID !== undefined) return undefined;
  const found = queuedSegments(command, cwd);
  const groups = groupsOf(found);
  const [group] = groups;
  if (group === undefined) return undefined;
  const listed = available();
  if (listed === undefined) return unavailable(group, "the pueue group listing failed");
  const [missing] = groups.filter((wanted) => !listed.includes(wanted));
  if (missing !== undefined) return unavailable(missing, `pueue has no ${missing} group`);
  if (groups.length > 1) return { type: "refuse", groups, text: groups.includes("evals") ? SEPARATE_EVAL_CALLS : SEPARATE_CALLS };
  if (group === "evals") return { type: "queue", group, command: queued(edited(command, found.flatMap(evalCapEdits)), group) };
  if (group === "tests") return { type: "queue", group, command: queued(command, group, 1) };
  return { type: "queue", group, command: queued(command, group) };
}

export const steeredLine = (steered: Steered): string => {
  if (steered.type === "queue") return `job-queue ${steered.group}: queued the command through pueue`;
  if (steered.type === "refuse") return `job-queue ${steered.groups.join(" and ")}: refused a call that mixes groups`;
  return `job-queue ${steered.group}: not queued (${steered.reason})`;
};
