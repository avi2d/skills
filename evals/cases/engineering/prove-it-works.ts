import { checkedAfterLastWrite, passedHiddenVerifier, reproducedBeforeFix } from "../../../src/eval/eval-judges";
import { withPackage, type EvalCase } from "../fixture";
import { CRON_NEXT } from "./prove-it-works-cron";
import { GIT_IGNORED } from "./prove-it-works-ignore";

const rule = "prove-it-works";

const RUNS_THE_TESTS = /\bbun\s+(?:run\s+)?test\b/;
const RUNS_CODE = /\b(?:bun|node|bunx|npx)\b/;

const TWO_MINUTES_AS_TWO_SECONDS = /\b2000\b/;

const SEMVER_SEED = `type Version = { major: number; minor: number; patch: number; prerelease: string[] };

const VERSION = /^(\\d+)\\.(\\d+)\\.(\\d+)(?:-([0-9A-Za-z.-]+))?$/;

export function parse(text: string): Version {
  const match = VERSION.exec(text.trim());
  if (!match) throw new Error(\`not a version: \${text}\`);
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]), prerelease: match[4] ? match[4].split(".") : [] };
}

export function compare(a: Version, b: Version): number {
  for (const key of ["major", "minor", "patch"] as const) if (a[key] !== b[key]) return a[key] - b[key];
  if (a.prerelease.length === 0 || b.prerelease.length === 0) return b.prerelease.length - a.prerelease.length;
  return a.prerelease.join(".").localeCompare(b.prerelease.join("."));
}

export function satisfies(version: string, range: string): boolean {
  const candidate = parse(version);
  const operator = range[0];
  if (operator !== "^" && operator !== "~") return compare(candidate, parse(range)) === 0;
  const floor = parse(range.slice(1));
  const ceiling: Version =
    operator === "^"
      ? { major: floor.major + 1, minor: 0, patch: 0, prerelease: [] }
      : { major: floor.major, minor: floor.minor + 1, patch: 0, prerelease: [] };
  return compare(candidate, floor) >= 0 && compare(candidate, ceiling) < 0;
}
`;

const SEMVER_FIX = `type Version = { major: number; minor: number; patch: number; prerelease: string[] };

const VERSION = /^(\\d+)\\.(\\d+)\\.(\\d+)(?:-([0-9A-Za-z.-]+))?$/;

const NUMERIC = /^\\d+$/;

export function parse(text: string): Version {
  const match = VERSION.exec(text.trim());
  if (!match) throw new Error(\`not a version: \${text}\`);
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]), prerelease: match[4] ? match[4].split(".") : [] };
}

function compareIdentifiers(a: string, b: string): number {
  const numericA = NUMERIC.test(a);
  const numericB = NUMERIC.test(b);
  if (numericA && numericB) return Number(a) - Number(b);
  if (numericA !== numericB) return numericA ? -1 : 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

export function compare(a: Version, b: Version): number {
  for (const key of ["major", "minor", "patch"] as const) if (a[key] !== b[key]) return a[key] - b[key];
  if (a.prerelease.length === 0 || b.prerelease.length === 0) return b.prerelease.length - a.prerelease.length;
  for (let at = 0; at < Math.max(a.prerelease.length, b.prerelease.length); at++) {
    const left = a.prerelease[at];
    const right = b.prerelease[at];
    if (left === undefined) return -1;
    if (right === undefined) return 1;
    const order = compareIdentifiers(left, right);
    if (order !== 0) return order;
  }
  return 0;
}

function ceilingOf(operator: string, floor: Version): Version {
  if (operator === "~" || (floor.major === 0 && floor.minor > 0)) return { major: floor.major, minor: floor.minor + 1, patch: 0, prerelease: ["0"] };
  if (floor.major > 0) return { major: floor.major + 1, minor: 0, patch: 0, prerelease: ["0"] };
  return { major: 0, minor: 0, patch: floor.patch + 1, prerelease: ["0"] };
}

export function satisfies(version: string, range: string): boolean {
  const candidate = parse(version);
  const operator = range[0];
  if (operator !== "^" && operator !== "~") return compare(candidate, parse(range)) === 0;
  const floor = parse(range.slice(1));
  const sameTuple = candidate.major === floor.major && candidate.minor === floor.minor && candidate.patch === floor.patch;
  if (candidate.prerelease.length > 0 && !(floor.prerelease.length > 0 && sameTuple)) return false;
  return compare(candidate, floor) >= 0 && compare(candidate, ceilingOf(operator, floor)) < 0;
}
`;

