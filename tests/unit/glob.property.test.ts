import { expect, test } from "bun:test";
import * as fc from "fast-check";
import { matchesGlob } from "../../harness/common/glob";

const character = fc.constantFrom("a", "b", "c", "x", "y", "z", "0", "1", "-", "_");
const literal = fc.array(character, { minLength: 1, maxLength: 4 }).map((chars) => chars.join(""));
const segment = fc.oneof(
  literal.map((word) => ({ pattern: word, match: word })),
  fc.tuple(literal, literal, literal).map(([left, middle, right]) => ({
    pattern: `${left}*${right}`,
    match: `${left}${middle}${right}`,
  })),
  fc.tuple(literal, character, literal).map(([left, middle, right]) => ({
    pattern: `${left}?${right}`,
    match: `${left}${middle}${right}`,
  })),
  fc.tuple(literal, literal).map(([left, right]) => ({
    pattern: `{${left},${right}}`,
    match: right,
  })),
);
const patternAndMatch = fc
  .tuple(fc.boolean(), fc.array(segment, { minLength: 1, maxLength: 3 }), literal)
  .map(([recursive, segments, prefix]) => ({
    pattern: `${recursive ? "**/" : ""}${segments.map((part) => part.pattern).join("/")}`,
    match: `${recursive ? `${prefix}/` : ""}${segments.map((part) => part.match).join("/")}`,
  }));
const path = fc.array(literal, { minLength: 1, maxLength: 4 }).map((segments) => segments.join("/"));

const examples = patternAndMatch.chain(({ pattern, match }) =>
  fc.oneof(fc.constant(match), path).map((candidate) => ({ pattern, candidate })),
);
const options = { seed: 45, numRuns: 5000 };
const agreement = (matcher: (pattern: string, candidate: string) => boolean) =>
  fc.property(examples, ({ pattern, candidate }) => matcher(pattern, candidate) === new Bun.Glob(pattern).match(candidate));

test.skipIf(!process.env.CI)(
  "rejects a matcher that never matches, then rejects disagreement with Bun.Glob excluding !(...) syntax",
  () => {
    const wrongMatcher = fc.check(agreement(() => false), options);
    expect(wrongMatcher.failed).toBe(true);
    console.log("Deliberate violation:", wrongMatcher);
    fc.assert(agreement(matchesGlob), options);
  },
);
