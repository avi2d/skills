import { describe, expect, test } from "bun:test";
import { Effect } from "effect";
import type { Action, Event, Index } from "../../src/dispatcher/dispatch";
import { logLine } from "../../src/dispatcher/dispatch-log";
import { indexFor } from "../../src/generate/dispatch-index";
import { readPatch } from "../../src/dispatcher/codex-dispatcher";
import { addedLines, judged, type Change, type ClaudeEdit, type CodexHunk, type Replacement } from "../../src/dispatcher/forbid";
import type { Harness } from "../../src/dispatcher/harness";
import { loadBodies } from "../../src/bodies/bodies";
import { dormantRules, loadSelection, profilesOf, selected } from "../../src/bodies/selection";
import { run } from "../lib/dispatch";
import { valueOf } from "../lib/effect";

const repo = new URL("../../", import.meta.url).pathname;

const forbidding: Index = {
  harness: "pi",
  rules: [{ name: "comment-discipline", triggers: [{ predicate: "always" }], text: "# Comments\n", forbid: "comments" }],
  profiles: [],
  hub: [],
};

const DIRECTIVE = "// @ts-expect-error the types are wrong";

type Written = { path: string; before?: string; inRepository?: string | null } & ({ content: string } | { edits: readonly Replacement[] });

const lazily = (written: Written): Change => {
  const { before, inRepository, ...change } = written;
  const located = inRepository === null ? undefined : (inRepository ?? change.path);
  return { ...change, before: { text: () => before, inRepository: () => located } };
};

const writing = (...written: Written[]): Event => ({
  type: "tool-call",
  tool: "write",
  input: {},
  writes: written.map((change) => change.path),
  changes: written.map(lazily),
});

const refusals = (actions: readonly Action[]) => actions.flatMap((a) => (a.type === "refuse" ? [a] : []));

describe("a write carrying what a Rule forbids", () => {
  test("is refused before it lands, naming the file, the line, the token and what to do instead", () => {
    const { actions } = run(forbidding, [writing({ path: "src/a.ts", content: `const a = 1;\n${DIRECTIVE}\nconst b: string = a;\n` })]);
    const [refused] = refusals(actions);
    expect(refused?.rule).toBe("comment-discipline");
    expect(refused?.text).toContain("src/a.ts:2 carries the machine-read directive `@ts-expect-error`");
    expect(refused?.text, "the refusal says what is wrong and not what to do about it").toContain(
      "Fix what the tool is reporting, or stop running the tool on this file",
    );
  });

  test("is refused every time it comes, because a refusal records nothing", () => {
    const again = writing({ path: "src/a.ts", content: `${DIRECTIVE}\n` });
    const { actions, state } = run(forbidding, [again, again, again]);
    expect(refusals(actions)).toHaveLength(3);
    expect(state.rules, "the refusal was counted as the Rule arriving, which would let the next write through").toEqual({});
  });

  test("names every refusal the kit's matchers make, a record pointer and a doc block among them", () => {
    const content = ["/** Adds. */", "export const add = 1; // see ADR-0007", ""].join("\n");
    const [refused] = refusals(run(forbidding, [writing({ path: "src/add.ts", content })]).actions);
    expect(refused?.text).toContain("src/add.ts:1 opens a doc block");
    expect(refused?.text).toContain('src/add.ts:2 points at a record or a ticket ("ADR-0007")');
  });

  test("is let through where the project switched the Rule off, and refused where it did not", () => {
    const written = writing({ path: "src/a.ts", content: `${DIRECTIVE}\n` });
    const project = (off: string[]): Event => ({ type: "prompt", project: { path: "/work/package.json", declares: [], on: [], off } });
    expect(refusals(run(forbidding, [project(["comment-discipline"]), written]).actions)).toEqual([]);
    expect(refusals(run(forbidding, [project([]), written]).actions)).toHaveLength(1);
  });

  test("is refused by the Rule that forbids it and by no other", () => {
    const quiet: Index = { ...forbidding, rules: forbidding.rules.map(({ forbid: _forbid, ...rule }) => rule) };
    const { actions } = run(quiet, [writing({ path: "src/a.ts", content: `${DIRECTIVE}\n` })]);
    expect(refusals(actions)).toEqual([]);
  });

  test("the dispatch log carries each refusal", () => {
    const [refused = expect.unreachable("nothing was refused")] = refusals(
      run(forbidding, [writing({ path: "src/a.ts", content: `${DIRECTIVE}\n` })]).actions,
    );
    expect(logLine(refused)).toMatch(/^refuse comment-discipline: src\/a\.ts:1 carries the machine-read directive/);
  });
});

