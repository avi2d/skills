import { Config, Effect, Schema } from "effect";
import { FileFailure, MalformedMachineConfig } from "../platform/failures";
import type { Machine } from "./machine";

const Duration = Schema.TemplateLiteral([Schema.Finite, Schema.Literals(["ms", "s", "m", "h"])]);

const Count = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));

const Effort = Schema.Literals(["minimal", "low", "medium", "high", "xhigh", "max"]);

const SOL = "openai/gpt-6.1-sol";

const OPUS = "claude-bridge/claude-opus-5-5";

const SPARK = "opencode-go/muse-spark-1.3-contributor";

const MINIMAX = "opencode-go/minimax-m3.1-flash-free";

const BEAM = "opencode-go/beam-free";

const FREE_MODEL_REPOS = ["skills", "checks", "fleet-dash", "tui-dash", "ru-compliance"] as const;

const SECOND_ACCOUNT = "second";

const MAIN_ACCOUNT = "main";

const Floor = Schema.Struct({
  command: Schema.NonEmptyString.annotate({
    description: "A shell command printing JSON with the allowance left; a command that fails or prints no JSON skips the entry",
  }),
  field: Schema.Literal("remaining_percent"),
  minimum: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 100 })),
});

const AbsolutePath = Schema.String.check(Schema.isStartingWith("/")).annotate({
  description: "no-mistakes hands an entry's env to the agent unexpanded, so a tilde would never reach a home",
});

const ReviewerChain = Schema.Tuple([
  Schema.Struct({ agent: Schema.Literal("pi"), model: Schema.Literal(SOL), effort: Effort, floor: Floor }).annotate({
    description: "GPT-6.1 Sol on the Codex $20 account",
  }),
  Schema.Struct({
    agent: Schema.Literal("pi"),
    model: Schema.Literal(OPUS),
    effort: Effort,
    env: Schema.Struct({ CLAUDE_CONFIG_DIR: AbsolutePath }),
    floor: Floor,
  }).annotate({ description: "Opus 5.5 on the clauth account second, the Claude $100 Max account, logged in under its own config dir" }),
  Schema.Struct({
    agent: Schema.Literal("pi"),
    model: Schema.Literal(OPUS),
    effort: Effort,
    env: Schema.Struct({ CLAUDE_CONFIG_DIR: AbsolutePath }),
  }).annotate({
    description: "Opus 5.5 on the clauth account main, the Claude $200 Max account, logged in under its own config dir",
  }),
]).annotate({ description: "Reviewers in order of preference: the review step skips an entry whose floor reads below its minimum" });

const FreeModelRepos = Schema.Tuple([
  Schema.Literal(FREE_MODEL_REPOS[0]),
  Schema.Literal(FREE_MODEL_REPOS[1]),
  Schema.Literal(FREE_MODEL_REPOS[2]),
  Schema.Literal(FREE_MODEL_REPOS[3]),
  Schema.Literal(FREE_MODEL_REPOS[4]),
]).annotate({ description: "Repos a free model may run on: any other repo fails closed" });

const MinimaxExtraReview = Schema.Struct({
  enabled: Schema.Boolean,
  model: Schema.Literal(MINIMAX),
  fallback_model: Schema.Literal(SPARK),
  mode: Schema.Literal("advisory"),
  steps: Schema.Tuple([Schema.Literal("review")]),
  repos: FreeModelRepos,
}).annotate({ description: "MiniMax as an extra reviewer: findings sit beside the normal review and never gate, fix or apply" });

const BeamDrafts = Schema.Struct({
  enabled: Schema.Boolean,
  model: Schema.Literal(BEAM),
  fallback_model: Schema.Literal(SPARK),
  steps: Schema.Tuple([Schema.Literal("commit"), Schema.Literal("document")]),
  empty_retries: Schema.Literal(1),
  apply_check: Schema.Literal(true),
  repos: FreeModelRepos,
}).annotate({ description: "Beam drafts commit messages and the doc pass, retrying once on empty and apply-checking every edit" });

// A floor's field walks only objects, and quota-axi lists accounts in an array.
const CODEX_REMAINING = `{remaining_percent: ([.providers[] | select(.provider == "codex" and .state.stale == false) | .windows[] | select(.id == "five_hour") | .percentRemaining] | first)}`;