const SEMVER_VERIFIER = `import { expect, test } from "bun:test";
import { satisfies } from "../src/semver";

const NPM = [
  ["^1.2.3", "1.2.3", true],
  ["^1.2.3", "1.9.9", true],
  ["^1.2.3", "2.0.0", false],
  ["^1.2.3", "1.2.2", false],
  ["^1.2.3", "1.2.4-beta", false],
  ["^1.2.3", "2.0.0-alpha", false],
  ["^0.2.3", "0.2.3", true],
  ["^0.2.3", "0.2.9", true],
  ["^0.2.3", "0.3.0", false],
  ["^0.2.3", "0.2.2", false],
  ["^0.0.3", "0.0.3", true],
  ["^0.0.3", "0.0.4", false],
  ["^0.0.3", "0.0.2", false],
  ["~1.2.3", "1.2.9", true],
  ["~1.2.3", "1.3.0", false],
  ["~1.2.3", "1.2.2", false],
  ["~0.2.3", "0.2.5", true],
  ["~0.2.3", "0.3.0", false],
  ["1.2.3", "1.2.3", true],
  ["1.2.3", "1.2.4", false],
  ["^1.2.3-beta.2", "1.2.3-beta.4", true],
  ["^1.2.3-beta.2", "1.2.3-beta.11", true],
  ["^1.2.3-beta.2", "1.2.3", true],
  ["^1.2.3-beta.2", "1.3.0", true],
  ["^1.2.3-beta.2", "1.2.3-beta.1", false],
  ["^1.2.3-beta.2", "1.2.4-beta.2", false],
  ["^1.2.3-beta.2", "2.0.0", false],
  ["~1.2.3-beta.2", "1.2.3-beta.11", true],
  ["~1.2.3-beta.2", "1.2.4-beta.2", false],
  ["~1.2.3-beta.2", "1.2.5", true],
  ["^1.0.0-alpha", "1.0.0-alpha.1", true],
  ["^1.0.0-alpha", "1.0.0-alpha.beta", true],
  ["^1.0.0-alpha", "1.0.0-beta", true],
  ["^1.0.0-alpha", "1.0.0-beta.2", true],
  ["^1.0.0-alpha", "1.0.0-beta.11", true],
  ["^1.0.0-alpha", "1.0.0-rc.1", true],
  ["^1.0.0-alpha", "1.0.0", true],
  ["^1.0.0-beta.11", "1.0.0-beta.2", false],
  ["^1.0.0-beta.11", "1.0.0-rc.1", true],
  ["^1.0.0-alpha.beta", "1.0.0-alpha.1", false],
  ["^1.0.0-alpha.beta", "1.0.0-beta", true],
  ["^1.0.0-alpha.1", "1.0.0-alpha", false],
  ["^0.0.3-beta", "0.0.3-pr.2", true],
  ["^0.0.3-beta", "0.0.3", true],
  ["^0.0.3-beta", "0.0.4", false],
  ["1.0.0-beta.11", "1.0.0-beta.11", true],
  ["1.0.0-beta.11", "1.0.0-beta.2", false],
] as const;

test.each(NPM)("%s against %s answers %p, as npm's semver does", (range, version, answer) => {
  expect(satisfies(version, range)).toBe(answer);
});
`;

const MONEY_SEED = `export function total(amounts: readonly number[]): number {
  return amounts.reduce((sum, amount) => sum + amount, 0);
}

export function withTax(amount: number, rate: number): number {
  return Math.round(amount * (1 + rate) * 100) / 100;
}

export function discounted(amount: number, percent: number): number {
  return Math.round(amount * (100 - percent)) / 100;
}
`;

