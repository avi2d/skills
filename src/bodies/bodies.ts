import { Effect, FileSystem, Option } from "effect";
import { MalformedBody, UncomposableBodies, type FileFailure } from "../platform/failures";
import { attempt, entriesOf, filesUnder, unlessAbsent } from "../platform/files";
import { requireString, isRecord } from "./fields";
import { FORBIDS, isForbid, type Forbid } from "../dispatcher/forbid";
import { isHarness, type Harness } from "../dispatcher/harness";
import { parseScopeConditions, type ScopeCondition } from "../dispatcher/scope-condition";

export const KINDS = ["rule", "skill", "reference"] as const;
export type Kind = (typeof KINDS)[number];

export const LIBRARY = "library";

export const KIND_DIRS: Record<Kind, string> = {
  rule: "rules",
  skill: "skills",
  reference: "references",
};

function kindFor(dir: string): Kind | undefined {
  return KINDS.find((kind) => KIND_DIRS[kind] === dir);
}

export { HARNESSES, type Harness } from "../dispatcher/harness";

export const SKILL_FILE = "SKILL.md";

export const LOCAL = "local";

type Origin = `https://${string}@${string}`;

type Source = typeof LOCAL | Origin;

const ORIGIN = /^https:\/\/\S+@[0-9a-f]{40}$/;

const isSource = (value: string): value is Source => value === LOCAL || ORIGIN.test(value);

export const NAME_PATTERN = "[a-z0-9]+(?:-[a-z0-9]+)*";
const NAME = new RegExp(`^${NAME_PATTERN}$`);

export const REACHABLE: readonly Kind[] = ["skill", "reference"];

const FENCE = "---";

type Declared = {
  name: string;
  domain: string;
  description: string;
  source: Source;
  harnesses?: Harness[];
};

export type Frontmatter =
  | (Declared & {
      kind: "rule";
      trigger: ScopeCondition[];
      forbid?: Forbid;
      consults?: string[];
    })
  | (Declared & { kind: "skill"; consults?: string[] })
  | (Declared & { kind: "reference"; consults?: string[] });

type KindField = {
  kinds: readonly Kind[];
};

export const KIND_ONLY: Record<string, KindField> = {
  trigger: { kinds: ["rule"] },
  forbid: { kinds: ["rule"] },
  consults: { kinds: ["rule", "skill", "reference"] },
};

export const SCHEMA = ["name", "description", "kind", "source", "harnesses", ...Object.keys(KIND_ONLY)];

export type Body = Frontmatter & {
  skill: string;
  assets: Map<string, Uint8Array>;
};

export const dirOf = (body: Frontmatter): string => `${LIBRARY}/${body.domain}/${KIND_DIRS[body.kind]}/${body.name}`;

export const kindAndName = (body: Frontmatter): string => `${KIND_DIRS[body.kind]}/${body.name}`;

export const consulted = (body: Frontmatter): string[] => ("consults" in body ? (body.consults ?? []) : []);

export const receives = (body: Frontmatter, harness: Harness): boolean =>
  body.harnesses === undefined || body.harnesses.includes(harness);

function fences(text: string): Effect.Effect<{ lines: string[]; close: number }, MalformedBody> {
  const lines = text.split("\n");
  if (lines[0] !== FENCE) {
    return Effect.fail(new MalformedBody({ message: `does not open with a ${FENCE} frontmatter fence` }));
  }
  const close = lines.indexOf(FENCE, 1);
  if (close < 0) {
    return Effect.fail(new MalformedBody({ message: `opens a ${FENCE} frontmatter fence and never closes it` }));
  }
  return Effect.succeed({ lines, close });
}

const frontmatterBlock = (text: string): Effect.Effect<string, MalformedBody> =>
  Effect.map(fences(text), ({ lines, close }) => lines.slice(1, close).join("\n"));

export const proseIn = (dir: string, text: string): Effect.Effect<string, MalformedBody> =>
  fences(text).pipe(
    Effect.map(({ lines, close }) =>
      lines
        .slice(close + 1)
        .join("\n")
        .trimStart()),
    Effect.mapError((cause) => new MalformedBody({ message: `${dir}: ${cause.message}` })),
  );

export const prose = (body: Body): Effect.Effect<string, MalformedBody> => proseIn(dirOf(body), body.skill);

export const at = (body: Frontmatter, field: string, said: string): UncomposableBodies =>
  new UncomposableBodies({ message: `${dirOf(body)}: frontmatter field \`${field}\` ${said}` });

export function target(
  body: Frontmatter,
  field: string,
  name: string,
  bodies: readonly Body[],
): Effect.Effect<Body, UncomposableBodies> {
  const found = bodies.find((b) => b.name === name);
  if (!found) return Effect.fail(at(body, field, `names ${JSON.stringify(name)}, which is not a Body in the tree`));
  return Effect.succeed(found);
}

