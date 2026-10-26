import { spawnSync } from "node:child_process";
import { existsSync, globSync } from "node:fs";
import { resolve } from "node:path";
import { segments, type Word } from "./shell-words";

export type Group = "tests" | "gpu" | "evals";

export type Steered = { type: "queue"; group: Group; command: string } | { type: "refuse"; groups: readonly Group[]; text: string };

type Entry = { group: Group; runs: readonly string[]; when: (args: readonly string[], dirs: readonly string[]) => boolean };

const WATCH_OPTIONS = ["-w", "--watch", "--watchAll"];

const watching = (arg: string): boolean => {
  const [name = "", value] = arg.split(/=(.*)/s);
  return WATCH_OPTIONS.includes(name) && value !== "false";
};

type Options = { paths: readonly string[]; filters: readonly string[] };

const optionName = (arg: string): string => (arg.startsWith("--") ? arg.replace(/=.*/, "") : arg.slice(0, 2));

const GLOB = /[*?[{]/;

const exists = (dirs: readonly string[], word: string): boolean => {
  const path = word.replace(/(?:::.*|:\d+)$/, "");
  return dirs.some((cwd) => existsSync(resolve(cwd, path)) || (GLOB.test(path) && globSync(path, { cwd }).length > 0));
};

const whole =
  ({ paths, filters }: Options) =>
  (args: readonly string[], dirs: readonly string[]): boolean => {
    for (let at = 0; at < args.length; at += 1) {
      const arg = args[at] ?? "";
      if (watching(arg)) return false;
      if (!arg.startsWith("-")) {
        if (exists(dirs, arg)) return false;
        continue;
      }
      const name = optionName(arg);
      if (filters.includes(name)) return false;
      if (name === arg && paths.includes(name) && !(args[at + 1] ?? "-").startsWith("-")) at += 1;
    }
    return true;
  };

const always = (): boolean => true;

const prompted = (args: readonly string[]): boolean => args.filter((arg) => !arg.startsWith("-")).length >= 2;

const BUN: Options = {
  paths: ["-c", "--config", "-r", "--preload", "--require", "--import", "--coverage-dir", "--reporter-outfile", "--env-file", "--cwd", "--tsconfig-override", "--timings", "--path-ignore-patterns"],
  filters: ["-t", "--test-name-pattern", "--changed"],
};

const VITEST: Options = {
  paths: ["-c", "--config", "-r", "--root", "--dir", "--setupFiles", "--globalSetup", "--outputFile", "--exclude", "--attachmentsDir", "--mergeReports", "--coverage.reportsDirectory", "--coverage.include", "--coverage.exclude"],
  filters: ["-t", "--testNamePattern", "--test-name-pattern", "--tagsFilter", "--tags-filter", "--changed"],
};

const SCRIPT: Options = {
  paths: [...BUN.paths, ...VITEST.paths],
  filters: [...BUN.filters, ...VITEST.filters, "-g", "--grep", "--fgrep"],
};

const CARGO: Options = {
  paths: ["-m", "--manifest-path", "--target-dir", "--config", "--logfile"],
  filters: ["--test", "--bin", "--example", "--bench"],
};

const PYTEST: Options = {
  paths: ["-c", "--config-file", "--rootdir", "--basetemp", "--confcutdir", "--junitxml", "--junit-xml", "--ignore", "--ignore-glob", "--deselect", "--log-file"],
  filters: ["-k"],
};

const scripts = (...runner: string[]): Entry[] => [
  { group: "tests", runs: [...runner, "test"], when: whole(SCRIPT) },
  { group: "tests", runs: [...runner, "mutate"], when: always },
  { group: "tests", runs: [...runner, "mutate:incremental"], when: always },
];

const exits = (args: readonly string[]): boolean => !args.some(watching);

const evalScripts = (...runner: string[]): Entry[] => [{ group: "evals", runs: [...runner, "eval"], when: exits }];

const EVAL_CONFIG = /(^|\/)evals\/vitest\.config\.ts$/;

const evalConfig = (args: readonly string[]): boolean => {
  if (!exits(args)) return false;
  for (let at = 0; at < args.length; at += 1) {
    const arg = args[at] ?? "";
    const [name = "", value] = arg.split(/=(.*)/s);
    if (name !== "-c" && name !== "--config") continue;
    if (EVAL_CONFIG.test(value ?? args[at + 1] ?? "")) return true;
  }
  return false;
};

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
  { group: "tests", runs: ["bun", "test"], when: whole(BUN) },
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
  { group: "evals", runs: ["vitest", "run"], when: evalConfig },
  { group: "tests", runs: ["vitest", "run"], when: whole(VITEST) },
  { group: "tests", runs: ["stryker", "run"], when: always },
  { group: "tests", runs: ["cargo", "test"], when: whole(CARGO) },
  { group: "tests", runs: ["pytest"], when: whole(PYTEST) },
  { group: "gpu", runs: ["llama-bench"], when: always },
  { group: "gpu", runs: ["llama-batched-bench"], when: always },
  { group: "gpu", runs: ["ollama", "run"], when: prompted },
  ...[...INFERENCE_COMMANDS].map(([command, when]): Entry => ({ group: "gpu", runs: [command], when })),
  { group: "gpu", runs: ["uv", "run"], when: runsInference },
  { group: "gpu", runs: ["uvx"], when: runsInference },
  { group: "gpu", runs: ["python"], when: runsInferenceModule },
  { group: "gpu", runs: ["python3"], when: runsInferenceModule },
];

type Wrapper = { runs: readonly string[]; values: readonly string[]; operands: number };

const WRAPPERS: readonly Wrapper[] = [
  { runs: ["env"], values: ["-u", "--unset", "-C", "--chdir"], operands: 0 },
  { runs: ["time"], values: ["-f", "--format", "-o", "--output"], operands: 0 },
  { runs: ["nice"], values: ["-n", "--adjustment"], operands: 0 },
  { runs: ["nohup"], values: [], operands: 0 },
  { runs: ["timeout"], values: ["-s", "--signal", "-k", "--kill-after"], operands: 1 },
  { runs: ["bunx"], values: ["-p", "--package"], operands: 0 },
  { runs: ["npx"], values: ["-p", "--package"], operands: 0 },
  { runs: ["bun", "x"], values: ["-p", "--package"], operands: 0 },
  { runs: ["pnpm", "exec"], values: ["-C", "--dir", "-F", "--filter", "--resume-from"], operands: 0 },
  { runs: ["pnpm", "dlx"], values: ["--package", "--allow-build"], operands: 0 },
];

const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;

const startsWith = (words: readonly string[], prefix: readonly string[]): boolean => prefix.every((word, at) => words[at] === word);

const program = (word: string): string => word.slice(word.lastIndexOf("/") + 1);

function pastWrapper(words: readonly string[], { runs, values, operands }: Wrapper): string[] {
  let left = operands;
  for (let at = runs.length; at < words.length; at += 1) {
    const word = words[at] ?? "";
    if (word === "--") return words.slice(at + 1 + left);
    if (word.startsWith("-") && word.length > 1) {
      if (values.includes(word)) at += 1;
    } else if (left === 0) return words.slice(at);
    else left -= 1;
  }
  return [];
}

function unwrapOnce(words: readonly string[]): string[] | undefined {
  const [head = "", ...rest] = words;
  if (ASSIGNMENT.test(head)) return rest;
  const named = [program(head), ...rest];
  const wrapper = WRAPPERS.find(({ runs }) => startsWith(named, runs));
  return wrapper === undefined ? undefined : pastWrapper(words, wrapper);
}

function unwrapped(words: readonly string[]): string[] {
  let rest = [...words];
  for (let inner = unwrapOnce(rest); inner !== undefined; inner = unwrapOnce(rest)) rest = inner;
  return rest.map((word, at) => (at === 0 ? program(word) : word));
}

const texts = (words: readonly Word[]): string[] => words.map(({ text }) => text);

export const simpleCommands = (command: string): string[][] => segments(command).map((words) => unwrapped(texts(words)));

const DIRECTORY_OPTIONS = ["--cwd", "-C", "--chdir"];

function directoriesNamed(words: readonly string[]): string[] {
  if (program(words[0] ?? "") === "cd") return words.slice(1).filter((word) => !word.startsWith("-")).slice(0, 1);
  return words.flatMap((word, at) => {
    if (DIRECTORY_OPTIONS.includes(word)) return words.slice(at + 1, at + 2);
    const [name = "", value] = word.split(/=(.*)/s);
    return DIRECTORY_OPTIONS.includes(name) && value !== undefined ? [value] : [];
  });
}

type Queued = { group: Group; words: readonly Word[]; prefix: number };

function queuedSegments(command: string, cwd: string): Queued[] {
  const raw = segments(command);
  const dirs = [cwd, ...raw.flatMap((words) => directoriesNamed(texts(words))).map((dir) => resolve(cwd, dir))];
  return raw.flatMap((words) => {
    const named = unwrapped(texts(words));
    const entry = TABLE.find(({ runs, when }) => startsWith(named, runs) && when(named.slice(runs.length), dirs));
    return entry === undefined ? [] : [{ group: entry.group, words, prefix: words.length - named.length }];
  });
}

const groupsOf = (found: readonly Queued[]): Group[] => [...new Set(found.map(({ group }) => group))];

export const queueFor = (command: string, cwd: string): Group[] => groupsOf(queuedSegments(command, cwd));

const quoted = (text: string): string => `'${text.replaceAll("'", `'\\''`)}'`;

export const LOG_LINES = 40;

export function queued(command: string, group: Group): string {
  return [
    `id=$(pueue add --print-task-id --group ${group} -- ${quoted(command)}) && {`,
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
  if (assigned.length === 0) return first === undefined ? [] : [{ from: first.from, to: first.from, text: `${capped} ` }];
  return assigned.filter(({ text }) => !fitsCap(EVAL_ASSIGNMENT.exec(text)?.[1] ?? "")).map(({ from, to }) => ({ from, to, text: capped }));
}

const edited = (command: string, edits: readonly Edit[]): string =>
  [...edits].sort((a, b) => b.from - a.from).reduce((out, { from, to, text }) => out.slice(0, from) + text + out.slice(to), command);

export function steer(command: string, cwd: string, available: () => readonly string[] | undefined = pueueGroups): Steered | undefined {
  const found = queuedSegments(command, cwd);
  const groups = groupsOf(found);
  const [group] = groups;
  if (group === undefined) return undefined;
  const listed = available();
  if (!groups.every((wanted) => listed?.includes(wanted))) return undefined;
  if (groups.length > 1) return { type: "refuse", groups, text: groups.includes("evals") ? SEPARATE_EVAL_CALLS : SEPARATE_CALLS };
  if (group === "evals") return { type: "queue", group, command: queued(edited(command, found.flatMap(evalCapEdits)), group) };
  return { type: "queue", group, command: queued(command, group) };
}

export const steeredLine = (steered: Steered): string =>
  steered.type === "queue" ? `job-queue ${steered.group}: queued the command through pueue` : `job-queue ${steered.groups.join(" and ")}: refused a call that mixes groups`;