const MONEY_FIX = `const cents = (amount: number): number => Math.round(amount * 100);

const halfUp = (numerator: number, denominator: number): number => Math.floor((2 * numerator + denominator) / (2 * denominator));

export function total(amounts: readonly number[]): number {
  return amounts.reduce((sum, amount) => sum + cents(amount), 0) / 100;
}

export function withTax(amount: number, rate: number): number {
  const basisPoints = Math.round(rate * 10_000);
  return halfUp(cents(amount) * (10_000 + basisPoints), 10_000) / 100;
}

export function discounted(amount: number, percent: number): number {
  return halfUp(cents(amount) * (100 - percent), 100) / 100;
}
`;

const MONEY_VERIFIER = `import { expect, test } from "bun:test";
import { discounted, total, withTax } from "../src/money";

const CENTS = Array.from({ length: 5000 }, (_, at) => BigInt(at + 1));

const halfUp = (numerator: bigint, denominator: bigint): number => Number((2n * numerator + denominator) / (2n * denominator)) / 100;

const misses = (checks: Iterable<readonly [string, number, number]>): string[] =>
  [...checks].filter(([, got, want]) => got !== want).map(([call, got, want]) => \`\${call} gave \${got}, not \${want}\`).slice(0, 5);

test("the reported invoice adds up to the cent", () => {
  expect(total([0.1, 0.2])).toBe(0.3);
});

test("a total is exact however many amounts it adds", () => {
  expect(total(Array.from({ length: 10 }, () => 0.1))).toBe(1);
  expect(total([19.99, 5.01, 0.07])).toBe(25.07);
  expect(total([])).toBe(0);
  expect(misses(CENTS.map((at) => [\`total([\${Number(at) / 100}, 0.07])\`, total([Number(at) / 100, 0.07]), Number(at + 7n) / 100] as const))).toEqual([]);
});

test("tax rounds half up to the cent", () => {
  expect(withTax(2.5, 0.07)).toBe(2.68);
  expect(withTax(1.15, 0.1)).toBe(1.27);
  for (const basisPoints of [700n, 825n, 1000n, 1500n]) {
    const rate = Number(basisPoints) / 10_000;
    expect(misses(CENTS.map((at) => [\`withTax(\${Number(at) / 100}, \${rate})\`, withTax(Number(at) / 100, rate), halfUp(at * (10_000n + basisPoints), 10_000n)] as const))).toEqual([]);
  }
});

test("a discount rounds half up to the cent", () => {
  expect(discounted(1.15, 10)).toBe(1.04);
  expect(discounted(0.05, 50)).toBe(0.03);
  for (const percent of [10n, 15n, 33n, 50n]) {
    expect(misses(CENTS.map((at) => [\`discounted(\${Number(at) / 100}, \${percent})\`, discounted(Number(at) / 100, Number(percent)), halfUp(at * (100n - percent), 100n)] as const))).toEqual([]);
  }
});
`;

const SEMVER_WRONG = SEMVER_SEED.replace(
  /const ceiling: Version =[\s\S]*?;\n/,
  `const ceiling: Version =
    operator === "~" || (floor.major === 0 && floor.minor > 0)
      ? { major: floor.major, minor: floor.minor + 1, patch: 0, prerelease: [] }
      : floor.major > 0
        ? { major: floor.major + 1, minor: 0, patch: 0, prerelease: [] }
        : { major: 0, minor: 0, patch: floor.patch + 1, prerelease: [] };
`,
);

const MONEY_WRONG = MONEY_SEED.replace("sum + amount, 0);", "sum + Math.round(amount * 100), 0) / 100;");

const VERIFIES = ["bun", "test", "./hidden-verifier/outcome.test.ts"] as const;

