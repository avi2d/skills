import { describe, expect, test } from "bun:test";
import { createCodingTools } from "@earendil-works/pi-coding-agent";
import { indexFor } from "../../src/generate/dispatch-index";
import { REPO } from "../../src/generate/link";
import { SELECTION_PATH, dormantRules, parseSelection, profilesOf, selected } from "../../src/bodies/selection";
import { said, value, valueOf } from "../lib/effect";
import { bodies, selection } from "../lib/tree";

const defaultProfile = `[profiles.default]
rules = []
skills = []
references = []`;
const config = (...lines: string[]) => parseSelection([defaultProfile, ...lines].join("\n"));
const sharing = (skills: string, references: string, ...lines: string[]) =>
  parseSelection([`[profiles.default]\nrules = []\nskills = ${skills}\nreferences = ${references}`, ...lines].join("\n"));
const chosen = selected(bodies, selection);

describe("profile selection", () => {
  test("only [profiles.*] belongs in the root selection", () => {
    expect(SELECTION_PATH).not.toInclude("/");
    expect(said(parseSelection(`${defaultProfile}\n[kinds]\nrules = true`))).toMatch(/only \[profiles\.\*\]/);
    expect(said(parseSelection(`${defaultProfile}\n[cuts.local]\ntools = []`))).toMatch(/only \[profiles\.\*\]/);
    expect(said(parseSelection(`${defaultProfile}\n[bodies.rules]\nfoo = true`))).toMatch(/only \[profiles\.\*\]/);
  });

  test("a default profile is required and has no models list", () => {
    expect(said(parseSelection("[profiles.other]\nmodels = []"))).toMatch(/profiles.default/);
    expect(said(parseSelection(`${defaultProfile}\nmodels = []`))).toMatch(/cannot name models/);
  });

  test("a Body not named by any profile is inactive, but remains in the Rule catalogue", async () => {
    const inactive = bodies.find((body) => body.kind === "rule" && !chosen.includes(body)) ?? expect.unreachable("no inactive Rule");
    expect(chosen).not.toContain(inactive);
    expect(dormantRules(bodies, chosen)).toContain(inactive);
    const index = await valueOf(indexFor("pi", chosen, value(profilesOf(bodies, selection)), dormantRules(bodies, chosen)));
    expect(index.rules.find((rule) => rule.name === inactive.name)?.inactive).toBe(true);
  });

  test("a Body is selected when any profile names it, and only then", () => {
    const named = (picked: typeof chosen) => picked.map((body) => `${body.kind}/${body.name}`);
    expect(named(chosen)).toContain("rule/git-hygiene-co-author");
    expect(named(chosen)).toContain("reference/effect-patterns");
    expect(named(chosen)).toContain("rule/agents-md-router");
    expect(named(chosen)).not.toContain("rule/agent-docs");
    const exact = value(sharing("[]", '["unslop"]', "[profiles.local]", 'models = ["ollama/qwen3.6:35b-a3b-iq3s"]', "[profiles.local.rules]", 'add = ["force-determinism"]'));
    expect(named(selected(bodies, exact)).toSorted()).toEqual(["reference/unslop", "rule/force-determinism"]);
  });

  test("unknown Bodies fail by field, and a tools list passes through", () => {
    for (const [field, name] of [["rules", "missing-rule"], ["skills", "missing-skill"], ["references", "missing-reference"]] as const) {
      const listed = (named: string) => (field === named ? `["${name}"]` : "[]");
      const profile = value(
        sharing(listed("skills"), listed("references"), `[profiles.local]`, `models = ["ollama/qwen3.6:35b-a3b-iq3s"]`, `tools = ["read", "write", "edit", "bash"]`, "[profiles.local.rules]", `add = ${listed("rules")}`),
      );
      expect(said(profilesOf(bodies, profile))).toContain(name);
    }
    const builtin = value(config("[profiles.local]", 'models = ["ollama/qwen3.6:35b-a3b-iq3s"]', 'tools = ["grep"]', "[profiles.local.rules]"));
    expect(value(profilesOf(bodies, builtin))[1]?.tools).toContain("grep");
  });

  test("models cannot be claimed twice", () => {
    expect(
      said(
        config("[profiles.one]", 'models = ["openai/gpt-6-luna"]', "[profiles.one.rules]", "[profiles.two]", 'models = ["openai/gpt-6-luna"]', "[profiles.two.rules]"),
      ),
    ).toMatch(/named by two profiles/);
  });

  test("models that run the default set are named once in default_models", () => {
    expect(value(config()).defaultModels).toEqual([]);
    const listed = value(parseSelection('default_models = ["opus"]\n' + defaultProfile));
    expect(listed.defaultModels).toEqual(["opus"]);
    expect(said(parseSelection('default_models = "opus"\n' + defaultProfile))).toMatch(/selection\.default_models is "opus", which is not a list of names/);
    expect(said(parseSelection('default_models = ["opus", "opus"]\n' + defaultProfile))).toMatch(/selection\.default_models repeats a name/);
    expect(said(parseSelection('default_modelz = ["opus"]\n' + defaultProfile))).toMatch(/only \[profiles\.\*\]/);
    expect(
      said(parseSelection('default_models = ["m"]\n' + defaultProfile + '\n[profiles.p]\nmodels = ["m"]\n[profiles.p.rules]')),
    ).toMatch(/m is named by a profile and default_models/);
  });

  test("only the default profile lists skills and references, and every other profile shares them", () => {
    for (const field of ["skills", "references"] as const) {
      const repeated = config("[profiles.local]", 'models = ["ollama/qwen3.6:35b-a3b-iq3s"]', `${field} = []`, "[profiles.local.rules]");
      expect(said(repeated)).toMatch(new RegExp(`profiles\\.local\\.${field} belongs to profiles\\.default only`));
    }
    const shared = value(sharing('["grilling"]', '["unslop"]', "[profiles.local]", 'models = ["ollama/qwen3.6:35b-a3b-iq3s"]', "[profiles.local.rules]"));
    for (const profile of shared.profiles) expect([profile.skills, profile.references], profile.name).toEqual([["grilling"], ["unslop"]]);
  });

  test("a field no profile knows names the fields that profile takes", () => {
    const unknown = config("[profiles.local]", 'models = ["ollama/qwen3.6:35b-a3b-iq3s"]', "hooks = []", "[profiles.local.rules]");
    expect(said(unknown)).toMatch(/profiles\.local\.hooks is not one of models, rules, tools/);
  });

  test("a non-default profile resolves additions and removals against the default list", () => {
    const based = value(
      parseSelection(
        [
          `[profiles.default]\nrules = ["comment-discipline", "prove-it-works", "agents-md-router"]\nskills = []\nreferences = []`,
          "[profiles.local]",
          'models = ["ollama/qwen3.6:35b-a3b-iq3s"]',
          "[profiles.local.rules]",
          'add = ["guard-the-context-window", "zzz"]',
          'drop = ["comment-discipline"]',
        ].join("\n"),
      ),
    );
    expect(based.profiles[1]?.rules).toEqual(["guard-the-context-window", "prove-it-works", "agents-md-router", "zzz"]);
  });

  test("every configured profile resolves to the Rules it declared before", () => {
    const resolved = new Map(selection.profiles.map((profile) => [profile.name, profile.rules]));
    expect(resolved.get("default")).toEqual(["comment-discipline", "fix-what-you-see", "prove-it-works", "typescript-best-practices", "agents-md-router"]);
    expect(resolved.get("muse-spark")).toEqual(["comment-discipline", "fix-what-you-see", "guard-the-context-window", "prove-it-works", "typescript-best-practices", "agents-md-router", "writing-for-people"]);
    expect(resolved.get("gpt-6")).toEqual([
      "comment-discipline",
      "fix-what-you-see",
      "force-determinism",
      "git-hygiene",
      "prove-it-works",
      "typescript-best-practices",
      "agents-md-router",
    ]);
    expect(resolved.get("claude-opus-5-5")).toEqual([
      "comment-discipline",
      "fix-what-you-see",
      "git-hygiene-co-author",
      "prove-it-works",
      "typescript-best-practices",
      "agents-md-router",
    ]);
    expect(resolved.get("ollama-qwen")).toEqual(["guard-the-context-window", "prove-it-works", "agents-md-router"]);
    expect(selection.profiles.find((profile) => profile.name === "gpt-6")?.models).toEqual([
      "openai-codex/gpt-6-luna",
      "openai/gpt-6-luna",
      "openai-codex/gpt-6.1-sol",
      "openai/gpt-6.1-sol",
    ]);
  });

  test("a delta that repeats the default, drops outside it, or lists both is refused", () => {
    const profile = (...lines: string[]) =>
      parseSelection(
        [
          `[profiles.default]\nrules = ["b"]\nskills = []\nreferences = []`,
          "[profiles.p]",
          'models = ["m"]',
          "[profiles.p.rules]",
          ...lines,
        ].join("\n"),
      );
    expect(said(profile('add = ["b"]'))).toMatch(/profiles\.p\.rules adds b, which profiles\.default\.rules already lists/);
    expect(said(profile('drop = ["missing"]'))).toMatch(/profiles\.p\.rules drops missing, which profiles\.default\.rules does not list/);
    expect(said(profile('add = ["c"]', 'drop = ["c"]'))).toMatch(/profiles\.p\.rules names c in both add and drop/);
    expect(said(profile('except = ["c"]'))).toMatch(/profiles\.p\.rules\.except is not one of add, drop/);
    expect(said(parseSelection([`[profiles.default]\nrules = []\nskills = []\nreferences = []`, "[profiles.p]", 'models = ["m"]'].join("\n")))).toMatch(
      /profiles\.p\.rules is undefined, which names neither additions nor removals/,
    );
  });

  test("a bare rules list in a non-default profile is refused", () => {
    expect(said(config("[profiles.local]", 'models = ["ollama/qwen3.6:35b-a3b-iq3s"]', "rules = []"))).toMatch(/profiles\.local\.rules lists every Rule/);
  });

  test("only pi can trim tools for its exact models", () => {
    const changed = { profiles: selection.profiles.map((profile) => profile.name === "gpt-6" ? { ...profile, tools: ["read"] } : profile), defaultModels: selection.defaultModels };
    expect(said(profilesOf(bodies, changed))).toMatch(/profiles.gpt-6.tools cannot be filtered/);
    expect(value(config()).profiles[0]?.tools).toBeUndefined();
    const onDefault = value(parseSelection(defaultProfile.replace("[profiles.default]", '[profiles.default]\ntools = ["read"]')));
    expect(said(profilesOf(bodies, onDefault))).toMatch(/profiles.default.tools cannot be filtered/);
    const local = selection.profiles.find((profile) => profile.name === "ollama-qwen") ?? expect.unreachable("no local profile");
    const tools = local.tools ?? expect.unreachable("the local Profile must trim tools");
    expect(tools.toSorted()).toEqual(createCodingTools(REPO).map((tool) => tool.name).toSorted());
  });

  test("every configured profile reaches the harness index", () => {
    const profiles = value(profilesOf(bodies, selection));
    expect(profiles.length).toBeGreaterThan(1);
    expect(value(indexFor("pi", chosen, profiles)).profiles).toEqual(profiles);
  });
});
