import { expect, test } from "bun:test";
import { Schema } from "effect";
import oxlintConfig from "../../oxlint.config";
import { DEFAULT_GENERATED_ROOT, generatedRoot } from "../../src/generate/bundle";
import { DISPATCHERS } from "../../src/generate/generate";

test("a generated root override names a test process's own tree or falls back to generated/", () => {
  expect(DEFAULT_GENERATED_ROOT).toBe("generated");
  expect(generatedRoot("generated-123")).toBe("generated-123");
  for (const rejected of [undefined, "", "src", "rules", "generated", "generated-", "generated-1/..", "../generated-1"])
    expect(generatedRoot(rejected), `${rejected} was accepted as a root`).toBe(DEFAULT_GENERATED_ROOT);
});

const bundled = [...new Set(DISPATCHERS.flatMap(({ bundle }) => Object.keys(bundle.files)))].filter((file) => file.startsWith("src/")).toSorted();

const Globs = Schema.Array(Schema.String);
const decodeOxlint = Schema.decodeUnknownSync(
  Schema.Struct({
    overrides: Schema.Array(
      Schema.Struct({ files: Globs, excludeFiles: Schema.optionalKey(Globs), rules: Schema.optionalKey(Schema.Record(Schema.String, Schema.Unknown)) }),
    ),
  }),
);

test("the oxlint Effect scope leaves out exactly the files a Dispatcher bundles", () => {
  const oxlint = decodeOxlint(oxlintConfig);
  const scoped = oxlint.overrides.find((override) => override.rules?.["effect-channel/no-throw"] !== undefined);
  if (!scoped) expect.unreachable("oxlint.config.ts holds no Effect override");
  expect(scoped.files, "the Effect override no longer reaches every .ts file, src/ among them").toContain("**/*.ts");
  expect(
    scoped.excludeFiles?.filter((glob) => glob.startsWith("src/")).toSorted(),
    "the oxlint Effect scope and src/generate/bundle.ts disagree, so a bundled file is held to Effect or a scoped one escapes it",
  ).toEqual(bundled);
});
