import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Schema } from "effect";
import { dispatch, type Index } from "../../src/dispatcher/dispatch";
import { START } from "../../src/dispatcher/run-state";
import type { Check } from "../../src/dispatcher/verdict";
import { CONFIG, TAIL_CHARS, VERIFY_BUDGET_SECONDS, tailOf, verify } from "../../src/dispatcher/gate";
import { readConfig } from "../../src/dispatcher/gate-config";

const repo = new URL("../../", import.meta.url).pathname;

describe("reading the checks a repository declares", () => {
  test("this repository's own file reads as the commands no-mistakes runs", () => {
    expect(readConfig(readFileSync(join(repo, CONFIG), "utf8"))).toEqual({
      allowRepoCommands: true,
      commands: { lint: "bun run lint && bun run typecheck", test: "bun run test:fast" },
    });
  });

  test("a quoted value reads as the string inside the quotes", () => {
    expect(readConfig("commands:\n  lint: 'bin/fm-lint.sh'\n")).toEqual({ allowRepoCommands: false, commands: { lint: "bin/fm-lint.sh" } });
    expect(readConfig(`commands:\n  test: "echo \\"it's\\" done" # trailing\n`)).toEqual({
      allowRepoCommands: false,
      commands: { test: `echo "it's" done` },
    });
    expect(readConfig("commands:\n  test: 'it''s'\n")).toMatchObject({ commands: { test: "it's" } });
  });

  test("a block value reads whole, literal or folded", () => {
    const literal = readConfig("commands:\n  test: |\n    bun install\n    bun test\n  lint: >-\n    oxlint\n    --type-aware\n");
    expect(literal).toMatchObject({ commands: { test: "bun install\nbun test", lint: "oxlint --type-aware" } });
  });

  test("a plain value loses its trailing comment", () => {
    expect(readConfig("commands:\n  test: bun test   # the whole suite\n")).toMatchObject({ commands: { test: "bun test" } });
  });

  test("the entries it has no use for are stepped over, however they are written", () => {
    const text = [
      "# leading comment",
      "allow_repo_commands: true",
      "commands:",
      "  prepare: |",
      "    commands:",
      "      test: not this",
      "  test: bun test",
      "review:",
      "  path_instructions:",
      "    - path: \"x/**\"",
      "      instructions: |",
      "        commands:",
      "          lint: nor this",
      "",
    ].join("\n");
    expect(readConfig(text)).toEqual({ allowRepoCommands: true, commands: { test: "bun test" } });
  });

  test("a form it does not decode is reported rather than guessed at", () => {
    for (const [text, why] of [
      ["commands: {test: bun test}\n", "block mapping"],
      ["commands:\n  test: bun\n    test\n", "runs onto the next line"],
      ["commands:\n  test: 'bun test\n", "does not close"],
      ["commands:\n  test: &t bun test\n", "does not decode"],
      ["allow_repo_commands: yes\n", "neither true nor false"],
      ["- commands\n", "top-level line"],
    ] as const) {
      const read = readConfig(text);
      expect("unreadable" in read ? read.unreadable : `read as ${JSON.stringify(read)}`, text).toContain(why);
    }
  });

  test("a file that says nothing about commands declares no checks and does not allow the branch's own", () => {
    expect(readConfig("review:\n  path_instructions: []\n")).toEqual({ allowRepoCommands: false, commands: {} });
  });
});

describe("what a failing check hands back", () => {
  test("colour codes go, and a long output keeps only its last lines, starting on a line of its own", () => {
    const long = Array.from({ length: 2_000 }, (_, n) => `\u001b[31mline ${n}\u001b[0m`).join("\n");
    const tail = tailOf(long);
    expect(tail.length).toBeLessThanOrEqual(TAIL_CHARS);
    expect(tail).not.toContain("\u001b");
    expect(tail.endsWith("line 1999")).toBe(true);
    expect(tail.split("\n")[0]).toMatch(/^line \d+$/);
  });

  test("the hold a failure becomes fits under the ~2,500 tokens Codex passes on whole", () => {
    const TEST: Check = { name: "test", command: "bun run test" };
    const index: Index = { harness: "codex", rules: [], profiles: [], hub: [] };
    const tail = tailOf("x".repeat(TAIL_CHARS * 3));
    const { actions } = dispatch(
      index,
      { type: "verdict", tree: "t1", after: "t1", seconds: 1, verdict: { outcome: "failed", check: TEST, status: "exited 1", tail } },
      START,
    );
    const hold = actions.find((action) => action.type === "hold");
    expect(hold?.text.length ?? 0).toBeGreaterThan(TAIL_CHARS);
    expect(hold?.text.length ?? Infinity).toBeLessThan(2_500 * 4);
  });
});

