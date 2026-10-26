import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { KIND_DIRS, KIND_ONLY, KINDS, LIBRARY, LOCAL, SKILL_FILE, bodyDir, loadBodies, parseFrontmatter, type Kind } from "../../src/bodies/bodies";
import { said, saidBy, value, valueOf } from "../lib/effect";
import { dirFor, frontmatterOf } from "../lib/frontmatter";

const everyField: Record<Kind, Record<string, string>> = {
  rule: { trigger: "{ predicate: always }", forbid: "comments", consults: "[probe]" },
  skill: { consults: "[probe]" },
  reference: { consults: "[probe]" },
};

describe("frontmatter", () => {
  for (const kind of KINDS) {
    test(`every field the schema reads for a ${kind} reaches the parsed Body`, () => {
      const dir = dirFor(kind, "probe");
      const parsed = value(
        parseFrontmatter(
          dir,
          frontmatterOf({ name: "probe", description: "What it is for.", kind, source: LOCAL, ...everyField[kind] }),
        ),
      );
      const read = Object.entries(KIND_ONLY)
        .filter(([, { kinds }]) => kinds.includes(kind))
        .map(([field]) => field);
      expect(read.length, `${kind} reads nothing the schema names`).toBeGreaterThan(0);
      for (const field of read) {
        expect(Object.keys(parsed), `${dir} dropped the ${field} the schema read`).toContain(field);
      }
    });
  }
});

describe("the library", () => {
  const probe = frontmatterOf({ name: "probe", description: "What it is for.", kind: "reference", source: LOCAL });
  const declaring = (dir: string): string => {
    const [, , where, name = ""] = dir.split("/");
    const kind = KINDS.find((k) => KIND_DIRS[k] === where) ?? "reference";
    return frontmatterOf({ name, description: "What it is for.", kind, source: LOCAL, ...(kind === "rule" ? { trigger: "{ predicate: always }" } : {}) });
  };

  test("a Body outside a domain directory of the library aborts, naming where it is", () => {
    expect(said(parseFrontmatter("references/probe", probe))).toMatch(new RegExp(`references/probe: is not in a domain directory under ${LIBRARY}/`));
    expect(value(parseFrontmatter(dirFor("reference", "probe", "writing"), probe)).domain).toBe("writing");
  });

  const holding = async (dirs: readonly string[], check: (repo: string) => Promise<void>) => {
    const repo = `${mkdtempSync(join(tmpdir(), "skills-library-"))}/`;
    try {
      for (const dir of dirs) {
        mkdirSync(`${repo}${dir}`, { recursive: true });
        writeFileSync(`${repo}${dir}/${SKILL_FILE}`, declaring(dir));
      }
      await check(repo);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  };

  test("a tree with no library aborts, and a domain holding a directory that is not a Kind aborts naming it", async () => {
    await holding([], async (repo) => expect(await saidBy(loadBodies(repo))).toMatch(new RegExp(`no ${LIBRARY}/ directory`)));
    await holding([dirFor("reference", "probe"), `${LIBRARY}/a-domain/notes/probe`], async (repo) => {
      expect(await saidBy(loadBodies(repo))).toMatch(new RegExp(`${LIBRARY}/a-domain/notes: notes is not a Kind directory`));
    });
  });

  test("a Kind directory holding only a .gitkeep loads no Body", async () => {
    await holding([dirFor("reference", "probe")], async (repo) => {
      mkdirSync(`${repo}${LIBRARY}/a-domain/${KIND_DIRS.skill}`);
      writeFileSync(`${repo}${LIBRARY}/a-domain/${KIND_DIRS.skill}/.gitkeep`, "");
      expect((await valueOf(loadBodies(repo))).map((body) => `${body.kind}/${body.name}`)).toEqual(["reference/probe"]);
    });
  });

  test("two domains holding a Body of the same Kind and name abort, naming both, even when no Profile selects it", async () => {
    const twice = [dirFor("rule", "probe", "a-domain"), dirFor("rule", "probe", "b-domain")];
    await holding(twice, async (repo) => {
      expect(await saidBy(loadBodies(repo))).toBe(`two Bodies are rules/probe: ${twice[0]} and ${twice[1]}`);
      expect(await saidBy(bodyDir(repo, "rule", "probe"))).toBe(`two Bodies are rules/probe: ${twice[0]} and ${twice[1]}`);
    });
  });

  test("a Body is found by Kind and name in whichever domain holds it", async () => {
    await holding([dirFor("reference", "probe", "b-domain"), dirFor("rule", "probe", "a-domain")], async (repo) => {
      expect(await valueOf(bodyDir(repo, "reference", "probe"))).toBe(dirFor("reference", "probe", "b-domain"));
      expect(await saidBy(bodyDir(repo, "skill", "probe"))).toBe(`${LIBRARY}/ holds no skill named probe`);
    });
  });
});
