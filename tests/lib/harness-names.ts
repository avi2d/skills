import { HARNESSES, SKILL_FILE, dirOf, type Body, type Harness } from "../../src/bodies/bodies";

const SPELLINGS: Record<Harness, RegExp> = {
  pi: /\bpi\b/i,
  "claude-code": /\bclaude[ -]?code\b|\.claude\b/i,
  codex: /\bcodex\b|\.codex\b/i,
};

const named = (text: string): Harness[] => HARNESSES.filter((h) => SPELLINGS[h].test(text));

export function texts(body: Body): Map<string, string> {
  const out = new Map([[SKILL_FILE, body.skill]]);
  const utf8 = new TextDecoder("utf-8", { fatal: true });
  for (const [rel, bytes] of body.assets) {
    try {
      out.set(rel, utf8.decode(bytes));
    } catch {
    }
  }
  return out;
}

export function undeclared(body: Body): string[] {
  const declared = new Set(body.harnesses ?? []);
  return [...texts(body)].flatMap(([rel, text]) =>
    named(text)
      .filter((h) => !declared.has(h))
      .map((h) => `${dirOf(body)}/${rel} names ${h}, which its \`harnesses\` field does not declare`),
  );
}
