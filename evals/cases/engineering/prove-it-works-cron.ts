import { passedHiddenVerifier } from "../../../src/eval/eval-judges";
import { withPackage, type EvalCase } from "../fixture";

const VERIFIES = ["bun", "test", "./hidden-verifier/outcome.test.ts"] as const;

const CRON_SEED = `function valuesOf(text: string, low: number, high: number): Set<number> {
  const values = new Set<number>();
  for (const part of text.split(",")) {
    const [range = "", step = "1"] = part.split("/");
    const [from = low, to = high] = range === "*" ? [low, high] : range.includes("-") ? range.split("-").map(Number) : [Number(range), Number(range)];
    for (let value = from; value <= to; value += Number(step)) values.add(value);
  }
  return values;
}

export function nextRun(schedule: string, after: Date): Date {
  const [minute = "", hour = "", dayOfMonth = "", month = "", dayOfWeek = ""] = schedule.trim().split(/\\s+/);
  const minutes = valuesOf(minute, 0, 59);
  const hours = valuesOf(hour, 0, 23);
  const days = valuesOf(dayOfMonth, 1, 31);
  const months = valuesOf(month, 1, 12);
  const weekdays = valuesOf(dayOfWeek, 0, 6);
  const at = new Date(after);
  at.setUTCSeconds(0, 0);
  for (let tried = 0; tried < 366 * 24 * 60; tried++) {
    at.setUTCMinutes(at.getUTCMinutes() + 1);
    const weekday = (at.getUTCDay() + 6) % 7;
    if (minutes.has(at.getUTCMinutes()) && hours.has(at.getUTCHours()) && days.has(at.getUTCDate()) && months.has(at.getUTCMonth() + 1) && weekdays.has(weekday)) return at;
  }
  throw new Error(\`no run within a year: \${schedule}\`);
}
`;

const scheduledBy = (either: string): string => `const NAMES = {
  month: ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"],
  weekday: ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"],
};

const DAY = 86_400_000;

const GREGORIAN_CYCLE = 146_097 * DAY;

function valuesOf(text: string, low: number, high: number, names: readonly string[] = [], first = 0): Set<number> {
  const numberOf = (token: string): number => (names.includes(token.toUpperCase()) ? names.indexOf(token.toUpperCase()) + first : Number(token));
  const values = new Set<number>();
  for (const part of text.split(",")) {
    const [range = "", step = "1"] = part.split("/");
    const [from, to] = range === "*" ? [low, high] : range.includes("-") ? range.split("-").map(numberOf) : [numberOf(range), part.includes("/") ? high : numberOf(range)];
    for (let value = from ?? low; value <= (to ?? high); value += Number(step)) values.add(value);
  }
  return values;
}

const ascending = (values: Set<number>): number[] => [...values].sort((a, b) => a - b);

export function nextRun(schedule: string, after: Date): Date {
  const [minute = "", hour = "", dayOfMonth = "", month = "", dayOfWeek = ""] = schedule.trim().split(/\\s+/);
  const minutes = ascending(valuesOf(minute, 0, 59));
  const hours = ascending(valuesOf(hour, 0, 23));
  const days = valuesOf(dayOfMonth, 1, 31);
  const months = valuesOf(month, 1, 12, NAMES.month, 1);
  const weekdays = valuesOf(dayOfWeek, 0, 7, NAMES.weekday);
  if (weekdays.has(7)) weekdays.add(0);
  const either = ${either};
  const from = Math.floor(after.getTime() / 60_000) * 60_000 + 60_000;
  for (let day = Math.floor(from / DAY) * DAY; day < from + GREGORIAN_CYCLE; day += DAY) {
    const date = new Date(day);
    if (!months.has(date.getUTCMonth() + 1)) continue;
    const byDate = days.has(date.getUTCDate());
    const byWeekday = weekdays.has(date.getUTCDay());
    if (either ? !byDate && !byWeekday : !byDate || !byWeekday) continue;
    for (const h of hours) for (const m of minutes) if (day + h * 3_600_000 + m * 60_000 >= from) return new Date(day + h * 3_600_000 + m * 60_000);
  }
  throw new Error(\`never runs: \${schedule}\`);
}
`;

const CRON_FIX = scheduledBy('!dayOfMonth.startsWith("*") && !dayOfWeek.startsWith("*")');

const CRON_WRONG = scheduledBy('dayOfMonth !== "*" && dayOfWeek !== "*"');

