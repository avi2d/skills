import { KIND_DIRS, LIBRARY, LOCAL, parseFrontmatter, type Body, type Kind } from "../../src/bodies/bodies";
import { value } from "./effect";

export const frontmatterOf = (fields: Record<string, string>, prose = "# Body"): string =>
  ["---", ...Object.entries(fields).map(([k, v]) => `${k}: ${v}`), "---", "", prose, ""].join("\n");

export const dirFor = (kind: Kind, name: string, domain = "a-domain"): string => `${LIBRARY}/${domain}/${KIND_DIRS[kind]}/${name}`;

export const bodyOf = (fields: Record<string, string> & { kind: Kind; name: string }, prose = "# Body"): Body => {
  const skill = frontmatterOf(fields, prose);
  const dir = dirFor(fields.kind, fields.name);
  return { ...value(parseFrontmatter(dir, skill)), skill, assets: new Map() };
};

export const declared = {
  name: "a-rule",
  description: "What it is for.",
  source: LOCAL,
};

export const rule = { ...declared, kind: "rule", trigger: "{ predicate: always }" };
