import { afterAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { mkdir, readdir, readlink, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { KIND_DIRS, KINDS, LIBRARY, SKILL_FILE, dirOf, type Body, type Harness, type Kind } from "../../src/bodies/bodies";
import { DISPATCHERS, active, checkout, drift, generated, write } from "../../src/generate/generate";
import { hub, hubUnder } from "../../src/generate/hub";
import { filesUnder } from "../../src/platform/files";
import {
  CLAUDE_BUNDLE,
  CODEX_BUNDLE,
  ENTRY,
  INDEX,
  KIT_COMMENTS,
  KIT_PROSE,
  PI_BUNDLE,
  bundle,
  packageImports,
  runtimeImports,
  sourcePath,
  type Bundle,
} from "../../src/generate/bundle";
import { indexBytes, indexFor } from "../../src/generate/dispatch-index";
import { SELECTION_PATH, selected, type Selection } from "../../src/bodies/selection";
import { undeclared } from "../lib/harness-names";
import { dangling } from "../lib/body-names";
import { failureOf, said, saidBy, value, valueOf } from "../lib/effect";
import { GENERATED_ROOT, HUB } from "../lib/generated-root";
import { bodies, repo, selection } from "../lib/tree";
import { closeSessions, load } from "../lib/pi";

// Each test generates or bundles a tree, which a loaded machine slows past bun's 5s default.
setDefaultTimeout(30_000);

afterAll(closeSessions);

const pi: Harness = "pi";
const piDispatcher = DISPATCHERS.find((d) => d.harness === "pi") ?? expect.unreachable("no Dispatcher is built for pi");

const rootOf = (spec: Bundle): string => `${GENERATED_ROOT}/${spec.dir}`;

const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

const sourceCopy = async (prefix: string): Promise<string> => {
  const sandbox = `${mkdtempSync(join(tmpdir(), prefix))}/`;
  for (const dir of [LIBRARY, SELECTION_PATH, "src"]) {
    cpSync(`${repo}${dir}`, `${sandbox}${dir}`, { recursive: true });
  }
  await symlink(`${repo}node_modules`, `${sandbox}node_modules`, "dir");
  return sandbox;
};

const discard = (sandbox: string): void => {
  rmSync(`${sandbox}node_modules`, { force: true });
  rmSync(sandbox, { recursive: true, force: true });
};

const byName = (name: string, kind?: Kind) =>
  bodies.find((b) => b.name === name && (kind === undefined || b.kind === kind)) ?? expect.unreachable(`no Body ${name} in the tree`);
const emittedAt = (emitted: ReadonlyMap<string, Uint8Array>, dest: string) =>
  emitted.get(dest) ?? expect.unreachable(`${dest} was not emitted`);

describe("the Bodies tree", () => {
  test("each domain holds a directory for every Kind, whether or not it has Bodies of it", async () => {
    const domains = await readdir(`${repo}${LIBRARY}`);
    expect(domains.length, `${LIBRARY}/ holds no domain`).toBeGreaterThan(0);
    for (const domain of domains) {
      expect((await readdir(`${repo}${LIBRARY}/${domain}`)).toSorted(), `${LIBRARY}/${domain}`).toEqual(KINDS.map((k) => KIND_DIRS[k]).toSorted());
    }
  });

  test("a Body's domain and Kind are readable from its directory alone", () => {
    expect(bodies.length, "the tree is empty, so this proves nothing").toBeGreaterThan(0);
    for (const body of bodies) {
      expect(dirOf(body), `${body.name} is a ${body.kind}`).toStartWith(`${LIBRARY}/${body.domain}/${KIND_DIRS[body.kind]}/`);
    }
  });

  test("the seeded tree proves a Rule and a Reference make it through", () => {
    const kinds = new Set(bodies.map((b) => b.kind));
    for (const kind of ["rule", "reference"] as const) {
      expect(kinds.has(kind), `the tree holds no ${kind}`).toBe(true);
    }
  });
});

describe("the Hub", () => {
  const links = value(hub(bodies));
  const reached = bodies.filter((b) => b.kind === "skill" || b.kind === "reference");

  test("it is a flat directory, one entry per Body a harness reaches by name", () => {
    expect([...links.keys()].sort()).toEqual(reached.map((b) => b.name).sort());
  });

  test("an entry is the Body's own directory, so the Hub holds no second copy of anything", async () => {
    expect(reached.length, "the tree holds no Body a harness reaches by name, so this proves nothing").toBeGreaterThan(0);
    for (const body of reached) {
      expect(links.get(body.name), dirOf(body)).toBe(dirOf(body));
      expect(await Bun.file(`${repo}${links.get(body.name)}/${SKILL_FILE}`).text()).toBe(body.skill);
    }
  });

  test("a Rule is in no Hub, because the Dispatcher injects it rather than offering it by name", () => {
    const rules = bodies.filter((b) => b.kind === "rule");
    expect(rules.length, "the tree holds no Rule, so this proves nothing").toBeGreaterThan(0);
    for (const body of rules) expect(links.has(body.name), dirOf(body)).toBe(false);
  });

  test("a Rule and a Skill sharing a name abort, although only one of them reaches the Hub", () => {
    const clash: Body = { ...byName("writing-for-people"), kind: "skill" };
    expect(said(hub([...bodies, clash]))).toMatch(/writing-for-people.*rules\/writing-for-people.*skills\/writing-for-people/);
  });

  test("one Hub serves every harness, so a harness-exclusive Body is offered to all of them", () => {
    const exclusive = (harnesses: Harness[]): Body => ({ ...byName("unslop"), kind: "skill", name: "harness-bound", harnesses });
    for (const harnesses of [["pi"], ["claude-code"], ["codex"]] as Harness[][]) {
      expect(
        value(hub([exclusive(harnesses)])).has("harness-bound"),
        `a Body targeting ${harnesses.join(", ")} is filtered at the Hub, which one shared root cannot do`,
      ).toBe(true);
    }
  });
});

describe("the dispatch index", () => {
  const index = value(indexFor(pi, bodies));
  const rules = bodies.filter((b) => b.kind === "rule");

  test("it holds every Rule the harness receives, and only Rules", () => {
    expect(index.rules.map((r) => r.name)).toEqual(rules.map((b) => b.name));
  });

  test("a Rule that does not target the harness is absent from its index", () => {
    const elsewhere: Body = { ...byName("writing-for-people"), name: "harness-bound", harnesses: ["claude-code"] };
    expect(value(indexFor(pi, [...bodies, elsewhere])).rules.map((r) => r.name)).not.toContain("harness-bound");
  });

  test("every trigger arrives parsed, so no runtime hook parses YAML", () => {
    expect(index.rules.length, "the tree holds no Rules, so this proves nothing").toBeGreaterThan(0);
    for (const indexed of index.rules) {
      expect(indexed.triggers, indexed.name).toBeArray();
      for (const trigger of indexed.triggers) expect(trigger.predicate, indexed.name).toBeString();
    }
  });

  test("it carries what a Rule forbids, and nothing for a Rule that forbids nothing", () => {
    for (const indexed of index.rules) {
      const body = byName(indexed.name);
      expect(indexed.forbid, indexed.name).toBe(body.kind === "rule" ? body.forbid : undefined);
    }
    expect(index.rules.find((r) => r.name === "comment-discipline")?.forbid).toBe("comments");
    expect(index.rules.find((r) => r.name === "writing-for-people")?.forbid).toBe("prose");
    expect(index.rules.filter((r) => "forbid" in r).map((r) => r.name)).toEqual(["comment-discipline", "writing-for-people"]);
  });

  test("it carries each Rule's whole text, so injection cannot hold a pointer", () => {
    for (const indexed of index.rules) {
      const body = byName(indexed.name);
      expect(body.skill, `${indexed.name} lost text on the way to the index`).toEndWith(indexed.text);
      expect(indexed.text.length, indexed.name).toBeGreaterThan(0);
    }
  });

  test("the frontmatter is off the text, because a model should not be reading it", () => {
    for (const indexed of index.rules) {
      expect(indexed.text, `${indexed.name} carried its frontmatter into the index`).not.toInclude("kind: rule");
      expect(indexed.text, indexed.name).not.toStartWith("---");
    }
  });

  test("a Body that is frontmatter and nothing else aborts, naming it", () => {
    const hollow: Body = { ...byName("writing-for-people"), skill: byName("writing-for-people").skill.split("\n---\n")[0] + "\n---\n" };
    expect(said(indexFor(pi, [hollow]))).toMatch(/rules\/writing-for-people/);
  });

  test("a Body omitted from every profile is not selected", () => {
    const off: Selection = { profiles: selection.profiles.map((profile) => ({ ...profile, rules: [] })), defaultModels: selection.defaultModels };
    expect(selected(bodies, off).filter((body) => body.kind === "rule")).toEqual([]);
  });

  test("the index is emitted inside the Dispatcher its emitter carries, under the generated root", async () => {
    const emitted = await valueOf(generated(repo));
    for (const { bundle: spec } of DISPATCHERS) expect(emitted.has(`${rootOf(spec)}/${INDEX}`), spec.dir).toBe(true);
  });

  test("it is written as indented JSON, so a change to what fires is a readable diff", () => {
    const written = decode(indexBytes(index));
    expect(JSON.parse(written)).toEqual(index);
    expect(written).toEndWith("\n");
    expect(written.split("\n").length, "the index was written as one line").toBeGreaterThan(1);
  });
});

describe("the import classifier", () => {
  test("a wrapped import is read, so a formatter run cannot disarm the guard", () => {
    expect(runtimeImports('import {\n  START,\n  carriage,\n} from "./dispatch";')).toEqual(["./dispatch"]);
  });

  test("a bare side-effect import counts, though it names no binding", () => {
    expect(runtimeImports('import "./x";')).toEqual(["./x"]);
  });

  test("a re-export reaches outside the bundle the same way an import does", () => {
    expect(runtimeImports('export { a } from "./x";')).toEqual(["./x"]);
    expect(runtimeImports('export * from "./x";')).toEqual(["./x"]);
  });

  test("a type-only re-export is erased, symmetrically with a type-only import", () => {
    expect(runtimeImports('export type { A } from "./x";')).toEqual([]);
  });

  test("`import type` is erased by the compiler, so it is no import at all", () => {
    expect(runtimeImports('import type { Harness } from "./harness";')).toEqual([]);
  });

  test("a clause whose every binding is type-only is erased whole", () => {
    expect(runtimeImports('import { type A, type B } from "./x";')).toEqual([]);
  });

  test("a mixed clause is a value import, however many `type` bindings ride along", () => {
    expect(runtimeImports('import { type A, b } from "./x";\nconsole.log(b);')).toEqual(["./x"]);
  });

  test("non-relative specifiers are not the bundle's business", () => {
    expect(runtimeImports('import { readFileSync } from "node:fs";\nimport "./x";')).toEqual(["./x"]);
  });

  test("the package classifier reads the other half: bare specifiers, node builtins excluded", () => {
    expect(packageImports('import { readFileSync } from "node:fs";\nimport "./x";')).toEqual([]);
    expect(packageImports('import { Effect } from "effect"; Effect;')).toEqual(["effect"]);
    expect(packageImports('import { a } from "@scope/pkg/deep"; a;')).toEqual(["@scope/pkg/deep"]);
  });

  test("a type-only package import is erased, so it ships nothing and is not a dependency", () => {
    expect(packageImports('import type { Effect } from "effect";')).toEqual([]);
  });

  test("comments and trailing commas between tokens hide nothing", () => {
    expect(runtimeImports('import { /* the one */ a, } from "./x"; a;')).toEqual(["./x"]);
  });
});

describe("the Dispatcher bundle", () => {
  // Filling a shared map from one test leaves every reader of it passing or failing on run order,
  // and the reader that scans for `Bun.` passes over an empty map without a word.
  let once: Promise<Map<string, Uint8Array>> | undefined;
  const emittedBundle = (): Promise<Map<string, Uint8Array>> => (once ??= valueOf(bundle(PI_BUNDLE, repo)));

  test("the real bundle emits without throwing, which is the property the layout exists for", async () => {
    expect((await emittedBundle()).size).toBeGreaterThan(0);
  });

  test("it holds an entry under the name a harness looks for", async () => {
    expect((await emittedBundle()).has(`${rootOf(PI_BUNDLE)}/${ENTRY}`)).toBe(true);
  });

  test("the authoring schema is not in it: a module reached only for its types is not shipped", async () => {
    const emitted = await emittedBundle();
    for (const gone of ["scope-condition.ts", "fields.ts"]) {
      expect(emitted.has(`${rootOf(PI_BUNDLE)}/${gone}`), gone).toBe(false);
    }
  });

  test("a spec that omits a module its entry needs is refused, naming module, specifier and fix", async () => {
    const alone: Bundle = { dir: PI_BUNDLE.dir, files: { "src/dispatcher/pi-dispatcher.ts": ENTRY } };
    expect(await saidBy(bundle(alone, repo))).toMatch(
      /src\/dispatcher\/pi-dispatcher\.ts needs "\.\/dispatch" at runtime.*add src\/dispatcher\/dispatch\.ts to its files/,
    );
  });

  test("a spec naming a source file that is not there is refused, naming the entry", async () => {
    const typo: Bundle = { dir: "x", files: { "src/dispach.ts": ENTRY } };
    expect(await saidBy(bundle(typo, repo))).toContain(`the ${GENERATED_ROOT}/x bundle names src/dispach.ts (as index.ts)`);
  });

  test("a spec naming a package path the package does not export is refused, naming the entry", async () => {
    const unexported: Bundle = { dir: "x", files: { "@avi2dg/checks/scripts/comments.ts": ENTRY } };
    expect(await saidBy(bundle(unexported, repo))).toBe(
      `the ${GENERATED_ROOT}/x bundle names @avi2dg/checks/scripts/comments.ts (as index.ts), and no installed package resolves it`,
    );
  });

  test("a module that climbs out of the directory with .. is refused", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "skills-bundle-"));
    try {
      writeFileSync(join(tmp, "m.ts"), 'import { x } from "../outside";\nexport const y = x;\n');
      expect(await saidBy(bundle({ dir: "x", files: { "m.ts": ENTRY } }, `${tmp}/`))).toMatch(
        /m\.ts imports "\.\.\/outside", which climbs out/,
      );
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("nothing in it reaches for bun, which a harness runtime does not have", async () => {
    const scanned = [...(await emittedBundle())].filter(([dest]) => dest.endsWith(".ts"));
    expect(scanned.length, "the scan had no module to read, so it proved nothing").toBeGreaterThan(0);
    for (const [dest, bytes] of scanned) {
      expect(decode(bytes), `${dest} uses a bun global`).not.toMatch(/\bBun\./);
    }
  });

  test("a module that imports a package the bundle does not declare is refused, naming it", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "skills-bundle-"));
    try {
      writeFileSync(join(tmp, "m.ts"), 'import { Effect } from "effect";\nexport const y = Effect;\n');
      expect(await saidBy(bundle({ dir: "x", files: { "m.ts": ENTRY } }, `${tmp}/`))).toMatch(
        /m\.ts imports "effect" at runtime, and a linked directory has no node_modules to resolve it from/,
      );
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("a package the bundle declares external is allowed, because the harness supplies it", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "skills-bundle-"));
    try {
      writeFileSync(join(tmp, "m.ts"), 'import { Effect } from "effect";\nexport const y = Effect;\n');
      const spec: Bundle = { dir: "x", files: { "m.ts": ENTRY }, externals: ["effect"] };
      expect((await valueOf(bundle(spec, `${tmp}/`))).size).toBe(1);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("node builtins need no declaration, because every harness runtime has them", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "skills-bundle-"));
    try {
      writeFileSync(join(tmp, "m.ts"), 'import { readFileSync } from "node:fs";\nexport const y = readFileSync;\n');
      expect((await valueOf(bundle({ dir: "x", files: { "m.ts": ENTRY } }, `${tmp}/`))).size).toBe(1);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("the pi Adapter's own harness package is the one external the real bundles declare", () => {
    expect(PI_BUNDLE.externals).toEqual(["@earendil-works/pi-coding-agent"]);
    for (const spec of [CLAUDE_BUNDLE, CODEX_BUNDLE]) expect(spec.externals ?? []).toEqual([]);
  });

  test("a bundled module is the bytes it was authored with", async () => {
    const emitted = await emittedBundle();
    for (const [from, name] of Object.entries(PI_BUNDLE.files)) {
      expect(emitted.get(`${rootOf(PI_BUNDLE)}/${name}`), from).toEqual(await Bun.file(sourcePath(from, repo)).bytes());
    }
  });

  test.each([
    { file: KIT_COMMENTS, shipped: "comments.ts", reached: () => import("../../src/dispatcher/comments"), names: ["refused", "SYNTAXES"] },
    { file: KIT_PROSE, shipped: "prose.ts", reached: () => import("../../src/dispatcher/prose"), names: ["proseRefused", "readerOf"] },
  ])("every Dispatcher ships the kit's own $shipped, under the name src/ reaches it by", async ({ file, shipped, reached, names }) => {
    const kit = Bun.resolveSync(file, repo);
    const matchers: Record<string, unknown> = await import(kit);
    const inSrc: Record<string, unknown> = await reached();
    for (const name of names) expect(inSrc[name], `src/ reaches a ${name} other than the kit's`).toBe(matchers[name]);
    const bytes = await Bun.file(kit).bytes();
    for (const spec of [PI_BUNDLE, CLAUDE_BUNDLE, CODEX_BUNDLE]) {
      expect(spec.files[file], spec.dir).toBe(shipped);
      const emitted = (await valueOf(bundle(spec, repo))).get(`${rootOf(spec)}/${shipped}`);
      expect(emitted, `${rootOf(spec)} ships a ${shipped} other than the kit's`).toEqual(bytes);
    }
  });

  test("the pi Adapter loads the index from the name the generator writes it under", async () => {
    const dispatcher = await load({
      harness: "pi",
      rules: [{ name: "unslop", triggers: [{ predicate: "always" }], text: "# unslop\n\nSay it plainly, every time." }],
      profiles: [],
      hub: [],
    });
    expect(await dispatcher.carried()).toContain("Say it plainly, every time.");
    expect(readFileSync(join(dispatcher.home, "state", "skills", "dispatch.log"), "utf8")).not.toContain("broken dispatcher");
  });
});

describe("harness names", () => {
  test("no Body names a harness except through its `harnesses` field", () => {
    expect(bodies.flatMap(undeclared)).toEqual([]);
  });

  test("a harness named by a Body that did not declare it is reported by file", () => {
    const smuggled: Body = {
      ...byName("unslop"),
      skill: `${byName("unslop").skill}\nRun this under ${["claude", "code"].join(" ")} only.\n`,
    };
    expect(undeclared(smuggled)).toEqual([
      `library/writing/references/unslop/${SKILL_FILE} names claude-code, which its \`harnesses\` field does not declare`,
    ]);
    expect(undeclared({ ...smuggled, harnesses: ["claude-code"] })).toEqual([]);
  });
});

describe("a pointer in the prose", () => {
  test("no Body sends a reader to a Body the tree does not hold", () => {
    expect(bodies.flatMap((body) => dangling(body, bodies))).toEqual([]);
  });

  const saying = (sentence: string, harnesses?: Harness[]): Body => ({
    ...byName("unslop"),
    ...(harnesses ? { harnesses } : {}),
    skill: `${byName("unslop").skill}\n${sentence}\n`,
  });

  test("both shapes a pointer is written in are reported, by file", () => {
    const planted = saying("Per the **fix-root-causes** principle skill, read the `code-smellz` reference.");
    expect(dangling(planted, bodies)).toEqual([
      `library/writing/references/unslop/${SKILL_FILE} sends a reader to "**fix-root-causes** principle skill", which is not a Body in the tree`,
      `library/writing/references/unslop/${SKILL_FILE} sends a reader to "\`code-smellz\` reference", which is not a Body in the tree`,
    ]);
  });

  test("a pointer to a Body this one's harnesses cannot reach is reported", () => {
    const reachable = byName("effect-patterns", "reference");
    const gated: Body = { ...reachable, harnesses: ["claude-code"] };
    const tree = bodies.map((b) => (b === reachable ? gated : b));
    expect(dangling(saying("Then read the `effect-patterns` reference."), tree)).toEqual([
      `library/writing/references/unslop/${SKILL_FILE} sends a reader to "\`effect-patterns\` reference", which pi and codex does not receive`,
    ]);
    expect(dangling(saying("Then read the `effect-patterns` reference.", ["claude-code"]), tree)).toEqual([]);
  });

  test("a pointer that calls a Body the wrong Kind is reported", () => {
    expect(dangling(saying("Run the `effect-patterns` skill first."), bodies)).toEqual([
      `library/writing/references/unslop/${SKILL_FILE} sends a reader to "\`effect-patterns\` skill", which is a reference`,
    ]);
    expect(dangling(saying("The **writing-for-people** skill applies here."), bodies)).toEqual([
      `library/writing/references/unslop/${SKILL_FILE} sends a reader to "**writing-for-people** skill", which is a rule`,
    ]);
  });

  test("a name the tree does hold is left alone, whichever Kind and whatever the case", () => {
    const fine = saying(
      "The `writing-for-people` Rule and the `unslop` reference both apply.\n**Prove-It-Works** Rule and `Force-Determinism` Rule are in the tree too.",
    );
    expect(dangling(fine, bodies)).toEqual([]);
  });
});

describe("the generated tree", () => {
  test("the preload wrote this process's own root, byte for byte what the generator emits", async () => {
    const own = `generated-${process.pid}`;
    const ownHub = hubUnder(own);
    const wanted = new Map([...(await valueOf(generated(repo)))].map(([dest, bytes]): [string, Uint8Array] => [`${own}${dest.slice(dest.indexOf("/"))}`, bytes]));
    const written = (await valueOf(filesUnder(`${repo}${own}`))).map((rel) => `${own}/${rel}`).filter((path) => !path.startsWith(`${ownHub}/`));
    expect(written, "the preload's root holds other files than the generator emits").toEqual([...wanted.keys()].toSorted());
    for (const [path, bytes] of wanted) expect(bytes, `${path} differs`).toEqual(await Bun.file(`${repo}${path}`).bytes());
    const { bodies: chosen, dormant } = await valueOf(active(repo));
    for (const [name, dir] of value(hub(chosen, dormant))) {
      expect(await readlink(`${repo}${ownHub}/${name}`), `${ownHub}/${name} points elsewhere`).toBe(`${repo}${dir}`);
    }
  });

  test("the check rejects a hand-edit to a generated file", async () => {
    const emitted = await valueOf(generated(repo));
    const dest = `${rootOf(piDispatcher.bundle)}/${ENTRY}`;
    const edited = new TextEncoder().encode(`${decode(emittedAt(emitted, dest))}\nAnd one more rule nobody asked for.\n`);

    const sandbox = `${tmpdir()}/skills-generator-fixture-${process.pid}-edit/`;
    for (const [path, bytes] of emitted) await Bun.write(`${sandbox}${path}`, path === dest ? edited : bytes);
    try {
      expect(await valueOf(drift(sandbox, emitted))).toEqual([`${dest} differs`]);
    } finally {
      rmSync(sandbox, { recursive: true, force: true });
    }
  });

  test("the check rejects a file under the generated root that nothing wrote", async () => {
    const emitted = await valueOf(generated(repo));
    const stray = `${rootOf(piDispatcher.bundle)}/long-gone.ts`;

    const sandbox = `${tmpdir()}/skills-generator-fixture-${process.pid}-stray/`;
    for (const [path, bytes] of emitted) await Bun.write(`${sandbox}${path}`, bytes);
    await Bun.write(`${sandbox}${stray}`, "---\nname: long-gone\n---\n");
    try {
      expect(await valueOf(drift(sandbox, emitted))).toEqual([`${stray} is not generated`]);
    } finally {
      rmSync(sandbox, { recursive: true, force: true });
    }
  });

  test("a Body edited but not regenerated names the index path that would change", async () => {
    const dest = `${rootOf(piDispatcher.bundle)}/${INDEX}`;
    const emitted = await valueOf(generated(repo));
    const edited = new Map(emitted);
    edited.set(dest, new TextEncoder().encode(`${decode(emittedAt(emitted, dest))}\n// an edit nobody ran generate for\n`));

    const sandbox = `${tmpdir()}/skills-generator-fixture-${process.pid}-stale/`;
    for (const [path, bytes] of emitted) await Bun.write(`${sandbox}${path}`, bytes);
    try {
      expect(await valueOf(drift(sandbox, edited))).toEqual([`${dest} differs`]);
    } finally {
      rmSync(sandbox, { recursive: true, force: true });
    }
  });

  test("the Hub shares the emitted root, and the generator writes no bytes into it", async () => {
    const sandbox = await sourceCopy("skills-generator-hub-");
    try {
      await valueOf(checkout(sandbox));
      expect(existsSync(`${sandbox}${HUB}`), "the Hub is reconciled somewhere else, so one command no longer writes one tree").toBe(true);
    } finally {
      discard(sandbox);
    }
    const inHub = [...(await valueOf(generated(repo))).keys()].filter((dest) => dest.startsWith(`${HUB}/`));
    expect(inHub, "the generator writes bytes into the Hub, which holds links").toEqual([]);
  });

  test("a Body another tool installed in the Hub survives a rewrite and is not reported as ungenerated", async () => {
    const sandbox = `${mkdtempSync(join(tmpdir(), "skills-generator-foreign-"))}/`;
    const foreign = `${sandbox}${HUB}/foreign`;
    try {
      await Bun.write(`${foreign}/${SKILL_FILE}`, "---\nname: foreign\n---\n\nSomebody else's Body.\n");
      const files = await valueOf(generated(repo));
      expect(await valueOf(write(sandbox, files)), "the generator wrote nothing").toBeGreaterThan(0);
      expect(
        await Bun.file(`${foreign}/${SKILL_FILE}`).text(),
        "the wipe took a Body another tool installed",
      ).toContain("Somebody else's Body.");
      expect(await valueOf(drift(sandbox, files)), "a foreign Body in the Hub reads as a stale emitted file").toEqual([]);
    } finally {
      rmSync(sandbox, { recursive: true, force: true });
    }
  });

  test("a file standing where the generated root belongs fails the write as a FileFailure", async () => {
    const sandbox = `${mkdtempSync(join(tmpdir(), "skills-generator-blocked-"))}/`;
    try {
      writeFileSync(`${sandbox}${GENERATED_ROOT}`, "a file where the generated directory should be");
      expect(await failureOf(write(sandbox, new Map()))).toMatchObject({
        _tag: "FileFailure",
        path: GENERATED_ROOT,
        code: "ENOTDIR",
      });
    } finally {
      rmSync(sandbox, { recursive: true, force: true });
    }
  });
});

describe("a tool that ships its own skill", () => {
  test("the skill its installer wrote through a linked skills root survives generate and is left alone", async () => {
    const sandbox = await sourceCopy("skills-tool-");
    const home = `${mkdtempSync(join(tmpdir(), "skills-tool-home-"))}/`;
    try {
      await valueOf(checkout(sandbox));
      await mkdir(`${home}.agents`, { recursive: true });
      await symlink(`${sandbox}${HUB}`, `${home}.agents/skills`);
      const installed = `${home}.agents/skills/no-mistakes/${SKILL_FILE}`;
      await Bun.write(installed, "---\nname: no-mistakes\n---\n\nThe installed binary's own skill.\n");

      const { hubs } = await valueOf(checkout(sandbox));
      expect(hubs.find((outcome) => outcome.entry === "no-mistakes")?.state).toBe("left");
      expect(await Bun.file(installed).text(), "generate took the skill its installer wrote").toContain(
        "The installed binary's own skill.",
      );
      expect(await valueOf(drift(sandbox, await valueOf(generated(sandbox))))).toEqual([]);
    } finally {
      discard(sandbox);
      rmSync(home, { recursive: true, force: true });
    }
  });
});
