import { Effect } from "effect";
import { REACHABLE, SKILL_FILE, dirOf, prose, receives, type Body, type Harness } from "../bodies/bodies";
import type { HubBody, Index, IndexedProfile, IndexedRule } from "../dispatcher/dispatch";
import { UncomposableBodies, type MalformedBody } from "../platform/failures";

const indexedRule = Effect.fnUntraced(function* (
  body: Extract<Body, { kind: "rule" }>,
): Effect.fn.Return<IndexedRule, UncomposableBodies | MalformedBody> {
  const text = yield* prose(body);
  if (text === "") {
    return yield* new UncomposableBodies({
      message: `${dirOf(body)}: is frontmatter and nothing else, so there is nothing to inject`,
    });
  }
  return { name: body.name, triggers: body.trigger, text, ...(body.forbid ? { forbid: body.forbid } : {}) };
});

const byName = (a: IndexedRule, b: IndexedRule): number => a.name.localeCompare(b.name);

export const indexFor = Effect.fnUntraced(function* (
  harness: Harness,
  bodies: readonly Body[],
  profiles: readonly IndexedProfile[] = [],
  dormant: readonly Body[] = [],
): Effect.fn.Return<Index, UncomposableBodies | MalformedBody> {
  const rules: IndexedRule[] = [];
  for (const body of dormant) {
    if (body.kind === "rule" && receives(body, harness)) rules.push({ ...(yield* indexedRule(body)), inactive: true });
  }
  for (const body of bodies) {
    if (body.kind === "rule" && receives(body, harness)) rules.push(yield* indexedRule(body));
  }
  const received = (names: readonly string[]) => names.filter((name) => rules.some((rule) => rule.name === name));
  const hub: HubBody[] = bodies
    .filter((body) => REACHABLE.includes(body.kind))
    .map((body) => ({ name: body.name, skill: `${dirOf(body)}/${SKILL_FILE}` }))
    .toSorted((a, b) => a.name.localeCompare(b.name));
  return {
    harness,
    // The tree declares Rules in name order, and several Rules due at once are carried in that order.
    rules: rules.toSorted(byName),
    profiles: profiles.map((profile) => ({ ...profile, rules: received(profile.rules) })),
    hub,
  };
});

export const indexBytes = (index: Index): Uint8Array => new TextEncoder().encode(`${JSON.stringify(index, null, 2)}\n`);