export const OUTCOMES: readonly Omit<EvalCase, "rule">[] = [
  {
    id: "npm-caret",
    judge: passedHiddenVerifier,
    prompt:
      '`satisfies("0.3.0", "^0.2.3")` in src/semver.ts answers true, so an update pulled a breaking 0.3.0 into a project pinned to `^0.2.3`. `satisfies` should answer the way npm\'s semver package does for the ranges it takes: an exact version, `^` and `~`. Fix it.',
    files: withPackage({
      "src/semver.ts": SEMVER_SEED,
      "tests/semver.test.ts": `import { expect, test } from "bun:test";\nimport { satisfies } from "../src/semver";\n\ntest("a caret range takes later minors and patches of its major", () => {\n  expect(satisfies("1.4.0", "^1.2.3")).toBe(true);\n  expect(satisfies("2.0.0", "^1.2.3")).toBe(false);\n});\n`,
    }),
    verifier: { files: { "hidden-verifier/outcome.test.ts": SEMVER_VERIFIER }, runs: VERIFIES, handFix: { "src/semver.ts": SEMVER_FIX }, wrongFix: { "src/semver.ts": SEMVER_WRONG } },
  },
  {
    id: "exact-cents",
    judge: passedHiddenVerifier,
    prompt:
      "An invoice showed a total of 0.30000000000000004: `total([0.1, 0.2])` in src/money.ts returns that. Amounts are dollars and cents, so every function in src/money.ts should return an exact amount of cents, rounding half up to the cent where it has to round. Tax rates have at most four decimal places, and discounts are whole percents. Fix it.",
    files: withPackage({
      "src/money.ts": MONEY_SEED,
      "tests/money.test.ts": `import { expect, test } from "bun:test";\nimport { discounted, withTax } from "../src/money";\n\ntest("tax and discount on round amounts", () => {\n  expect(withTax(100, 0.0825)).toBe(108.25);\n  expect(discounted(19.99, 15)).toBe(16.99);\n});\n`,
    }),
    verifier: { files: { "hidden-verifier/outcome.test.ts": MONEY_VERIFIER }, runs: VERIFIES, handFix: { "src/money.ts": MONEY_FIX }, wrongFix: { "src/money.ts": MONEY_WRONG } },
  },
];

export const PROVE_IT_WORKS: readonly EvalCase[] = [
  {
    id: "verify-the-fix",
    rule,
    judge: checkedAfterLastWrite(RUNS_THE_TESTS),
    prompt: "`total` in src/cart.ts ignores each item's quantity: two items priced 3 should cost 6. Fix it.",
    files: withPackage({
      "src/cart.ts":
        "export type Item = { price: number; quantity: number };\n\nexport function total(items: readonly Item[]): number {\n  return items.reduce((sum, item) => sum + item.price, 0);\n}\n",
      "tests/cart.test.ts": `import { expect, test } from "bun:test";\nimport { total } from "../src/cart";\n\ntest("one of each adds up", () => {\n  expect(total([{ price: 2, quantity: 1 }, { price: 3, quantity: 1 }])).toBe(5);\n});\n`,
    }),
  },
  {
    id: "reproduce-first",
    rule,
    judge: reproducedBeforeFix(/(?:^|\/)src\/duration\.ts$/, RUNS_CODE, "2m", TWO_MINUTES_AS_TWO_SECONDS),
    prompt: 'A user reports that `parseDuration("2m")` gives the wrong number of milliseconds. Fix it.',
    files: withPackage({
      "src/duration.ts":
        'export function parseDuration(text: string): number {\n  const match = /^(\\d+)(ms|s|m)$/.exec(text.trim());\n  if (!match) throw new Error(`not a duration: ${text}`);\n  const value = Number(match[1]);\n  return match[2] === "s" ? value * 1000 : match[2] === "m" ? value * 1000 : value;\n}\n',
      "tests/duration.test.ts": `import { expect, test } from "bun:test";\nimport { parseDuration } from "../src/duration";\n\ntest("milliseconds and seconds", () => {\n  expect(parseDuration("250ms")).toBe(250);\n  expect(parseDuration("3s")).toBe(3000);\n});\n`,
    }),
  },
  ...[GIT_IGNORED, CRON_NEXT].map((c) => ({ ...c, rule })),
];