describe("a write to a doc carrying a separator the kit's prose matchers refuse", () => {
  const proseForbidding: Index = {
    ...forbidding,
    rules: [{ name: "writing-for-people", triggers: [{ predicate: "always" }], text: "# People\n", forbid: "prose" }],
  };
  const DASHED = "It builds \u2014 and then it ships.\n";
  const refusedFor = (...written: Written[]) => refusals(run(proseForbidding, [writing(...written)]).actions);

  test("is refused before it lands in a people doc, naming the character and saying to end the sentence or use a comma", () => {
    const [refused] = refusedFor({ path: "docs/guide.md", content: `# Guide\n\n${DASHED}` });
    expect(refused?.rule).toBe("writing-for-people");
    expect(refused?.text).toContain("docs/guide.md:3 carries `\u2014`, an em dash. End the sentence, or use a comma");
  });

  test.each([
    ["an en dash", "It builds \u2013 and ships."],
  ])("is refused for %s as the kit's docs gate refuses it", (refuses, line) => {
    const [refused] = refusedFor({ path: "README.md", content: `${line}\n` });
    expect(refused?.text).toContain(`README.md:1 carries`);
    expect(refused?.text).toContain(refuses);
  });

  test.each(["docs/adr/0001-a-record.md"])(
    "is let into %s, which the kit's docs gate does not judge",
    (path) => {
      expect(refusedFor({ path, content: DASHED })).toEqual([]);
    },
  );

  test("names the doc by its path in the repository, as the kit's docs gate does, however the harness named it", () => {
    const [refused] = refusedFor({ path: "/work/project/docs/guide.md", inRepository: "docs/guide.md", content: DASHED });
    expect(refused?.text).toContain("docs/guide.md:1 carries `\u2014`");
    expect(refused?.text).not.toContain("/work/project");
  });

  test("is let into a doc no repository holds, which no docs gate can judge", () => {
    expect(refusedFor({ path: "/tmp/README.md", inRepository: null, content: DASHED })).toEqual([]);
  });

  test("a separator the doc already held is carried over, and an edit is refused for the lines it adds and nothing else", () => {
    const before = `# Guide\n\n${DASHED}\nIt runs.\n`;
    expect(refusedFor({ path: "docs/guide.md", before, edits: [{ old: "It runs.", new: "It runs fast." }] })).toEqual([]);
    const [refused] = refusedFor({ path: "docs/guide.md", before, edits: [{ old: "It runs.", new: "It runs \u2014 fast." }] });
    expect(refused?.text).toContain("docs/guide.md:5 carries `\u2014`");
  });
});

