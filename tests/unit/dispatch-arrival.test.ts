import { describe, expect, test } from "bun:test";
import { carriage, carriages, dispatch, type Event, type RunState } from "../../src/dispatcher/dispatch";
import { logLine } from "../../src/dispatcher/dispatch-log";
import { always, compaction, injectedState, onWrite, promptIn, ruled, start, typescript, wrote, carriageFor, nth, ruleText, run } from "../lib/dispatch";

describe("the request a Rule is supposed to be in", () => {
  const index = ruled([["typescript-best-practices", typescript]]);
  const text = (name: string) => ruleText(index, name);
  const asking = (carrying: string): Event => ({ type: "requested", carrying, read: "request" });
  const two = ruled([
    ["first", typescript],
    ["second", typescript],
  ]);
  const second = ruleText(two, "second");

  test("a Rule the request carries is not reported at all", () => {
    const { actions } = run(index, [promptIn("src/a.ts"), asking(`prefix ${text("typescript-best-practices")} suffix`)]);
    expect(actions.map((a) => a.type)).toEqual(["inject"]);
  });

  test("a Rule the request does not carry is reported as broken, after the inject line that claimed it", () => {
    const { actions } = run(index, [promptIn("src/a.ts"), asking("a request about something else entirely")]);
    expect(actions.map((a) => a.type)).toEqual(["inject", "broken"]);
    expect(logLine(nth(actions, 1))).toBe(
      "broken typescript-best-practices: it was injected, and the request that followed carried no trace of it, so it never reached the model",
    );
  });

  test("a request that re-wrapped the text still witnesses it", () => {
    const rewrapped = text("typescript-best-practices").replace(/\s+/g, "\n    \t ");
    const { actions } = run(index, [promptIn("src/a.ts"), asking(rewrapped)]);
    expect(actions.map((a) => a.type)).toEqual(["inject"]);
  });

  test("it is said once, and not again on every request after it", () => {
    const { actions } = run(index, [promptIn("src/a.ts"), asking("nothing"), asking("nothing"), asking("nothing")]);
    expect(actions.filter((a) => a.type === "broken")).toHaveLength(1);
  });

  test("a Rule that never matched is not asked about", () => {
    expect(run(index, [promptIn("main.rs"), asking("nothing")]).actions).toEqual([]);
  });

  test("a Rule delivered mid-turn is held to the same check", () => {
    const writes = ruled([["typescript-best-practices", onWrite]]);
    const { actions } = run(writes, [wrote("src/a.ts"), asking("nothing")]);
    expect(actions.map((a) => a.type)).toEqual(["deliver", "broken"]);
  });

  test("a compaction puts the Rule back in question, so its next arrival is checked again", () => {
    const { actions } = run(index, [
      promptIn("src/a.ts"),
      asking(text("typescript-best-practices")),
      compaction,
      promptIn("src/a.ts"),
      asking("nothing"),
    ]);
    expect(actions.map((a) => a.type)).toEqual(["inject", "queue", "inject", "broken"]);
  });

  test("a new session checks again, because it is a new context window", () => {
    const { actions } = run(index, [
      promptIn("src/a.ts"),
      asking(text("typescript-best-practices")),
      start,
      promptIn("src/a.ts"),
      asking("nothing"),
    ]);
    expect(actions.map((a) => a.type)).toEqual(["inject", "inject", "broken"]);
  });

  test("each Rule is reported on its own, in declared order", () => {
    const { actions } = run(two, [promptIn("a.ts"), asking(second)]);
    expect(actions.filter((a) => a.type === "broken").map((a) => a.rule)).toEqual(["first"]);
  });

  test("a request before anything is in force says nothing", () => {
    expect(run(index, [start, asking("nothing")]).actions).toEqual([]);
  });

  test("a Rule cut short on the way is reported as cut short, because the start of it is not the Rule", () => {
    const long = ruled([["long", typescript]]);
    const body = `# long\n\n${"Every sentence of this Rule is one the model is meant to hold. ".repeat(20)}The last line.\n`;
    const whole = { ...long, rules: long.rules.map((rule) => ({ ...rule, text: body })) };
    const { actions } = run(whole, [promptIn("a.ts"), asking(body.slice(0, Math.floor(body.length / 2)))]);
    expect(actions.map((a) => a.type)).toEqual(["inject", "broken"]);
    expect(logLine(nth(actions, 1))).toBe(
      "broken long: it was injected, and the request that followed carried only the start of it, so the model never had the whole of it",
    );
  });

  test("a transcript is named as what was read, since it is the harness's record and not the request", () => {
    const { actions } = run(index, [promptIn("src/a.ts"), { type: "requested", carrying: "nothing", read: "transcript" }]);
    expect(logLine(nth(actions, 1))).toBe(
      "broken typescript-best-practices: it was injected, and the transcript that followed recorded no trace of it, so it never reached the model",
    );
  });

  test("a record that answers for some Rules leaves the rest to the record that answers for them", () => {
    const { actions } = run(two, [
      promptIn("a.ts"),
      { type: "requested", carrying: "nothing", read: "transcript", rules: ["first"] },
      { type: "requested", carrying: second, read: "transcript", rules: ["second"] },
    ]);
    expect(actions.filter((a) => a.type === "broken").map((a) => a.rule)).toEqual(["first"]);
  });

  test("a Rule named that was never injected is not asked about", () => {
    const { actions } = run(index, [start, { type: "requested", carrying: "nothing", read: "transcript", rules: ["typescript-best-practices"] }]);
    expect(actions).toEqual([]);
  });
});

