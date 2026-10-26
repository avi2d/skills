import { HARNESSES, NAME_PATTERN, dirOf, receives, type Body } from "../../src/bodies/bodies";
import { texts } from "./harness-names";

const POINTER = new RegExp(
  `(?:\`(${NAME_PATTERN})\`|\\*\\*(${NAME_PATTERN})\\*\\*)\\s+(?:principle\\s+)?(skill|reference|rule)s?\\b`,
  "gi",
);

export function dangling(body: Body, bodies: readonly Body[]): string[] {
  const out: string[] = [];
  const wrong = (rel: string, phrase: string, why: string) =>
    out.push(`${dirOf(body)}/${rel} sends a reader to ${JSON.stringify(phrase.trim())}, which ${why}`);

  for (const [rel, text] of texts(body)) {
    for (const [phrase, backticked, bolded, noun] of text.matchAll(POINTER)) {
      const name = (backticked ?? bolded)?.toLowerCase();
      if (name === undefined) continue;
      const target = bodies.find((b) => b.name === name);
      if (!target) {
        wrong(rel, phrase, "is not a Body in the tree");
        continue;
      }
      const missing = HARNESSES.filter((h) => receives(body, h) && !receives(target, h));
      if (missing.length > 0) wrong(rel, phrase, `${missing.join(" and ")} does not receive`);
      if (noun?.toLowerCase() !== target.kind) wrong(rel, phrase, `is a ${target.kind}`);
    }
  }
  return out;
}