const loginDir = (home: string, account: string) => `${home}/.claude-accounts/${account}`;

// Claude Code names a config dir's Keychain item by the first 8 hex chars of sha256 over that dir.
const keychainServiceOf = (dir: string) => `Claude Code-credentials-${new Bun.CryptoHasher("sha256").update(dir.normalize("NFC")).digest("hex").slice(0, 8)}`;

const loginIn = (machine: Machine, dir: string) =>
  machine === "mac" ? `security find-generic-password -s '${keychainServiceOf(dir)}' >/dev/null 2>&1` : `test -s '${dir}/.credentials.json'`;

const FULL_ALLOWANCE = `echo '{"remaining_percent":100}'`;

// The base review prompt skips style, so the instruction says comments are wanted.
const COMMENT_REVIEW = [
  "Comment review, wanted here although the base review skips style: for each comment this change adds, report a finding with severity 'warning' and action 'no-op' when it restates the line under it, its name or its test's name, or carries a measured number such as a count, a timing or a size that will go stale.",
  "Keep a comment that gives a reason the code cannot show, or an invariant the types cannot hold.",
  "Never report a comment as 'error', and never as 'ask-user' or 'auto-fix'.",
].join(" ");

const SOL_FLOOR_MINIMUM = 30;

const PathInstruction = Schema.Struct({
  path: Schema.NonEmptyString.annotate({ description: "A glob over the changed files the instruction reviews" }),
  instructions: Schema.NonEmptyString,
});

const NoMistakesConfig = Schema.Struct({
  agent: Schema.Literal("pi").annotate({ description: "The agent every pipeline step runs on unless reviewer_chain names another" }),
  forgejo_axi_path: Schema.NonEmptyString,
  ci_timeout: Duration.annotate({ description: "How long the CI monitor babysits an open PR whose base has not moved" }),
  step_quiet_warning: Duration,
  agent_timeout: Duration,
  review_agent_timeout: Duration,
  test_agent_timeout: Duration,
  daemon_connect_timeout: Duration,
  branch_sync_remote_timeout: Duration,
  gate_reconcile_interval: Duration,
  gate_reconcile_timeout: Duration,
  session_reuse: Schema.Boolean,
  log_level: Schema.Literals(["debug", "info", "warn", "error"]),
  agent_config: Schema.Struct({
    claude: Schema.Struct({ model: Schema.Literal("opus"), effort: Effort }),
    pi: Schema.Struct({ model: Schema.Literal(SPARK), effort: Effort }),
  }),
  reviewer_chain: ReviewerChain,
  minimax_extra_review: MinimaxExtraReview,
  beam_drafts: BeamDrafts,
  auto_fix: Schema.Struct({ rebase: Count, lint: Count, test: Count, review: Count, document: Count, ci: Count }),
  ci: Schema.Struct({ rerun_transient: Count, revalidate_repairs: Schema.Boolean }),
  intent: Schema.Struct({
    enabled: Schema.Boolean,
    threshold: Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: 1 })),
    slack_days: Count,
  }),
  eval: Schema.Struct({ capture_provenance: Schema.Boolean, auto_capture: Schema.Boolean, max_cases: Count, diversified_size: Count }),
  rebase: Schema.Struct({ strategy: Schema.Literals(["merge", "rebase"]) }),
  pr: Schema.Struct({
    title_max_length: Count.annotate({
      description: "Holds the PR title the pipeline writes to the shared commitlint header limit, counting the squash suffix",
    }),
  }),
  review: Schema.Struct({ path_instructions: Schema.Array(PathInstruction) }),
});

type NoMistakesConfig = typeof NoMistakesConfig.Type;