describe("the text the Rules in force are carried as", () => {
  const index = ruled([
    ["first", always],
    ["second", always],
    ["third", always],
  ]);
  const text = (name: string) => ruleText(index, name);

  test("it holds the whole of every Rule named, and not a pointer to one", () => {
    const out = carriageFor(index, ["first", "third"]);
    expect(out).toContain(text("first"));
    expect(out).toContain(text("third"));
  });

  test("it holds nothing of a Rule that is not in force", () => {
    expect(carriageFor(index, ["first"])).not.toContain(text("second"));
  });

  test("it is in declared order, whatever order it was asked in", () => {
    const out = carriageFor(index, ["third", "first", "second"]);
    expect(out.indexOf(text("first"))).toBeLessThan(out.indexOf(text("second")));
    expect(out.indexOf(text("second"))).toBeLessThan(out.indexOf(text("third")));
  });

  test("a Rule asked for twice is carried once", () => {
    const out = carriageFor(index, ["first", "first"]);
    expect(out.split(text("first")).length - 1).toBe(1);
  });

  test("nothing in force is nothing to carry, rather than a preamble introducing no Rules", () => {
    expect(carriage(index, [])).toBeUndefined();
  });

  test("what it carries is what the check accepts, so a carrier that drops a Rule is caught", () => {
    const inForce = ["first", "second", "third"];
    const held: RunState = injectedState(...inForce);
    const whole = dispatch(index, { type: "requested", carrying: carriageFor(index, inForce), read: "request" }, held);
    expect(whole.actions).toEqual([]);

    const short = dispatch(index, { type: "requested", carrying: carriageFor(index, ["first", "third"]), read: "request" }, held);
    expect(short.actions.map((a) => (a.type === "broken" ? a.rule : a.type))).toEqual(["second"]);
  });
});

describe("the Rules in force, split for a harness that previews a context past a limit", () => {
  const index = ruled([
    ["first", always],
    ["second", always],
    ["third", always],
  ]);
  const inForce = ["first", "second", "third"];
  const text = (name: string) => ruleText(index, name);

  test("within the limit it is one part, and that part is the carriage itself", () => {
    expect(carriages(index, inForce, carriageFor(index, inForce).length)).toEqual([carriageFor(index, inForce)]);
  });

  test("past it, every part stays within it and is the carriage of the Rules it holds, in declared order", () => {
    const limit = carriageFor(index, ["first", "second"]).length;
    const parts = carriages(index, ["third", "second", "first"], limit);
    expect(parts).toEqual([carriageFor(index, ["first", "second"]), carriageFor(index, ["third"])]);
    for (const part of parts) expect(part.length).toBeLessThanOrEqual(limit);
  });

  test("a Rule is never cut, so one longer than the limit goes whole in a part of its own", () => {
    const parts = carriages(index, inForce, 10);
    expect(parts).toEqual(inForce.map((name) => carriageFor(index, [name])));
    for (const name of inForce) expect(parts.filter((part) => part.includes(text(name)))).toHaveLength(1);
  });

  test("nothing in force is no parts", () => {
    expect(carriages(index, [], 10_000)).toEqual([]);
  });

  test("the parts, arriving in any order, carry what the check accepts", () => {
    const held: RunState = injectedState(...inForce);
    const parts = carriages(index, inForce, carriageFor(index, ["first"]).length).toReversed();
    const step = dispatch(index, { type: "requested", carrying: parts.join("\n"), read: "transcript" }, held);
    expect(step.actions).toEqual([]);
  });
});

