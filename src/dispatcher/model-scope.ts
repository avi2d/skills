export type IndexedProfile = {
  name: string;
  models: string[];
  rules: string[];
  skills: string[];
  references: string[];
  tools?: string[];
};

export type Trim = { type: "trim"; profile: string; why: string; rules: string[]; tools: string[] };

type Scoping = { profiles: readonly IndexedProfile[] };

function profileFor(index: Scoping, model: string | undefined): IndexedProfile | undefined {
  return index.profiles.find((profile) => profile.name !== "default" && model !== undefined && profile.models.includes(model))
    ?? index.profiles.find((profile) => profile.name === "default");
}

export function scopedFor(index: Scoping, rule: { readonly name: string }, model: string | undefined): boolean {
  return profileFor(index, model)?.rules.includes(rule.name) ?? true;
}

function trims(index: Scoping, model: string | undefined): boolean {
  return profileFor(index, model)?.tools !== undefined;
}

export function trimming(index: Scoping, model: string | undefined, holding: string[] | undefined): Trim[] {
  const profile = profileFor(index, model);
  if (!profile || profile.tools === undefined) return [];
  const tools = profile.tools;
  return [{ type: "trim", profile: profile.name, why: `the session's model is ${model}`, rules: profile.rules,
    tools: holding ? holding.filter((name) => tools.includes(name)) : tools }];
}

export function handedBack(index: Scoping, was: string | undefined, model: string | undefined, holding: string[] | undefined): Trim[] {
  if (trims(index, model)) return trimming(index, model, holding);
  if (!holding || !trims(index, was)) return [];
  const next = profileFor(index, model);
  return [{ type: "trim", profile: next?.name ?? "default", why: "the session's model now uses a Profile without tools", rules: next?.rules ?? [], tools: holding }];
}