describe("what a write is judged on", () => {
  const held = `import { x } from "./x";\n${DIRECTIVE}\nexport const y = x;\n`;

  test("a comment the file already held is carried over, and a write is refused for what it adds and nothing else", () => {
    const rewrite = writing({ path: "src/a.ts", before: held, content: `${held}export const z = 2;\n` });
    expect(refusals(run(forbidding, [rewrite]).actions)).toEqual([]);
  });

  test("an edit is placed in the file as it stands, and the refusal names the line it lands on", () => {
    const edit = writing({ path: "src/b.ts", before: "one();\ntwo();\nthree();\n", edits: [{ old: "two();", new: `two();\n${DIRECTIVE}` }] });
    const [refused] = refusals(run(forbidding, [edit]).actions);
    expect(refused?.text).toContain("src/b.ts:3 carries the machine-read directive");
  });

  test("an edit elsewhere in a file holding a banned comment is not refused for it", () => {
    const edit = writing({ path: "src/a.ts", before: held, edits: [{ old: "export const y = x;", new: "export const y = x + 1;" }] });
    expect(refusals(run(forbidding, [edit]).actions)).toEqual([]);
  });

  test("an edit that replaces every copy is judged on every copy it makes", () => {
    const before = "a();\nb();\na();\n";
    const verdict = judged("comments", "pi", lazily({ path: "src/c.ts", before, edits: [{ old: "a();", new: "a(); // #12", all: true }] }));
    expect("refusals" in verdict && verdict.refusals.map((one) => one.split(" ")[0])).toEqual(["src/c.ts:1", "src/c.ts:3"]);
  });

  test("a file the matchers do not read is never refused, whatever it carries", () => {
    for (const path of ["README.md", "notes", "src/a.constructor"]) {
      const { actions } = run(forbidding, [writing({ path, content: `${DIRECTIVE}\n/** doc */\n` })]);
      expect(refusals(actions), path).toEqual([]);
    }
  });

  test("a file with CRLF endings rewritten with LF is refused for nothing it carries over", () => {
    const crlf = held.replaceAll("\n", "\r\n");
    const rewrite = writing({ path: "src/a.ts", before: crlf, content: `${held}export const z = 2;\n` });
    expect(refusals(run(forbidding, [rewrite]).actions)).toEqual([]);
  });

  test("an edit written with LF is placed in a file with CRLF endings", () => {
    const before = "one();\r\ntwo();\r\nthree();\r\n";
    const verdict = judged("comments", "pi", lazily({ path: "src/b.ts", before, edits: [{ old: "one();\ntwo();", new: `one();\n${DIRECTIVE}` }] }));
    expect("refusals" in verdict && verdict.refusals.map((one) => one.split(" ")[0])).toEqual(["src/b.ts:2"]);
  });

  test("every edit is placed in the file as it stands, not in what an earlier edit made of it", () => {
    const edits = [
      { old: "a();", new: "b();" },
      { old: "b();", new: "b(); // #7" },
    ];
    const verdict = judged("comments", "pi", lazily({ path: "src/d.ts", before: "a();\nb();\n", edits }));
    expect("refusals" in verdict && verdict.refusals.map((one) => one.split(" ")[0])).toEqual(["src/d.ts:2"]);
  });

  test("edits with the same old text land in order, each after the one before, as Codex places a patch's hunks", () => {
    const before = "f();\nreturn null;\ng();\nreturn null;\n";
    const edits = [
      { old: "return null;", new: "return x;" },
      { old: "return null;", new: `${DIRECTIVE}\nreturn y;` },
    ];
    const verdict = judged("comments", "codex", lazily({ path: "src/e.ts", before, edits }));
    expect("refusals" in verdict && verdict.refusals.map((one) => one.split(" ")[0])).toEqual(["src/e.ts:4"]);
  });

  test("an edit with no old text in a file that stands is added at its end, as Codex adds a hunk with no context", () => {
    for (const before of ["run();\n", "run();"]) {
      const verdict = judged("comments", "codex", lazily({ path: "src/f.ts", before, edits: [{ old: "", new: DIRECTIVE }] }));
      expect("refusals" in verdict && verdict.refusals.map((one) => one.split(" ")[0]), JSON.stringify(before)).toEqual(["src/f.ts:2"]);
    }
  });

  test("edits that overlap in the file are logged as unread", () => {
    const edits = [
      { old: "a();\nb();", new: "" },
      { old: "b();", new: DIRECTIVE },
    ];
    const { actions } = run(forbidding, [writing({ path: "src/d.ts", before: "a();\nb();\n", edits })]);
    expect(actions.map(logLine)).toEqual([
      "unjudged comment-discipline: two edits to src/d.ts overlap in the file as it stands, so what it adds went unread",
    ]);
  });

  test("a Claude Code edit with no old text creates a file that was not there, and is judged as the whole of it", () => {
    const created = writing({ path: "src/new.ts", edits: [{ old: "", new: `run();\n${DIRECTIVE}\n` }] });
    const [refused] = refusals(run({ ...forbidding, harness: "claude-code" }, [created]).actions);
    expect(refused?.text).toContain("src/new.ts:2 carries the machine-read directive `@ts-expect-error`");
  });

  test("an edit that matches nothing in the file is logged as unread rather than refused or passed in silence", () => {
    const stray = writing({ path: "src/a.ts", before: held, edits: [{ old: "not in the file", new: DIRECTIVE }] });
    const { actions } = run(forbidding, [stray]);
    expect(refusals(actions)).toEqual([]);
    expect(actions.map(logLine)).toEqual([
      "unjudged comment-discipline: an edit to src/a.ts matches nothing in the file as it stands, so what it adds went unread",
    ]);
  });

  describe("an edit the harness places by a looser reading than its exact text", () => {
    const loosely = (harness: Harness, before: string, old: string): readonly Action[] =>
      run({ ...forbidding, harness }, [writing({ path: "src/g.ts", before, edits: [{ old, new: `${old}\n${DIRECTIVE}` }] })]).actions;
    const refusedAt = (actions: readonly Action[]) => refusals(actions).map((one) => one.why.split(" ")[0]);
    const unread = "unjudged comment-discipline: an edit to src/g.ts matches nothing in the file as it stands, so what it adds went unread";
    const trailing = "one(); \ntwo();\nthree();\n";

    test("is refused on pi, which strips the space a line ends with before it matches", () => {
      expect(refusedAt(loosely("pi", trailing, "one();\ntwo();"))).toEqual(["src/g.ts:3"]);
    });

    test("is refused on Codex, which matches a hunk's lines with the space they end with trimmed", () => {
      expect(refusedAt(loosely("codex", trailing, "one();\ntwo();"))).toEqual(["src/g.ts:3"]);
    });

    test("is logged as unread on Claude Code, whose Edit does not trim a line and would not land it", () => {
      expect(loosely("claude-code", trailing, "one();\ntwo();").map(logLine)).toEqual([unread]);
    });

    test("is refused on Claude Code when the file's curly quotes are what the old text spells straight", () => {
      expect(refusedAt(loosely("claude-code", "say(\u201Chi\u201D);\nrun();\n", 'say("hi");\nrun();'))).toEqual(["src/g.ts:3"]);
    });

    test("on Codex, is placed only on whole lines, never on the same text inside an earlier line", () => {
      const before = 'const s = "{}";\nfunction f() {\n  run();\n}\n';
      const hunk = writing({ path: "src/g.ts", before, edits: [{ old: "}", new: "}\n// @ts-ignore\nfoo();" }] });
      expect(refusedAt(run({ ...forbidding, harness: "codex" }, [hunk]).actions)).toEqual(["src/g.ts:5"]);
    });

    test("on Codex, is placed as Codex places a hunk whose patch ends in a blank line, without that line", () => {
      const { changes } = readPatch("*** Begin Patch\n*** Update File: src/g.ts\n@@\n foo();\n+// @ts-ignore\n+bar();\n\n*** End Patch");
      const hunk = writing(...changes.map((change) => ({ ...change, before: "x();\nfoo();\n" })));
      expect(refusedAt(run({ ...forbidding, harness: "codex" }, [hunk]).actions)).toEqual(["src/g.ts:3"]);
    });

    test("on Codex, is placed at the end of the file when its patch marks the hunk as ending there", () => {
      const { changes } = readPatch("*** Begin Patch\n*** Update File: src/g.ts\n@@\n foo();\n+// @ts-ignore\n*** End of File\n*** End Patch");
      const hunk = writing(...changes.map((change) => ({ ...change, before: "const s = `\nfoo();\n`;\nfoo();\n" })));
      expect(refusedAt(run({ ...forbidding, harness: "codex" }, [hunk]).actions)).toEqual(["src/g.ts:5"]);
    });

    const inB = (before: string) => {
      const { changes } = readPatch("*** Begin Patch\n*** Update File: src/g.ts\n@@ function b() {\n-  return 1;\n+  // @ts-ignore\n+  return 1;\n*** End Patch");
      return run({ ...forbidding, harness: "codex" }, [writing(...changes.map((change) => ({ ...change, before })))]).actions;
    };

    test("on Codex, is placed after the line its hunk's `@@` context names, not at an earlier copy of its old text", () => {
      expect(refusedAt(inB("const fixture = `\n  return 1;\n`;\nfunction b() {\n  return 1;\n}\n"))).toEqual(["src/g.ts:5"]);
    });

    test("on Codex, is logged as unread when its hunk's `@@` context is missing, or its old text stands only before it", () => {
      for (const before of ["function a() {\n  return 1;\n}\n", "function a() {\n  return 1;\n}\nfunction b() {\n}\n"]) {
        expect(inB(before).map(logLine), before).toEqual([unread]);
      }
    });

    test("on Codex, is not placed inside a template literal that holds the old line's text", () => {
      const before = "const s = `x foo();\n`;\nfoo();\n";
      const hunk = writing({ path: "src/g.ts", before, edits: [{ old: "foo();", new: "foo(); // @ts-ignore" }] });
      expect(refusedAt(run({ ...forbidding, harness: "codex" }, [hunk]).actions)).toEqual(["src/g.ts:3"]);
    });

    test("is placed by the readings its own harness tries and by no other's", () => {
      const indented = "  one();\n  two();\n";
      expect(refusedAt(loosely("codex", indented, "one();\ntwo();"))).toEqual(["src/g.ts:3"]);
      expect(loosely("pi", indented, "one();\ntwo();").map(logLine)).toEqual([unread]);
    });

    const rewriting = (harness: Harness, before: string, old: string, now: string): readonly Action[] =>
      run({ ...forbidding, harness }, [writing({ path: "src/g.ts", before, edits: [{ old, new: now }] })]).actions;

    test("is not refused for a comment the file already held on a line it does not touch", () => {
      expect(refusals(rewriting("pi", `${DIRECTIVE}\none(); \ntwo();\n`, "one();\ntwo();", "one();\ntwo(1);"))).toEqual([]);
    });

    test("on pi, is not refused for a comment its old text carries over from a line ending in a space", () => {
      const before = `${DIRECTIVE} \nfoo();\nbar();\n`;
      expect(refusals(rewriting("pi", before, `${DIRECTIVE}\nfoo();`, `${DIRECTIVE}\nfoo(1);`))).toEqual([]);
    });

    test("on Codex, is not refused for a comment a hunk's context carries over from a line ending in a space", () => {
      const before = `${DIRECTIVE} \nfoo();\n`;
      expect(refusals(rewriting("codex", before, `${DIRECTIVE}\nfoo();`, `${DIRECTIVE}\nfoo(1);`))).toEqual([]);
    });

    test("on Claude Code, is not refused for a comment it carries over with its quotes curled another way", () => {
      const before = "f(\u201Dx\u201D); // @ts-ignore\nrun();\n";
      expect(refusals(rewriting("claude-code", before, 'f("x"); // @ts-ignore\nrun();', 'f("x"); // @ts-ignore\nrun(1);'))).toEqual([]);
    });

    const adding = (harness: Harness, before: string, old: string, line: string): readonly Action[] =>
      run({ ...forbidding, harness }, [writing({ path: "src/g.ts", before, edits: [{ old, new: `${old}\n${line}` }] })]).actions;
    const apostrophe = "const apos = '\u2019';\n";

    test("is judged with the lines it does not touch as the harness leaves them, so a quote they hold still reads as one", () => {
      const before = `${apostrophe}one(); \ntwo();\nconst t = 'x';\n`;
      expect(refusedAt(adding("pi", before, "one();\ntwo();", "// @ts-ignore"))).toEqual(["src/g.ts:4"]);
    });

    test("is not refused for a string the lines it does not touch leave closed", () => {
      const before = `${apostrophe}one(); \ntwo();\n`;
      expect(refusals(adding("pi", before, "one();\ntwo();", "const s = 'x // @ts-ignore';"))).toEqual([]);
    });

    test("on Codex, is judged with the lines its punctuation reading does not touch as they were", () => {
      const before = `${apostrophe}say(\u201Chi\u201D);\nconst t = 'x';\n`;
      expect(refusedAt(adding("codex", before, 'say("hi");', "// @ts-ignore"))).toEqual(["src/g.ts:3"]);
    });

    test("on Claude Code, is judged with its quotes curled as the text it matched, as its Edit writes them", () => {
      const before = "say(\u201Chi\u201D);\nrun();\n";
      expect(refusedAt(adding("claude-code", before, 'say("hi");', 'const s = "x // @ts-ignore";'))).toEqual(["src/g.ts:2"]);
    });
  });

  test("an edit to a file that could not be read is logged the same way", () => {
    const { actions } = run(forbidding, [writing({ path: "src/gone.ts", edits: [{ old: "a", new: DIRECTIVE }] })]);
    expect(actions.map(logLine)).toEqual([
      "unjudged comment-discipline: src/gone.ts could not be read to place an edit in, so what it adds went unread",
    ]);
  });
});