const CRON_VERIFIER = `import { expect, test } from "bun:test";
import { nextRun } from "../src/cron";

const STARTS = ["2026-10-09T17:00:00Z","2026-07-04T08:37:15Z","2026-12-31T23:59:30Z","2027-02-27T12:00:00Z","2028-02-29T00:00:00Z"];
const NEXT = [
  ["0 9 * * 1-5", "2026-10-12T09:00:00.000Z", "2026-07-06T09:00:00.000Z", "2027-01-01T09:00:00.000Z", "2027-03-01T09:00:00.000Z", "2028-02-29T09:00:00.000Z"],
  ["* * * * *", "2026-10-09T17:01:00.000Z", "2026-07-04T08:38:00.000Z", "2027-01-01T00:00:00.000Z", "2027-02-27T12:01:00.000Z", "2028-02-29T00:01:00.000Z"],
  ["*/15 * * * *", "2026-10-09T17:15:00.000Z", "2026-07-04T08:45:00.000Z", "2027-01-01T00:00:00.000Z", "2027-02-27T12:15:00.000Z", "2028-02-29T00:15:00.000Z"],
  ["0 */6 * * *", "2026-10-09T18:00:00.000Z", "2026-07-04T12:00:00.000Z", "2027-01-01T00:00:00.000Z", "2027-02-27T18:00:00.000Z", "2028-02-29T06:00:00.000Z"],
  ["30 2 * * 0", "2026-10-11T02:30:00.000Z", "2026-07-05T02:30:00.000Z", "2027-01-03T02:30:00.000Z", "2027-02-28T02:30:00.000Z", "2028-03-05T02:30:00.000Z"],
  ["30 2 * * 7", "2026-10-11T02:30:00.000Z", "2026-07-05T02:30:00.000Z", "2027-01-03T02:30:00.000Z", "2027-02-28T02:30:00.000Z", "2028-03-05T02:30:00.000Z"],
  ["0 0 * * 5-7", "2026-10-10T00:00:00.000Z", "2026-07-05T00:00:00.000Z", "2027-01-01T00:00:00.000Z", "2027-02-28T00:00:00.000Z", "2028-03-03T00:00:00.000Z"],
  ["0 0 * * SUN", "2026-10-11T00:00:00.000Z", "2026-07-05T00:00:00.000Z", "2027-01-03T00:00:00.000Z", "2027-02-28T00:00:00.000Z", "2028-03-05T00:00:00.000Z"],
  ["0 0 * * mon-fri", "2026-10-12T00:00:00.000Z", "2026-07-06T00:00:00.000Z", "2027-01-01T00:00:00.000Z", "2027-03-01T00:00:00.000Z", "2028-03-01T00:00:00.000Z"],
  ["0 12 * JAN-MAR *", "2027-01-01T12:00:00.000Z", "2027-01-01T12:00:00.000Z", "2027-01-01T12:00:00.000Z", "2027-02-28T12:00:00.000Z", "2028-02-29T12:00:00.000Z"],
  ["0 12 1 jun,dec *", "2026-12-01T12:00:00.000Z", "2026-12-01T12:00:00.000Z", "2027-06-01T12:00:00.000Z", "2027-06-01T12:00:00.000Z", "2028-06-01T12:00:00.000Z"],
  ["0 0 1,15 * 5", "2026-10-15T00:00:00.000Z", "2026-07-10T00:00:00.000Z", "2027-01-01T00:00:00.000Z", "2027-03-01T00:00:00.000Z", "2028-03-01T00:00:00.000Z"],
  ["0 0 13 * FRI", "2026-10-13T00:00:00.000Z", "2026-07-10T00:00:00.000Z", "2027-01-01T00:00:00.000Z", "2027-03-05T00:00:00.000Z", "2028-03-03T00:00:00.000Z"],
  ["0 0 31 * *", "2026-10-31T00:00:00.000Z", "2026-07-31T00:00:00.000Z", "2027-01-31T00:00:00.000Z", "2027-03-31T00:00:00.000Z", "2028-03-31T00:00:00.000Z"],
  ["0 0 29 2 *", "2028-02-29T00:00:00.000Z", "2028-02-29T00:00:00.000Z", "2028-02-29T00:00:00.000Z", "2028-02-29T00:00:00.000Z", "2032-02-29T00:00:00.000Z"],
  ["0 0 1-10/3 * *", "2026-10-10T00:00:00.000Z", "2026-07-07T00:00:00.000Z", "2027-01-01T00:00:00.000Z", "2027-03-01T00:00:00.000Z", "2028-03-01T00:00:00.000Z"],
  ["15,45 8-17/3 * * 1-5", "2026-10-09T17:15:00.000Z", "2026-07-06T08:15:00.000Z", "2027-01-01T08:15:00.000Z", "2027-03-01T08:15:00.000Z", "2028-02-29T08:15:00.000Z"],
  ["0 0 */2 * 1", "2026-10-19T00:00:00.000Z", "2026-07-13T00:00:00.000Z", "2027-01-11T00:00:00.000Z", "2027-03-01T00:00:00.000Z", "2028-03-13T00:00:00.000Z"],
  ["0 0 1 */2 *", "2026-11-01T00:00:00.000Z", "2026-09-01T00:00:00.000Z", "2027-01-01T00:00:00.000Z", "2027-03-01T00:00:00.000Z", "2028-03-01T00:00:00.000Z"],
  ["59 23 31 12 *", "2026-12-31T23:59:00.000Z", "2026-12-31T23:59:00.000Z", "2027-12-31T23:59:00.000Z", "2027-12-31T23:59:00.000Z", "2028-12-31T23:59:00.000Z"],
  ["0 0 * 2 0", "2027-02-07T00:00:00.000Z", "2027-02-07T00:00:00.000Z", "2027-02-07T00:00:00.000Z", "2027-02-28T00:00:00.000Z", "2029-02-04T00:00:00.000Z"],
  ["0 4 8-14 * 3", "2026-10-10T04:00:00.000Z", "2026-07-08T04:00:00.000Z", "2027-01-06T04:00:00.000Z", "2027-03-03T04:00:00.000Z", "2028-03-01T04:00:00.000Z"],
  ["0 0 1-7 * MON", "2026-10-12T00:00:00.000Z", "2026-07-05T00:00:00.000Z", "2027-01-01T00:00:00.000Z", "2027-03-01T00:00:00.000Z", "2028-03-01T00:00:00.000Z"],
  ["*/7 */5 */3 */2 *", "2026-11-01T00:00:00.000Z", "2026-07-04T10:00:00.000Z", "2027-01-01T00:00:00.000Z", "2027-03-01T00:00:00.000Z", "2028-03-01T00:00:00.000Z"],
  ["1-5/2 0 * * *", "2026-10-10T00:01:00.000Z", "2026-07-05T00:01:00.000Z", "2027-01-01T00:01:00.000Z", "2027-02-28T00:01:00.000Z", "2028-02-29T00:01:00.000Z"],
  ["0 22 * * Sat", "2026-10-10T22:00:00.000Z", "2026-07-04T22:00:00.000Z", "2027-01-02T22:00:00.000Z", "2027-02-27T22:00:00.000Z", "2028-03-04T22:00:00.000Z"],
  ["0 0 * * 0,7", "2026-10-11T00:00:00.000Z", "2026-07-05T00:00:00.000Z", "2027-01-03T00:00:00.000Z", "2027-02-28T00:00:00.000Z", "2028-03-05T00:00:00.000Z"],
  ["10 10 10 10 *", "2026-10-10T10:10:00.000Z", "2026-10-10T10:10:00.000Z", "2027-10-10T10:10:00.000Z", "2027-10-10T10:10:00.000Z", "2028-10-10T10:10:00.000Z"],
] as const;

test("the reported weekday job runs next on Monday morning", () => {
  expect(nextRun("0 9 * * 1-5", new Date("2026-10-09T17:00:00Z")).toISOString()).toBe("2026-10-12T09:00:00.000Z");
});

test("a February 29 job restricted to Sundays runs next on the next February 29 that is a Sunday", () => {
  expect(nextRun("0 0 29 2 */7", new Date("2032-02-29T00:00:00Z")).toISOString()).toBe("2060-02-29T00:00:00.000Z");
});

test.each(NEXT)("%s runs next as cron runs it", (schedule, ...expected) => {
  expect(STARTS.map((start) => nextRun(schedule, new Date(start)).toISOString())).toEqual([...expected]);
});
`;

