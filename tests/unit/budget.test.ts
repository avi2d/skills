import { describe, expect, test } from "bun:test";
import { HARNESSES } from "../../src/bodies/bodies";
import { indexFor } from "../../src/generate/dispatch-index";
import { active } from "../../src/generate/generate";
import { REPO } from "../../src/generate/link";
import { opening, overBudget, spendOf, type Spend } from "../lib/budget";
import { valueOf } from "../lib/effect";

// A Rule costs on two schedules, so one ceiling cannot hold both: `always` is charged to every session,
// and a scope condition is charged only where it matches.
const OPENING = 1_200;
const WORST = 3_550;

const { bodies, profiles } = await valueOf(active(REPO));

const indexed = await Promise.all(
  HARNESSES.map(async (harness) => ({ harness, rules: (await valueOf(indexFor(harness, bodies, profiles))).rules })),
);

describe("what a session pays before it does anything", () => {
  for (const { harness, rules } of indexed) {
    test(`${harness} opens under the opening ceiling`, () => {
      expect(overBudget(spendOf(opening(rules)), OPENING)).toBeUndefined();
    });

    test(`${harness} stays under the worst-case ceiling with every Rule it can receive firing at once`, () => {
      expect(overBudget(spendOf(rules), WORST)).toBeUndefined();
    });
  }

  test("the ceiling reports the overage and the largest bodies, so a run says what to cut", () => {
    const spend: Spend[] = [
      { name: "sprawling", tokens: 900 },
      { name: "middling", tokens: 300 },
      { name: "slight", tokens: 50 },
      { name: "slighter", tokens: 1 },
    ];
    expect(overBudget(spend, 1_000)).toBe(
      "1251 tokens against a ceiling of 1000, 251 over. Largest: sprawling 900, middling 300, slight 50",
    );
    expect(overBudget(spend, 1_251), "a set exactly at the ceiling is inside it").toBeUndefined();
  });
});