describe("the lines an edit is judged to add", () => {
  const harnesses: readonly Harness[] = ["pi", "claude-code", "codex"];
  const editing = (harness: Harness, before: string, old: string, now: string): readonly Action[] =>
    run({ ...forbidding, harness }, [writing({ path: "src/g.ts", before, edits: [{ old, new: now }] })]).actions;

  test("are the ones it wrote, not a copy the file holds elsewhere in a string", () => {
    const before = "run();\nconst fixture = `\n// @ts-ignore\n`;\n";
    for (const harness of harnesses) {
      const refused = refusals(editing(harness, before, "run();", "// @ts-ignore\nrun();"));
      expect(refused.map((one) => one.why.split(" ")[0]), harness).toEqual(["src/g.ts:1"]);
    }
  });

  test("never include a comment the file already held, when the edit writes its text into a string", () => {
    const before = "foo();\n// @ts-ignore\nbar();\n";
    for (const harness of harnesses) {
      expect(refusals(editing(harness, before, "foo();", "const s = `\n// @ts-ignore\n`;\nfoo();")), harness).toEqual([]);
    }
  });
});

describe("an edit its harness would refuse to apply", () => {
  const editing = (harness: Harness, before: string | undefined, edit: Replacement): readonly Action[] =>
    run({ ...forbidding, harness }, [writing({ path: "src/g.ts", ...(before === undefined ? {} : { before }), edits: [edit] })]).actions;
  const unread = (why: string) => [`unjudged comment-discipline: an edit to src/g.ts ${why}, so what it adds went unread`];

  test("is logged as unread on pi and Claude Code when its old text stands more than once and it does not replace every copy", () => {
    const edit = { old: "run();", new: "// @ts-ignore\nrun();" };
    for (const harness of ["pi", "claude-code"] as const) {
      for (const before of ["const s = `\nrun();\n`;\nrun();\n", "run();\nconst s = `\nrun();\n`;\n"]) {
        expect(editing(harness, before, edit).map(logLine), `${harness} ${before}`).toEqual(unread("matches more than one place in the file as it stands"));
      }
    }
    expect(refusals(editing("claude-code", "run();\nrun();\n", { ...edit, all: true })).map((one) => one.why.split(" ")[0])).toEqual(["src/g.ts:1"]);
  });

  test("is logged as unread on pi when its old text is empty, since pi only edits a file that stands and never on no text", () => {
    for (const before of [undefined, "", "run();\n"]) {
      expect(editing("pi", before, { old: "", new: DIRECTIVE }).map(logLine), String(before)).toEqual(
        before === undefined ? ["unjudged comment-discipline: src/g.ts could not be read to place an edit in, so what it adds went unread"] : unread("has no old text to find"),
      );
    }
  });

  test("is logged as unread on Claude Code when its old text is empty and the file already holds something", () => {
    expect(editing("claude-code", "run();\n", { old: "", new: DIRECTIVE }).map(logLine)).toEqual(unread("has no old text to find"));
    expect(refusals(editing("claude-code", "", { old: "", new: DIRECTIVE })).map((one) => one.why.split(" ")[0])).toEqual(["src/g.ts:1"]);
  });
});

