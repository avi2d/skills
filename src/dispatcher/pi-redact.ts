import type { ToolResultEvent, ToolResultEventResult } from "@earendil-works/pi-coding-agent";
import { scrub, stringsIn, withStrings, type Scrubbed } from "./redact";

type Structured = Exclude<ToolResultEventResult["structuredContent"], undefined>;

export type Redaction = { readonly result: ToolResultEventResult; readonly scrubbed: Exclude<Scrubbed, { type: "clean" }> };

const isList = (node: Structured): node is readonly Structured[] => Array.isArray(node);

function structuredWith(value: Structured, texts: readonly string[]): Structured {
  let at = 0;
  const walk = (node: Structured): Structured => {
    if (typeof node === "string") return texts[at++] ?? node;
    if (isList(node)) return node.map(walk);
    if (node === null || typeof node !== "object") return node;
    return Object.fromEntries(Object.entries(node).map(([key, item]) => [key, walk(item)]));
  };
  return walk(value);
}

// Pi drops the structured content of a result whose content a handler replaces alone, and codemode scripts read it in place of the content.
export async function redaction(event: ToolResultEvent, bundle: string, read: string | undefined): Promise<Redaction | undefined> {
  const texts = event.content.flatMap((part) => (part.type === "text" ? [part.text] : []));
  const details = stringsIn(event.details);
  const structured = stringsIn(event.structuredContent);
  const scrubbed = await scrub([...texts, ...details, ...structured], bundle, read);
  if (scrubbed.type === "clean") return undefined;
  const scrubbedTexts = scrubbed.texts.slice(0, texts.length);
  let at = 0;
  const content = event.content.map((part) => (part.type === "text" ? { ...part, text: scrubbedTexts[at++] ?? part.text } : part));
  const result: ToolResultEventResult = {
    content,
    details: withStrings(event.details, scrubbed.texts.slice(texts.length, texts.length + details.length)),
    ...(event.structuredContent === undefined
      ? {}
      : { structuredContent: structuredWith(event.structuredContent, scrubbed.texts.slice(texts.length + details.length)) }),
  };
  return { result, scrubbed };
}
