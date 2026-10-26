import { Effect, Result, Schema } from "effect";

const Count = Schema.FiniteFromString.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(1));

const Model = Schema.String.check(Schema.isPattern(/^[^/]+\/./, { message: "EVAL_MODEL names its provider, as provider/model" }));

const defaulted = <S extends Schema.Top>(schema: S, fallback: S["Encoded"]) => schema.pipe(Schema.withDecodingDefaultKey(Effect.succeed(fallback)));

export const Knobs = Schema.Struct({
  EVAL_RULES: Schema.optionalKey(Schema.String),
  EVAL_CASES: Schema.optionalKey(Schema.String),
  EVAL_REPEATS: defaulted(Count, "5"),
  EVAL_MAX_RUNS: defaulted(Count, "120"),
  EVAL_CONCURRENCY: defaulted(Count, "4"),
  EVAL_TIMEOUT_MINUTES: defaulted(Count, "15"),
  EVAL_MODEL: defaulted(Model, "opencode-go/muse-spark-1.3-contributor"),
  EVAL_THINKING: defaulted(Schema.Literals(["off", "minimal", "low", "medium", "high", "xhigh", "max"]), "high"),
  EVAL_PROVIDER_EXTENSION: Schema.optionalKey(Schema.NonEmptyString),
  EVAL_REPORT_DIR: Schema.optionalKey(Schema.NonEmptyString),
  EVAL_SWEEP_DIR: Schema.optionalKey(Schema.NonEmptyString),
  EVAL_CREDENTIALS: defaulted(Schema.String, "OPENCODE_API_KEY"),
});

export type Settings = {
  rules: readonly string[] | "all" | "stalest";
  cases: readonly string[] | "all";
  repeats: number;
  maxRuns: number;
  concurrency: number;
  timeoutMinutes: number;
  model: string;
  thinking: string;
  providerExtension: string | undefined;
  reportDir: string | undefined;
  sweepDir: string | undefined;
  credentials: readonly string[];
};

const listed = (text: string | undefined): readonly string[] | "all" =>
  text === undefined || text.trim() === "" ? "all" : text.split(",").map((item) => item.trim()).filter((item) => item !== "");

export function settingsFrom(env: Readonly<Record<string, string | undefined>>): Settings {
  const decoded = Schema.decodeResult(Knobs)(Object.fromEntries(Object.entries(env).filter(([name]) => name.startsWith("EVAL_"))));
  // vitest prints a config-load error by inspecting its fields, and a SchemaError's message is a getter it never reads.
  if (Result.isFailure(decoded)) throw new Error(decoded.failure.message);
  const knobs = decoded.success;
  const rules = listed(knobs.EVAL_RULES);
  const cases = listed(knobs.EVAL_CASES);
  return {
    rules: rules === "all" && cases === "all" ? "stalest" : rules,
    cases,
    repeats: knobs.EVAL_REPEATS,
    maxRuns: knobs.EVAL_MAX_RUNS,
    concurrency: knobs.EVAL_CONCURRENCY,
    timeoutMinutes: knobs.EVAL_TIMEOUT_MINUTES,
    model: knobs.EVAL_MODEL,
    thinking: knobs.EVAL_THINKING,
    providerExtension: knobs.EVAL_PROVIDER_EXTENSION,
    reportDir: knobs.EVAL_REPORT_DIR,
    sweepDir: knobs.EVAL_SWEEP_DIR,
    credentials: knobs.EVAL_CREDENTIALS.split(",").map((name) => name.trim()).filter((name) => name !== ""),
  };
}