function parseHarnesses(value: unknown): Effect.Effect<Harness[], MalformedBody> {
  if (!Array.isArray(value) || value.length === 0) {
    return Effect.fail(
      new MalformedBody({
        message:
          `frontmatter field \`harnesses\` is ${JSON.stringify(value)}: name at least one harness, or leave the field out to target all of them`,
      }),
    );
  }
  if (value.every(isHarness)) return Effect.succeed(value);
  const stray = value.find((harness) => !isHarness(harness));
  return Effect.fail(
    new MalformedBody({
      message: `frontmatter field \`harnesses\` names ${JSON.stringify(stray)}, which is not a harness`,
    }),
  );
}

function parseForbid(value: unknown): Effect.Effect<Forbid, MalformedBody> {
  if (!isForbid(value)) {
    return Effect.fail(
      new MalformedBody({
        message: `frontmatter field \`forbid\` is ${JSON.stringify(value)}, and a Dispatcher can refuse only ${FORBIDS.join(", ")}`,
      }),
    );
  }
  return Effect.succeed(value);
}

function parseName(field: string, value: unknown): Effect.Effect<string, MalformedBody> {
  if (typeof value !== "string" || !NAME.test(value)) {
    return Effect.fail(
      new MalformedBody({
        message: `frontmatter field \`${field}\` is ${JSON.stringify(value)}, which is not the name of a Body`,
      }),
    );
  }
  return Effect.succeed(value);
}

function parseConsults(value: unknown): Effect.Effect<string[], MalformedBody> {
  if (!Array.isArray(value) || value.length === 0) {
    return Effect.fail(
      new MalformedBody({
        message:
          `frontmatter field \`consults\` is ${JSON.stringify(value)}: name at least one Body, or leave the field out`,
      }),
    );
  }
  return Effect.forEach(value, (named) => parseName("consults", named));
}

const readFields = Effect.fnUntraced(function* (text: string): Effect.fn.Return<Record<string, unknown>, MalformedBody> {
  const block = yield* frontmatterBlock(text);
  const parsed = yield* Effect.try({
    try: () => Bun.YAML.parse(block),
    catch: (cause) => new MalformedBody({ message: cause instanceof Error ? cause.message : String(cause) }),
  });
  if (!isRecord(parsed)) {
    return yield* new MalformedBody({ message: "frontmatter is not a block of fields" });
  }
  return parsed;
});

const knownFields = Effect.fnUntraced(function* (kind: Kind, fields: Record<string, unknown>): Effect.fn.Return<void, MalformedBody> {
  for (const field of Object.keys(fields)) {
    const only = KIND_ONLY[field]?.kinds;
    if (only && !only.includes(kind)) {
      return yield* new MalformedBody({
        message: `frontmatter field \`${field}\` belongs to a ${only.join(" or a ")}, and this is a ${kind}`,
      });
    }
    if (!SCHEMA.includes(field)) {
      return yield* new MalformedBody({ message: `frontmatter field \`${field}\` is not in the schema` });
    }
  }
});

const declaredName = Effect.fnUntraced(function* (name: string, fields: Record<string, unknown>): Effect.fn.Return<void, MalformedBody> {
  const declared = yield* requireString(fields, "name");
  if (declared !== name) {
    return yield* new MalformedBody({
      message: `frontmatter field \`name\` is ${JSON.stringify(declared)}, and the directory says ${name}`,
    });
  }
  if (!NAME.test(name)) {
    return yield* new MalformedBody({
      message: `frontmatter field \`name\` is ${JSON.stringify(name)}, which is not kebab-case`,
    });
  }
});

const declaredKind = Effect.fnUntraced(function* (kind: Kind, fields: Record<string, unknown>): Effect.fn.Return<void, MalformedBody> {
  const itsKind = yield* requireString(fields, "kind");
  if (itsKind !== kind) {
    return yield* new MalformedBody({
      message: `frontmatter field \`kind\` is ${JSON.stringify(itsKind)}, and the directory says ${kind}`,
    });
  }
});

const declaredSource = Effect.fnUntraced(function* (fields: Record<string, unknown>): Effect.fn.Return<Source, MalformedBody> {
  const source = yield* requireString(fields, "source");
  if (!isSource(source)) {
    return yield* new MalformedBody({
      message:
        `frontmatter field \`source\` is ${JSON.stringify(source)}: name an origin repository at a commit, or ${LOCAL}`,
    });
  }
  return source;
});

const declaredFrontmatter = Effect.fnUntraced(function* (
  kind: Kind,
  domain: string,
  name: string,
  fields: Record<string, unknown>,
): Effect.fn.Return<Frontmatter, MalformedBody> {
  yield* knownFields(kind, fields);
  yield* declaredName(name, fields);
  const description = yield* requireString(fields, "description");
  yield* declaredKind(kind, fields);
  const source = yield* declaredSource(fields);
  const harnesses = "harnesses" in fields ? yield* parseHarnesses(fields.harnesses) : undefined;
  const base = { name, domain, description, source, ...(harnesses === undefined ? {} : { harnesses }) };
  switch (kind) {
    case "rule":
      return {
        ...base,
        kind,
        trigger: yield* parseScopeConditions(fields.trigger),
        ...("forbid" in fields ? { forbid: yield* parseForbid(fields.forbid) } : {}),
        ...("consults" in fields ? { consults: yield* parseConsults(fields.consults) } : {}),
      };
    case "skill":
    case "reference":
      return {
        ...base,
        kind,
        ...("consults" in fields ? { consults: yield* parseConsults(fields.consults) } : {}),
      };
  }
});

