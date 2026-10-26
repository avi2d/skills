import { expect, test } from "bun:test";
import { Effect, FileSystem } from "effect";
import { CASES } from "../../evals/cases";
import type { EvalCase } from "../../evals/cases/fixture";
import { passedHiddenVerifier, verdictOf } from "../../src/eval/eval-judges";
import { carriageOf, carriageOfFixture } from "../../src/eval/eval-pi";
import { seeded, verifiedBy } from "../../src/eval/eval-sandbox";
import { REPO } from "../../src/generate/link";
import { run } from "../lib/eval-run";
import { valueOf } from "../lib/effect";

const spawnTimeoutMs = 60_000;

const verified = [...new Map(CASES.flatMap((c) => (c.verifier === undefined ? [] : [[c.id, c] as const]))).values()];

const AGENT_TEST = { "tests/agent.test.ts": 'import { expect, test } from "bun:test";\n\ntest("the agent\'s own test", () => {\n  expect(1).toBe(2);\n});\n' };

const outcomeOf = (c: EvalCase, after: Readonly<Record<string, string>>) =>
  valueOf(
    Effect.scoped(
      Effect.gen(function* () {
        const seed = yield* seeded(c.files, "", process.env, []);
        const fs = yield* FileSystem.FileSystem;
        for (const [rel, text] of Object.entries(after)) {
          const path = `${seed.sandbox.repo}/${rel}`;
          yield* fs.makeDirectory(path.slice(0, path.lastIndexOf("/")), { recursive: true });
          yield* fs.writeFileString(path, text);
        }
        const verifier = c.verifier ?? expect.unreachable(`${c.id} has no verifier`);
        return verdictOf(passedHiddenVerifier, { ...run([], []), verified: yield* verifiedBy(seed, verifier) });
      }),
    ),
  );

test("there are outcome cases to prove", () => {
  expect(verified.map((c) => c.id).toSorted()).toEqual(["cron-next", "exact-cents", "git-ignored", "npm-caret"]);
});

for (const c of verified) {
  test(`the ${c.id} verifier fails the unfixed seed and a plausible wrong fix, and passes the hand fix, whatever the agent's own tests say`, async () => {
    const verifier = c.verifier ?? expect.unreachable(`${c.id} has no verifier`);
    expect(Object.keys(verifier.files).filter((path) => path in c.files), "the agent would see the verifier").toEqual([]);
    const unfixed = await outcomeOf(c, {});
    expect(unfixed.outcome, JSON.stringify(unfixed)).toBe("fail");
    const wrong = await outcomeOf(c, verifier.wrongFix);
    expect(wrong.outcome, JSON.stringify(wrong)).toBe("fail");
    const fixed = await outcomeOf(c, verifier.handFix);
    expect(fixed.outcome, JSON.stringify(fixed)).toBe("pass");
    expect(fixed).toMatchObject({ evidence: [expect.stringMatching(/exited 0/), expect.stringMatching(/^[1-9]\d* pass$/), "0 fail"] });
    expect((await outcomeOf(c, { ...verifier.handFix, ...AGENT_TEST })).outcome).toBe("pass");
  }, { timeout: spawnTimeoutMs });
}

const past = CASES.flatMap((c) => (c.delivery?.kind === "rule-as-of" ? [c.delivery] : []))[0] ?? expect.unreachable("no case delivers a past Rule");

test(
  "it reads the Rule as it read at a past commit from the fixture the tree holds, which the current arm does not match",
  async () => {
    const then = await valueOf(carriageOfFixture(REPO, past.of, past.fixture));
    expect(then).toContain("the failing test first and the fix on top");
    expect(then).not.toBe(await valueOf(carriageOf(REPO, "rule", past.of)));
  },
  { timeout: spawnTimeoutMs },
);