describe("a Codex hunk", () => {
  const patched = (patch: string, before: string): readonly Action[] => {
    const { changes } = readPatch(`*** Begin Patch\n*** Update File: src/g.ts\n${patch}\n*** End Patch`);
    return run({ ...forbidding, harness: "codex" }, [writing(...changes.map((change) => ({ ...change, before })))]).actions;
  };

  test("that only removes lines removes them whole, so a later hunk is judged on the line Codex lands it on", () => {
    const actions = patched("@@\n-import b from 'b';\n@@\n+// @ts-ignore\n run();", "import a from 'a';\nimport b from 'b';\n\nrun();\n");
    expect(refusals(actions).map((one) => one.why.split(" ")[0])).toEqual(["src/g.ts:3"]);
  });

  test("whose only old line is blank is sought as that blank line, not added at the end of the file", () => {
    expect(refusals(patched("@@\n-\n+// @ts-ignore", "run();\n\ngo();\n")).map((one) => one.why.split(" ")[0])).toEqual(["src/g.ts:2"]);
    expect(patched("@@\n-\n+// @ts-ignore", "const s = `\n\n`;\nrun();\n").map(logLine)).toEqual([]);
  });
});

describe("a Replacement in either variant", () => {
  const refusedAt = (actions: readonly Action[]): Array<string | undefined> =>
    refusals(actions).map((one) => one.why.split(" ")[0]);

  test("a Claude edit replaces every copy only when it says all", () => {
    const replacing = (edit: ClaudeEdit): readonly Action[] =>
      run({ ...forbidding, harness: "pi" }, [writing({ path: "src/g.ts", before: "run();\nrun();\n", edits: [edit] })]).actions;
    const [refusal] = refusals(replacing({ old: "run();", new: `run();\n${DIRECTIVE}`, all: true }));
    expect(refusal?.why.split("; ").map((one) => one.split(" ")[0])).toEqual(["src/g.ts:2", "src/g.ts:4"]);
    expect(replacing({ old: "run();", new: `run();\n${DIRECTIVE}`, all: false }).map(logLine)).toEqual([
      "unjudged comment-discipline: an edit to src/g.ts matches more than one place in the file as it stands, so what it adds went unread",
    ]);
  });

  test("a Codex hunk lands after its context, or at the end when it says so", () => {
    const placing = (before: string, edit: CodexHunk): readonly Action[] =>
      run({ ...forbidding, harness: "codex" }, [writing({ path: "src/g.ts", before, edits: [edit] })]).actions;
    const contextual = { old: "  return 1;\n", new: "  // @ts-ignore\n  return 1;\n", context: "function b() {" };
    const ending = { old: "foo();\n", new: "foo();\n// @ts-ignore\n", atEnd: true };
    expect(refusedAt(placing("const fixture = `\n  return 1;\n`;\nfunction b() {\n  return 1;\n}\n", contextual))).toEqual(["src/g.ts:5"]);
    expect(refusedAt(placing("const s = `\nfoo();\n`;\nfoo();\n", ending))).toEqual(["src/g.ts:5"]);
  });
});

