import { existsSync, readFileSync } from "node:fs";
import { dispatch, unchecked, type Action, type Index, type RunState } from "./dispatch";

export type Place = { transcript: string; at: string; rules: string[] };

// A model entry shows the hook's reply is on disk only if the model began it
// after that reply: a sibling of the hooked call is written after the hook too.
type Answer = { message: string | undefined } | "once-fed-back";

export type Entry = { at: string; carried: readonly string[]; answer?: Answer; fedBack?: true };

export type EntryReader = (line: unknown) => Entry | undefined;

export function field(value: unknown, key: string): unknown {
  if (typeof value !== "object" || value === null || !(key in value)) return undefined;
  return Reflect.get(value, key);
}

export function textsOf(content: unknown): string[] {
  if (typeof content === "string") return [content];
  if (!Array.isArray(content)) return [];
  return content.flatMap((part: unknown) => {
    if (typeof part === "string") return [part];
    const text = field(part, "text");
    return typeof text === "string" ? [text] : [];
  });
}

export const isPlace = (value: unknown): value is Place => {
  const rules = field(value, "rules");
  return (
    typeof field(value, "transcript") === "string" &&
    typeof field(value, "at") === "string" &&
    Array.isArray(rules) &&
    rules.every((rule) => typeof rule === "string")
  );
};

export function recorded(transcript: string, after: string, entryOf: EntryReader): { answered: boolean; carrying: string } {
  const entries: Entry[] = [];
  for (const line of transcript.split("\n")) {
    if (!line.trim()) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }
    const entry = entryOf(parsed);
    if (entry) entries.push(entry);
  }
  const begun = new Set(entries.flatMap(({ at, answer }) => (at <= after && typeof answer === "object" && answer.message ? [answer.message] : [])));
  let answered = false;
  let fedBack = false;
  const carried: string[] = [];
  for (const { at, answer, carried: texts, fedBack: feeds } of entries) {
    if (at <= after) continue;
    if (answer === "once-fed-back") answered ||= fedBack;
    else if (answer) answered ||= answer.message === undefined || !begun.has(answer.message);
    fedBack ||= feeds === true;
    carried.push(...texts);
  }
  return { answered, carrying: carried.join("\n\n") };
}

export const readTranscript = (path: string): string | undefined => (existsSync(path) ? readFileSync(path, "utf8") : undefined);

const because = (e: unknown): string => (e instanceof Error ? e.message : String(e));

export function hear(
  index: Index,
  state: RunState,
  awaiting: readonly Place[],
  read: (transcript: string) => string | undefined,
  entryOf: EntryReader,
  final: boolean,
): { actions: Action[]; state: RunState; awaiting: Place[]; notes: string[] } {
  let current = state;
  const actions: Action[] = [];
  const notes: string[] = [];
  const still: Place[] = [];
  for (const place of awaiting) {
    const rules = place.rules.join(", ");
    let text: string | undefined;
    try {
      text = read(place.transcript);
    } catch (e) {
      notes.push(`broken dispatcher: ${place.transcript} could not be read (${because(e)}), so whether ${rules} arrived was not checked`);
      continue;
    }
    if (text === undefined) {
      if (final) notes.push(`broken dispatcher: ${place.transcript} was never written, so whether ${rules} arrived was not checked`);
      else still.push(place);
      continue;
    }
    const { answered, carrying } = recorded(text, place.at, entryOf);
    // The harness writes its transcript behind the conversation, so a record
    // without the model's answer may not yet hold the hook's reply either.
    if (!answered && !final) {
      still.push(place);
      continue;
    }
    const step = dispatch(index, { type: "requested", carrying, read: "transcript", rules: place.rules }, current);
    current = step.state;
    actions.push(...step.actions);
  }
  return { actions, state: current, awaiting: still, notes };
}

export function listenFor(
  awaiting: readonly Place[],
  state: RunState,
  sent: readonly Action[],
  transcript: string | undefined,
  at: string,
): { awaiting: Place[]; notes: string[] } {
  const open = unchecked(state);
  const notes: string[] = [];
  const kept: Place[] = [];
  for (const place of awaiting) {
    if (place.rules.some((rule) => open.includes(rule))) kept.push(place);
    else {
      notes.push(
        `broken dispatcher: whether ${place.rules.join(", ")} arrived was never checked, because they were put back in question before ${place.transcript} recorded an answer`,
      );
    }
  }
  const rules = sent.flatMap((action) => (action.type === "inject" || action.type === "deliver" ? [action.rule] : []));
  if (rules.length === 0) return { awaiting: kept, notes };
  if (!transcript) {
    notes.push(`broken dispatcher: ${rules.join(", ")} went out, and the harness named no transcript to check their arrival against`);
    return { awaiting: kept, notes };
  }
  return { awaiting: [...kept, { transcript, at, rules }], notes };
}