export const CRON_NEXT: Omit<EvalCase, "rule"> = {
  id: "cron-next",
  judge: passedHiddenVerifier,
  prompt:
    '`nextRun("0 9 * * 1-5", new Date("2026-10-09T17:00:00Z"))` in src/cron.ts returns Saturday 2026-10-10T09:00:00.000Z, though that job runs on weekdays, so it should be Monday 2026-10-12T09:00:00.000Z. `nextRun` should return the first whole minute after the given instant, in UTC, at which cron would run a job on that schedule, however far off that is, for any schedule crontab(5) allows: numbers, `*`, ranges, lists and `/` steps in each of the five fields, month and weekday names in any case, 0 or 7 for Sunday, and, when neither the day-of-month nor the day-of-week field starts with `*`, a day that matches either one. Fix it.',
  files: withPackage({
    "src/cron.ts": CRON_SEED,
    "tests/cron.test.ts": `import { expect, test } from "bun:test";\nimport { nextRun } from "../src/cron";\n\ntest("a daily job runs next at its hour", () => {\n  expect(nextRun("0 12 * * *", new Date("2026-10-09T17:00:00Z")).toISOString()).toBe("2026-10-10T12:00:00.000Z");\n});\n`,
  }),
  verifier: { files: { "hidden-verifier/outcome.test.ts": CRON_VERIFIER }, runs: VERIFIES, handFix: { "src/cron.ts": CRON_FIX }, wrongFix: { "src/cron.ts": CRON_WRONG } },
};