describe("the file a write lands in", () => {
  test("is read only once a Rule forbids something and its matcher reads that path", () => {
    const reads: string[] = [];
    const at = (path: string): Change => ({
      path,
      before: {
        text: () => {
          reads.push(path);
          return "run();\n";
        },
        inRepository: () => {
          reads.push(`${path} in its repository`);
          return path;
        },
      },
      edits: [{ old: "run();", new: "go();" }],
    });
    const event = (change: Change): Event => ({ type: "tool-call", tool: "edit", input: {}, writes: [change.path], changes: [change] });
    const unforbidding: Index = { ...forbidding, rules: [{ name: "comment-discipline", triggers: [{ predicate: "always" }], text: "# Comments\n" }] };
    run(forbidding, [event(at("notes.md")), event(at("package.json"))]);
    run(unforbidding, [event(at("src/a.ts"))]);
    expect(reads, "a file was read that nothing would judge").toEqual([]);
    run(forbidding, [event(at("src/a.ts"))]);
    expect(reads).toEqual(["src/a.ts"]);
    reads.length = 0;
    const prose: Index = { ...forbidding, rules: [{ name: "writing-for-people", triggers: [{ predicate: "always" }], text: "# People\n", forbid: "prose" }] };
    run(prose, [event(at("src/a.ts")), event(at("docs/guide.md"))]);
    expect(reads).toEqual(["src/a.ts in its repository", "docs/guide.md in its repository", "docs/guide.md"]);
  });
});