describe("running the checks", () => {
  const scratch = (): string => realpathSync(mkdtempSync(join(tmpdir(), "skills-verify-")));
  const check = (name: Check["name"], command: string): Check => ({ name, command });

  test("every check passing is a pass naming them", async () => {
    const dir = scratch();
    try {
      expect((await verify(dir, [check("test", "true"), check("lint", "exit 0")])).verdict).toEqual({
        outcome: "passed",
        checks: ["test", "lint"],
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("the first check to fail is the verdict, with how it failed and what it printed, and the rest do not run", async () => {
    const dir = scratch();
    try {
      const { verdict } = await verify(dir, [check("test", "echo '(fail) a thing' >&2; exit 3"), check("lint", "touch lint-ran")]);
      expect(verdict).toEqual({ outcome: "failed", check: check("test", "echo '(fail) a thing' >&2; exit 3"), status: "exited 3", tail: "(fail) a thing" });
      expect(existsSync(join(dir, "lint-ran")), "a check ran after the verdict was already known").toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("a check still running when the budget runs out is cut off, with everything it started, and the gate overran its budget", async () => {
    const dir = scratch();
    try {
      const began = Date.now();
      const { verdict } = await verify(dir, [check("test", "sleep 30 & sleep 30; wait")], 1);
      expect(Date.now() - began, "the gate waited past its budget").toBeLessThan(5_000);
      expect(verdict).toEqual({ outcome: "overran", why: "`sleep 30 & sleep 30; wait` was still running when the gate's 1s ran out" });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("a check that runs a command not installed in the checkout is inconclusive, not a failure to hold on", async () => {
    const dir = scratch();
    try {
      const { verdict } = await verify(dir, [check("test", "skills-gate-not-installed --check"), check("lint", "touch lint-ran")]);
      expect(verdict).toEqual({
        outcome: "inconclusive",
        why: "`skills-gate-not-installed --check` exited 127, so something it runs is not installed in this checkout",
      });
      expect(existsSync(join(dir, "lint-ran")), "a check ran after the verdict was already known").toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("the Stop hooks the gate runs inside", () => {
  const Hooked = Schema.Struct({ command: Schema.optionalKey(Schema.String), timeout: Schema.optionalKey(Schema.Finite) });
  const decodeHooks = Schema.decodeUnknownSync(
    Schema.Struct({
      hooks: Schema.optionalKey(Schema.Struct({ Stop: Schema.optionalKey(Schema.Array(Schema.Struct({ hooks: Schema.optionalKey(Schema.Array(Hooked)) }))) })),
    }),
  );
  const stopHooks = (path: string) => {
    const stop = decodeHooks(JSON.parse(readFileSync(join(repo, path), "utf8"))).hooks?.Stop ?? [];
    return stop.flatMap((entry) => entry.hooks ?? []).filter((hook) => hook.command?.includes("skills-dispatch"));
  };

  for (const path of ["harness/claude-code/settings.json", "harness/codex/hooks.json"]) {
    test(`${path} gives the Dispatcher's Stop hook longer than the gate's budget, so the harness never kills a verdict half-read`, () => {
      const hooks = stopHooks(path);
      expect(hooks.length, "no Stop hook runs the Dispatcher, so this proves nothing").toBe(1);
      expect(hooks[0]?.timeout ?? 0).toBeGreaterThanOrEqual(VERIFY_BUDGET_SECONDS + 30);
    });
  }
});