export const parseFrontmatter = Effect.fnUntraced(function* (
  dir: string,
  text: string,
): Effect.fn.Return<Frontmatter, MalformedBody> {
  const [root = "", domain = "", where = "", ...rest] = dir.split("/");
  if (root !== LIBRARY || domain === "") return yield* new MalformedBody({ message: `is not in a domain directory under ${LIBRARY}/` });
  const kind = kindFor(where);
  if (!kind) return yield* new MalformedBody({ message: `${where} is not a Kind directory` });
  const name = rest.join("/");

  const fields = yield* readFields(text);
  return yield* declaredFrontmatter(kind, domain, name, fields);
}, (effect, dir) =>
  Effect.mapError(effect, (cause) => new MalformedBody({ message: `${dir}: ${cause.message}` })));

const loadBody = Effect.fnUntraced(function* (
  repo: string,
  dir: string,
): Effect.fn.Return<Body, MalformedBody | FileFailure, FileSystem.FileSystem> {
  const skill = `${dir}/${SKILL_FILE}`;
  const text = yield* attempt(skill, (fs) => fs.readFileString(`${repo}${skill}`)).pipe(unlessAbsent);
  if (Option.isNone(text)) return yield* new MalformedBody({ message: `${dir}: has no ${SKILL_FILE}` });
  const frontmatter = yield* parseFrontmatter(dir, text.value);

  const assets = new Map<string, Uint8Array>();
  for (const rel of yield* filesUnder(`${repo}${dir}`)) {
    if (rel === SKILL_FILE) continue;
    assets.set(rel, yield* attempt(`${dir}/${rel}`, (fs) => fs.readFile(`${repo}${dir}/${rel}`)));
  }
  return { ...frontmatter, skill: text.value, assets };
});

const subdirectories = (dir: string): Effect.Effect<string[], FileFailure, FileSystem.FileSystem> =>
  Effect.map(entriesOf(dir), (entries) => entries.filter(({ entry }) => entry.kind === "directory").map(({ name }) => name));

const domains = (repo: string): Effect.Effect<string[], MalformedBody | FileFailure, FileSystem.FileSystem> =>
  subdirectories(`${repo}${LIBRARY}`).pipe(
    unlessAbsent,
    Effect.flatMap(Option.match({
      onNone: () => Effect.fail(new MalformedBody({ message: `the tree has no ${LIBRARY}/ directory, so no Body has anywhere to live` })),
      onSome: Effect.succeed,
    })),
  );

const twoBodies = (identity: string, first: string, second: string): MalformedBody =>
  new MalformedBody({ message: `two Bodies are ${identity}: ${first} and ${second}` });

export const loadBodies = Effect.fnUntraced(function* (
  repo: string,
): Effect.fn.Return<Body[], MalformedBody | FileFailure, FileSystem.FileSystem> {
  const out: Body[] = [];
  for (const domain of yield* domains(repo)) {
    for (const dir of yield* subdirectories(`${repo}${LIBRARY}/${domain}`)) {
      const where = `${LIBRARY}/${domain}/${dir}`;
      if (!kindFor(dir)) return yield* new MalformedBody({ message: `${where}: ${dir} is not a Kind directory` });
      for (const name of yield* subdirectories(`${repo}${where}`)) out.push(yield* loadBody(repo, `${where}/${name}`));
    }
  }
  const taken = new Map<string, string>();
  for (const body of out) {
    const first = taken.get(kindAndName(body));
    if (first !== undefined) return yield* twoBodies(kindAndName(body), first, dirOf(body));
    taken.set(kindAndName(body), dirOf(body));
  }
  return out.toSorted((a, b) => KINDS.indexOf(a.kind) - KINDS.indexOf(b.kind) || a.name.localeCompare(b.name));
});

export const bodyDir = Effect.fnUntraced(function* (
  repo: string,
  kind: Kind,
  name: string,
): Effect.fn.Return<string, MalformedBody | FileFailure, FileSystem.FileSystem> {
  const found: string[] = [];
  for (const domain of yield* domains(repo)) {
    const where = `${LIBRARY}/${domain}/${KIND_DIRS[kind]}`;
    const names = yield* subdirectories(`${repo}${where}`).pipe(unlessAbsent);
    if (Option.isSome(names) && names.value.includes(name)) found.push(`${where}/${name}`);
  }
  const [dir, second] = found;
  if (dir === undefined) return yield* new MalformedBody({ message: `${LIBRARY}/ holds no ${kind} named ${name}` });
  if (second !== undefined) return yield* twoBodies(`${KIND_DIRS[kind]}/${name}`, dir, second);
  return dir;
});