describe("the lines a write adds", () => {
  test("a line counts once for each copy of it the file did not already hold", () => {
    expect([...addedLines("a\nb\n", "a\nb\nb\nc\n")]).toEqual([3, 4]);
  });

  test("every line of a new file is added", () => {
    expect([...addedLines(undefined, "a\nb")]).toEqual([1, 2]);
  });

  test("a line is the same line whatever its ending", () => {
    expect([...addedLines("a\r\nb\r\n", "a\nb\nc\n")]).toEqual([3]);
  });

  test("lines that only moved are not added", () => {
    expect([...addedLines("a\nb\nc", "c\na\nb")]).toEqual([]);
  });
});

const checkedIn = await valueOf(
  Effect.gen(function* () {
    const bodies = yield* loadBodies(repo);
    const selection = yield* loadSelection(repo);
    const chosen = selected(bodies, selection);
    return yield* indexFor("pi", chosen, yield* profilesOf(chosen, selection), dormantRules(bodies, chosen));
  }),
);

describe("the checked-in comment-discipline", () => {
  test("refuses a write carrying a banned comment, before any prompt has put it in force", () => {
    const { actions } = run(checkedIn, [{ type: "session-start" }, writing({ path: "src/a.ts", content: `${DIRECTIVE}\n` })]);
    expect(refusals(actions).map((a) => a.rule)).toEqual(["comment-discipline"]);
  });

  test("lets a write carrying the two comments it keeps through", () => {
    const content = "// A Set drops the duplicate the caller counts on.\nconst seen = new Set<string>();\n";
    expect(refusals(run(checkedIn, [writing({ path: "src/a.ts", content })]).actions)).toEqual([]);
  });
});

describe("the checked-in writing-for-people", () => {
  const DASHED = "It builds — and then it ships.\n";

  test("refuses a write adding an em dash to a people doc, though the Selection leaves the Rule's text off", () => {
    const { actions } = run(checkedIn, [{ type: "session-start" }, writing({ path: "docs/guide.md", content: DASHED })]);
    expect(refusals(actions).map((a) => a.rule)).toEqual(["writing-for-people"]);
    expect(actions.filter((a) => a.type === "inject" || a.type === "deliver")).toEqual([]);
  });

  test("a project switching it off lets the same write through", () => {
    const off: Event = { type: "prompt", project: { path: "/work/package.json", declares: [], on: [], off: ["writing-for-people"] } };
    const { actions } = run(checkedIn, [{ type: "session-start" }, off, writing({ path: "docs/guide.md", content: DASHED })]);
    expect(refusals(actions)).toEqual([]);
    expect(actions.map(logLine)).toContain("switched writing-for-people off: /work/package.json switches it off");
  });

  test.each(["docs/adr/0001-a-record.md"])("lets the same write into %s", (path) => {
    expect(refusals(run(checkedIn, [writing({ path, content: DASHED })]).actions)).toEqual([]);
  });
});
