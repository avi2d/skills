import { Effect } from "effect";
import { compileGlob } from "./glob";
import { MalformedBody } from "../platform/failures";
import { requireBlock, requireString, unknownFields } from "../bodies/fields";
import { DECLARATIONS, type Declaration } from "./project";

export const PREDICATES = ["always", "repo-contains", "declares", "file-matches", "tool-call"] as const;
export type Predicate = (typeof PREDICATES)[number];

const isPredicate = (value: string): value is Predicate => (PREDICATES as readonly string[]).includes(value);

const isDeclaration = (value: string): value is Declaration => (DECLARATIONS as readonly string[]).includes(value);

export type ScopeCondition =
  | { predicate: "always" }
  | { predicate: "repo-contains"; glob: string }
  | { predicate: "declares"; key: Declaration }
  | { predicate: "file-matches"; glob: string }
  | { predicate: "tool-call"; tool: string; argument: string; matches: string };

const PARAMETERS: Record<Predicate, readonly string[]> = {
  always: [],
  "repo-contains": ["glob"],
  declares: ["key"],
  "file-matches": ["glob"],
  "tool-call": ["tool", "argument", "matches"],
};

const glob = Effect.fnUntraced(function* (fields: Record<string, unknown>, key: string, where: string) {
  const pattern = yield* requireString(fields, key, `${where}.`);
  return yield* Effect.try({
    try: () => {
      compileGlob(pattern);
      return pattern;
    },
    catch: (cause) =>
      new MalformedBody({
        message: `frontmatter field \`${where}.${key}\` is a malformed ${cause instanceof Error ? cause.message : String(cause)}`,
      }),
  });
});

const declaration = Effect.fnUntraced(function* (fields: Record<string, unknown>, where: string) {
  const key = yield* requireString(fields, "key", `${where}.`);
  if (isDeclaration(key)) return key;
  return yield* new MalformedBody({
    message: `frontmatter field \`${where}.key\` is ${JSON.stringify(key)}, which is not one of ${DECLARATIONS.join(", ")}`,
  });
});

export const parseScopeCondition = Effect.fnUntraced(function* (
  value: unknown,
  at?: string,
): Effect.fn.Return<ScopeCondition, MalformedBody> {
  const where = at ?? "trigger";
  if (value === undefined) {
    return yield* new MalformedBody({
      message: `frontmatter field \`${where}\` is missing, so this Rule can never fire`,
    });
  }
  const fields = yield* requireBlock(value, where);

  const predicate = yield* requireString(fields, "predicate", `${where}.`);
  if (!isPredicate(predicate)) {
    return yield* new MalformedBody({
      message:
        `frontmatter field \`${where}.predicate\` is ${JSON.stringify(predicate)}, which is not one of ${PREDICATES.join(", ")}`,
    });
  }

  const [unknown] = unknownFields(fields, ["predicate", ...PARAMETERS[predicate]], `${where}.`);
  if (unknown) {
    return yield* new MalformedBody({
      message: `frontmatter field \`${unknown}\` does not belong to a ${predicate} trigger`,
    });
  }

  switch (predicate) {
    case "always":
      return { predicate: "always" };
    case "repo-contains":
      return { predicate: "repo-contains", glob: yield* glob(fields, "glob", where) };
    case "declares":
      return { predicate: "declares", key: yield* declaration(fields, where) };
    case "file-matches":
      return { predicate: "file-matches", glob: yield* glob(fields, "glob", where) };
    case "tool-call":
      return {
        predicate: "tool-call",
        tool: yield* requireString(fields, "tool", `${where}.`),
        argument: yield* requireString(fields, "argument", `${where}.`),
        matches: yield* glob(fields, "matches", where),
      };
    default:
      return yield* new MalformedBody({
        message: `frontmatter field \`${where}.predicate\` is ${String(predicate satisfies never)}, which nothing here reads`,
      });
  }
});

export const parseScopeConditions = Effect.fnUntraced(function* (
  value: unknown,
): Effect.fn.Return<ScopeCondition[], MalformedBody> {
  if (!Array.isArray(value)) return [yield* parseScopeCondition(value)];
  if (value.length === 0) {
    return yield* new MalformedBody({
      message: "frontmatter field `trigger` is an empty list, so this Rule can never fire",
    });
  }
  return yield* Effect.forEach(value, (entry, i) => parseScopeCondition(entry, `trigger[${i}]`));
});
