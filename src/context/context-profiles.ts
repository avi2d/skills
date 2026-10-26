import { Effect } from "effect";
import { kindAndName, prose, type Body } from "../bodies/bodies";
import { charsOf } from "./context-records";
import type { IndexedProfile } from "../dispatcher/dispatch";

export const PROFILE_PAGE = "docs/context-profiles.md";
type ProfilePart = { readonly kind: "rule" | "skill" | "reference"; readonly name: string; readonly chars: number; readonly ruleShare?: number };
export type ProfileSize = { readonly name: string; readonly models: readonly string[]; readonly tools: readonly string[] | undefined; readonly parts: readonly ProfilePart[] };

export const profileSizes = Effect.fnUntraced(function* (profiles: readonly IndexedProfile[], bodies: readonly Body[]) {
  const sizes = new Map<string, number>();
  for (const body of bodies) sizes.set(kindAndName(body), charsOf(body.kind === "rule" ? yield* prose(body) : body.skill));
  return profiles.map((profile): ProfileSize => {
    const parts: ProfilePart[] = [];
    const rules = profile.rules.map((name) => ({ kind: "rule" as const, name, chars: sizes.get(`rules/${name}`) ?? 0 }));
    const total = rules.reduce((sum, rule) => sum + rule.chars, 0);
    for (const rule of rules) parts.push({ ...rule, ruleShare: total === 0 ? 0 : (100 * rule.chars) / total });
    for (const name of profile.skills) parts.push({ kind: "skill", name, chars: sizes.get(`skills/${name}`) ?? 0 });
    for (const name of profile.references) parts.push({ kind: "reference", name, chars: sizes.get(`references/${name}`) ?? 0 });
    return { name: profile.name, models: profile.models, tools: profile.tools, parts };
  });
});

export const renderProfiles = (profiles: readonly ProfileSize[]): string => [
  "---",
  "kind: reference",
  "---",
  "# Profile context parts",
  "",
  "The tree supplies these character sizes for each Profile in `selection.toml`.",
  "No token counts appear here because a Body's character length does not measure its provider input tokens.",
  "Skills and References are links at open, not their full prose in the opening request.",
  "",
  ...profiles.flatMap((profile) => [
    `## ${profile.name}`,
    "",
    `Models: ${profile.models.length ? profile.models.map((model) => `\`${model}\``).join(", ") : "unlisted models"}.`,
    `Tools: ${profile.tools === undefined ? "set by the harness" : profile.tools.map((tool) => `\`${tool}\``).join(", ")}.`,
    "Tool definitions are absent from this repository and have no character size in this table.",
    "",
    "| Part | Characters | Share of Rules by characters |",
    "| --- | ---: | ---: |",
    ...profile.parts.map((part) => `| ${part.kind}: \`${part.name}\` | ${part.chars} | ${part.ruleShare === undefined ? "" : `${part.ruleShare.toFixed(1)}%`} |`),
    "",
  ]),
  "## Related topics",
  "",
  "- [Develop this repository](develop.md)",
  "",
].join("\n");
