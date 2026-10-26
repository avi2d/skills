import { Effect } from "effect";
import { MalformedBody } from "../platform/failures";

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export function requireBlock(value: unknown, field: string): Effect.Effect<Record<string, unknown>, MalformedBody> {
  if (!isRecord(value)) {
    return Effect.fail(
      new MalformedBody({
        message: `frontmatter field \`${field}\` is ${JSON.stringify(value)}, which is not a block of fields`,
      }),
    );
  }
  return Effect.succeed(value);
}

export function requireString(
  fields: Record<string, unknown>,
  key: string,
  where = "",
): Effect.Effect<string, MalformedBody> {
  const value = fields[key];
  if (value === undefined) {
    return Effect.fail(new MalformedBody({ message: `frontmatter field \`${where}${key}\` is missing` }));
  }
  if (typeof value !== "string" || value.trim() === "") {
    return Effect.fail(
      new MalformedBody({
        message: `frontmatter field \`${where}${key}\` is ${JSON.stringify(value)}, which is not text`,
      }),
    );
  }
  return Effect.succeed(value);
}

export function unknownFields(fields: Record<string, unknown>, schema: readonly string[], where = ""): string[] {
  return Object.keys(fields)
    .filter((key) => !schema.includes(key))
    .map((key) => `${where}${key}`);
}