export const noMistakesConfigOf = (machine: Machine, home: string): NoMistakesConfig => ({
  agent: "pi",
  forgejo_axi_path: "forgejo-axi",
  ci_timeout: "168h",
  step_quiet_warning: "10m",
  agent_timeout: "30m",
  review_agent_timeout: "60m",
  test_agent_timeout: "60m",
  daemon_connect_timeout: "3s",
  branch_sync_remote_timeout: "60s",
  gate_reconcile_interval: "2m",
  gate_reconcile_timeout: "30s",
  session_reuse: true,
  log_level: "info",
  agent_config: {
    claude: { model: "opus", effort: "high" },
    pi: { model: SPARK, effort: "high" },
  },
  reviewer_chain: [
    {
      agent: "pi",
      model: SOL,
      effort: "high",
      floor: { command: `quota-axi --provider codex --json | jq '${CODEX_REMAINING}'`, field: "remaining_percent", minimum: SOL_FLOOR_MINIMUM },
    },
    {
      agent: "pi",
      model: OPUS,
      effort: "high",
      env: { CLAUDE_CONFIG_DIR: loginDir(home, SECOND_ACCOUNT) },
      floor: { command: `${loginIn(machine, loginDir(home, SECOND_ACCOUNT))} && ${FULL_ALLOWANCE}`, field: "remaining_percent", minimum: 0 },
    },
    { agent: "pi", model: OPUS, effort: "high", env: { CLAUDE_CONFIG_DIR: loginDir(home, MAIN_ACCOUNT) } },
  ],
  minimax_extra_review: {
    enabled: true,
    model: MINIMAX,
    fallback_model: SPARK,
    mode: "advisory",
    steps: ["review"],
    repos: FREE_MODEL_REPOS,
  },
  beam_drafts: {
    enabled: false,
    model: BEAM,
    fallback_model: SPARK,
    steps: ["commit", "document"],
    empty_retries: 1,
    apply_check: true,
    repos: FREE_MODEL_REPOS,
  },
  auto_fix: { rebase: 3, lint: 3, test: 3, review: 0, document: 3, ci: 3 },
  ci: { rerun_transient: 0, revalidate_repairs: false },
  intent: { enabled: true, threshold: 0.2, slack_days: 3 },
  eval: { capture_provenance: true, auto_capture: true, max_cases: 200, diversified_size: 32 },
  rebase: { strategy: "merge" },
  pr: { title_max_length: 100 },
  review: { path_instructions: [{ path: "**/*", instructions: COMMENT_REVIEW }] },
});

type Mapping = { readonly [key: string]: Yaml };

type Yaml = string | number | boolean | readonly YamlItem[] | Mapping;

type YamlItem = Mapping | string;

const scalar = (value: string | number | boolean): string => (typeof value === "string" ? JSON.stringify(value) : String(value));

const isList = (value: Yaml): value is readonly YamlItem[] => Array.isArray(value);

const itemOf = (item: YamlItem, indent: string): string =>
  typeof item === "string" ? `${indent}- ${scalar(item)}\n` : `${indent}- ${yamlOf(item, `${indent}  `).slice(indent.length + 2)}`;

const entryOf = (key: string, value: Yaml, indent: string): string => {
  if (isList(value)) return `${indent}${key}:\n${value.map((item) => itemOf(item, `${indent}  `)).join("")}`;
  if (typeof value === "object") return `${indent}${key}:\n${yamlOf(value, `${indent}  `)}`;
  return `${indent}${key}: ${scalar(value)}\n`;
};

export const yamlOf = (mapping: Mapping, indent = ""): string =>
  Object.entries(mapping)
    .map(([key, value]) => entryOf(key, value, indent))
    .join("");

const decodeNoMistakesConfig = Schema.decodeUnknownEffect(NoMistakesConfig, { onExcessProperty: "error" });

const NO_MISTAKES_HEADER = "# Written by `bun run generate` from src/generate/no-mistakes-config.ts in the skills repository.\n";

export const noMistakesConfigUnder = (root: string): string => `${root}/no-mistakes/config.yaml`;

export const readHome = Config.String("HOME").pipe(
  Effect.mapError((cause) => new FileFailure({ path: "$HOME", message: cause.message })),
);

export const noMistakesYaml = Effect.fnUntraced(function* (source: unknown): Effect.fn.Return<string, MalformedMachineConfig> {
  const config = yield* decodeNoMistakesConfig(source).pipe(
    Effect.mapError((cause) => new MalformedMachineConfig({ message: `the no-mistakes config source does not decode: ${cause.message}` })),
  );
  return `${NO_MISTAKES_HEADER}${yamlOf(config)}`;
});
