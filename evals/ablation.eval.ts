import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Duration, Effect, ManagedRuntime } from "effect";
import { inject } from "vitest";
import { createHarness, createJudge, describeEval, type TranscriptEvent } from "vitest-evals";
import { bodyDir, type Kind } from "../src/bodies/bodies";
import { sweepOf, type Cell, type Spend, type Verdict } from "../src/eval/ablation";
import { armRun, carriageOf, carriageOfFixture, referenceOf, type Agent, type ArmRun } from "../src/eval/eval-pi";
import { stalest, sweepRecords } from "../src/eval/eval-sweeps";
import type { Transcript } from "../src/eval/eval-transcript";
import { platform } from "../src/platform/platform";
import { CASES } from "./cases";
import { delivered } from "./cases/fixture";
import { proseOf } from "./prose";
import { settingsFrom } from "./settings";
import { estimateCost } from "./pricing";

const settings = settingsFrom(process.env);
const runtime = ManagedRuntime.make(platform);
const selected = settings.rules === "stalest" ? stalest(CASES, await runtime.runPromise(sweepRecords(inject("sweepDir"))), settings.model) : settings.rules;
const sweep = sweepOf(CASES, { ...settings, rules: selected });
if ("refused" in sweep) throw new Error(`ablation: ${sweep.refused}`);

const repo = new URL("../", import.meta.url).pathname;
const reportDir = inject("reportDir");

const provider = settings.model.slice(0, settings.model.indexOf("/"));
const unset = settings.credentials.filter((name) => process.env[name] === undefined);
if (unset.length > 0) throw new Error(`ablation: EVAL_CREDENTIALS names ${unset.join(", ")}, which the environment does not set`);

const agent: Agent = {
  pi: `${repo}node_modules/.bin/pi`,
  model: settings.model,
  thinking: settings.thinking,
  extensions: [`${repo}evals/carry.ts`, ...(settings.providerExtension === undefined ? [] : [resolve(settings.providerExtension)])],
  timeout: Duration.minutes(settings.timeoutMinutes),
};

const rules = [...new Set(sweep.cells.map((cell) => cell.rule))];
const planned = CASES.filter((c) => rules.includes(c.rule) && sweep.cases.includes(c.id));
const pastRules = new Map(planned.flatMap((c) => (c.delivery?.kind === "rule-as-of" ? [[c.rule, c.delivery] as const] : [])));
const carriedAs = (kind: "rule" | "reference") =>
  [...new Set(planned.filter((c) => delivered(c, "injected").carried === kind && !pastRules.has(c.rule)).map((c) => c.rule))];
const injectedRules = carriedAs("rule");
const carriedReferences = carriedAs("reference");
const referenceNames = [...new Set(planned.flatMap((c) => delivered(c, "injected").references))];
const dirsOf = (kind: Kind, names: readonly string[]) => runtime.runPromise(Effect.forEach(names, (name) => bodyDir(repo, kind, name)));
const prose = proseOf(repo, [...(await dirsOf("rule", injectedRules)), ...(await dirsOf("reference", [...new Set([...carriedReferences, ...referenceNames])]))]);
const carry = (kind: "rule" | "reference", names: readonly string[]) =>
  Promise.all(names.map(async (name) => [name, await runtime.runPromise(carriageOf(repo, kind, name))] as const));
const carriages = new Map([
  ...(await carry("rule", injectedRules)),
  ...(await carry("reference", carriedReferences)),
  ...(await Promise.all([...pastRules].map(async ([name, { of, fixture }]) => [name, await runtime.runPromise(carriageOfFixture(repo, of, fixture))] as const))),
]);
const references = new Map(await Promise.all(referenceNames.map(async (name) => [name, await runtime.runPromise(referenceOf(repo, name))] as const)));

type Output = { verdict: Verdict; spend: Spend; wroteTest?: boolean };

const KEPT = 4000;

function eventsOf(prompt: string, transcript: Transcript): TranscriptEvent[] {
  const events: TranscriptEvent[] = [{ type: "message", role: "user", content: prompt }];
  for (const step of transcript.steps) {
    if (step.kind === "say") {
      events.push({ type: "message", role: "assistant", content: step.text });
      continue;
    }
    const { id, tool, args, result, failed } = step.call;
    const shown = Object.fromEntries(Object.entries(args).map(([key, value]) => [key, (typeof value === "string" ? value : JSON.stringify(value)).slice(0, KEPT)]));
    events.push({ type: "tool_call", id, name: tool, arguments: shown });
    events.push({ type: "tool_result", toolCallId: id, name: tool, content: result.slice(0, KEPT), metadata: { failed, bytes: result.length } });
  }
  return events;
}

async function keep(cell: Cell, armed: ArmRun): Promise<void> {
  const base = `${reportDir}/runs/${cell.rule}.${cell.case}.${cell.arm}.${cell.repeat}`;
  await mkdir(`${reportDir}/runs`, { recursive: true });
  await writeFile(`${base}.jsonl`, `${armed.lines.join("\n")}\n`);
  await writeFile(`${base}.changes.json`, `${JSON.stringify(armed.changes, null, 2)}\n`);
  if (armed.commits.length > 0) await writeFile(`${base}.commits.json`, `${JSON.stringify(armed.commits, null, 2)}\n`);
  if (armed.stderr !== "") await writeFile(`${base}.stderr.txt`, armed.stderr);
}

const harness = createHarness<Cell, Output>({
  name: "pi-sandbox",
  run: async ({ input }) => {
    const found = CASES.find((c) => c.rule === input.rule && c.id === input.case);
    if (found === undefined) throw new Error(`ablation: no case ${input.rule}/${input.case}`);
    const delivery = delivered(found, input.arm);
    const carriage = delivery.carried === undefined ? "" : (carriages.get(input.rule) ?? "");
    const available = Object.fromEntries(delivery.references.map((name) => [name, references.get(name) ?? ""]));
    const armed = await runtime.runPromise(armRun(agent, found, carriage, process.env, settings.credentials, available, estimateCost));
    await keep(input, armed);
    return {
      output: { verdict: armed.verdict, spend: armed.spend, ...(armed.wroteTest === undefined ? {} : { wroteTest: armed.wroteTest }) },
      events: eventsOf(found.prompt, armed.transcript),
      usage: { provider, model: settings.model, inputTokens: armed.spend.input, outputTokens: armed.spend.output, costUsd: armed.spend.cost },
    };
  },
});

const ProgramVerdict = createJudge<Cell, Output>("ProgramVerdict", ({ output }) => ({
  score: output.verdict.outcome === "unjudged" ? null : output.verdict.outcome === "pass" ? 1 : 0,
  metadata: { verdict: output.verdict },
}));

for (const rule of rules) {
  describeEval(rule, { harness }, (it) => {
    it.concurrent.for(sweep.cells.filter((cell) => cell.rule === rule))("$case $arm #$repeat", async (cell, { run, task, expect }) => {
      const result = await run(cell);
      task.meta.ablation = { ...cell, ...result.output };
      task.meta.prose = prose;
      await expect(result).toSatisfyJudge(ProgramVerdict, { threshold: null });
    });
  });
}
