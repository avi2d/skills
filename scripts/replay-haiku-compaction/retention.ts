import { itemRecalled, normalize, parseItems, stripFileSections, worded } from "./scoring";

const FACT_CLASSES = ["url", "path", "taskId", "decisionKey", "quote", "toolQuote", "next", "openDecision"] as const;
type FactClass = (typeof FACT_CLASSES)[number];

export type ClassRetention = {
  readonly class: FactClass;
  readonly pooled: number;
  readonly recorded: number;
  readonly candidate: number;
};

type Fact = { readonly class: FactClass; readonly text: string };

export type Retention = {
  readonly classes: ClassRetention[];
  readonly lost: Fact[];
  readonly gained: Fact[];
};

const URL = /https?:\/\/[\w[][^\s<>"'`)\]}|]*/g;
const PATH = /(?<![\w@.~/-])(?:~\/|\.{1,2}\/|\/)?[\w.@+-]+(?:\/[\w.@+-]+)+\/?/g;
const EXTENSION = /\.[A-Za-z][A-Za-z0-9]{0,5}$/;
const TASK_ID_SOURCES = [
  /state\/([a-z0-9][a-z0-9.-]*[a-z0-9])\.(?:status|inbox)\b/g,
  /\bfm\/([a-z0-9][a-z0-9-]*[a-z0-9])/g,
  /\/tmp\/fm-([a-z0-9][a-z0-9-]*[a-z0-9])\//g,
  /\b(01[0-9A-HJKMNP-TV-Z]{24})\b/g,
];
const DECISION_KEY_SOURCES = [/\bkey=([A-Za-z0-9][\w.:-]*[A-Za-z0-9])/g, /\bcorr[= ]([0-9a-f]{8,})\b/g];
const QUOTE = /["\u201c]([^"\u201d\n]{8,400})["\u201d]/g;

function trimTail(text: string): string {
  return text.replace(/[.,;:!?*]+$/, "");
}

function matchesOf(text: string, pattern: RegExp): string[] {
  return [...text.matchAll(pattern)].map((match) => match[1] ?? match[0]);
}

export function urlsIn(text: string): string[] {
  return matchesOf(text, URL).map(trimTail);
}

export function pathsIn(text: string): string[] {
  return matchesOf(text.replace(URL, " "), PATH)
    .map(trimTail)
    .filter((path) => path.length >= 4)
    .filter((path) => /^(?:\/|~\/|\.{1,2}\/)/.test(path) || EXTENSION.test(path));
}

function quotesIn(text: string): string[] {
  return matchesOf(text, QUOTE)
    .map((quote) => quote.trim())
    .filter((quote) => quote.split(/\s+/).length >= 2);
}

function known(source: string, patterns: readonly RegExp[]): string[] {
  return [...new Set(patterns.flatMap((pattern) => matchesOf(source, pattern)))].filter((value) => value.length >= 4);
}

function mentions(text: string, id: string): boolean {
  let from = text.indexOf(id);
  while (from >= 0) {
    const before = text.charAt(from - 1);
    const after = text.charAt(from + id.length);
    if (!/[A-Za-z0-9-]/.test(before) && !/[A-Za-z0-9-]/.test(after)) return true;
    from = text.indexOf(id, from + 1);
  }
  return false;
}

function quoted(quote: string, wordedText: string): boolean {
  const words = worded(normalize(quote));
  return words.trim() !== "" && wordedText.includes(words);
}

type Indexed = { readonly raw: string; readonly norm: string; readonly words: string };

function indexed(text: string): Indexed {
  const raw = stripFileSections(text);
  const norm = normalize(raw);
  return { raw, norm, words: worded(norm) };
}

type Source = { readonly raw: string; readonly words: string; readonly captainWords: string; readonly taskIds: string[]; readonly decisionKeys: string[] };

function sourceOf(text: string, captainText: string): Source {
  return {
    raw: text,
    words: worded(normalize(text)),
    captainWords: worded(normalize(captainText)),
    taskIds: known(text, TASK_ID_SOURCES),
    decisionKeys: known(text, DECISION_KEY_SOURCES),
  };
}

function quoteClass(quote: string, source: Source): FactClass {
  return quoted(quote, source.captainWords) ? "quote" : "toolQuote";
}

function factsOf(summary: string, source: Source): Fact[] {
  const text = indexed(summary);
  const items = parseItems(summary);
  const raw: Fact[] = [
    ...urlsIn(text.raw).filter((url) => source.raw.includes(url)).map((fact) => ({ class: "url" as const, text: fact })),
    ...pathsIn(text.raw).filter((path) => source.raw.includes(path)).map((fact) => ({ class: "path" as const, text: fact })),
    ...source.taskIds.filter((id) => mentions(text.raw, id)).map((fact) => ({ class: "taskId" as const, text: fact })),
    ...source.decisionKeys.filter((key) => text.raw.includes(key)).map((fact) => ({ class: "decisionKey" as const, text: fact })),
    ...quotesIn(text.raw)
      .filter((quote) => quoted(quote, source.words))
      .map((quote) => ({ class: quoteClass(quote, source), text: quote })),
    ...items.filter((item) => item.class === "next").map((item) => ({ class: "next" as const, text: item.text })),
    ...items.filter((item) => item.openDecision).map((item) => ({ class: "openDecision" as const, text: item.text })),
  ];
  const seen = new Set<string>();
  return raw.filter((fact) => {
    const key = fact.class + "\u0000" + fact.text;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function retains(summary: string, fact: Fact): boolean {
  const text = indexed(summary);
  switch (fact.class) {
    case "url":
    case "path":
    case "decisionKey":
      return text.raw.includes(fact.text);
    case "taskId":
      return mentions(text.raw, fact.text);
    case "quote":
    case "toolQuote":
      return quoted(fact.text, text.words);
    case "next":
    case "openDecision":
      return itemRecalled({ class: fact.class, text: fact.text, quote: false, openDecision: false }, text.norm, text.words);
  }
}

function keyOf(fact: Fact): string {
  return fact.class + "\u0000" + fact.text;
}

export function retentionOf(recorded: string, candidate: string, sourceText: string, captainText: string): Retention {
  const source = sourceOf(sourceText, captainText);
  const recordedFacts = factsOf(recorded, source);
  const candidateFacts = factsOf(candidate, source);
  const recordedKeys = new Set(recordedFacts.map(keyOf));
  const candidateKeys = new Set(candidateFacts.map(keyOf));
  const pool = [...recordedFacts, ...candidateFacts.filter((fact) => !recordedKeys.has(keyOf(fact)))];
  const recordedHas = (fact: Fact): boolean => recordedKeys.has(keyOf(fact)) || retains(recorded, fact);
  const candidateHas = (fact: Fact): boolean => candidateKeys.has(keyOf(fact)) || retains(candidate, fact);
  const classes = FACT_CLASSES.map((name) => {
    const facts = pool.filter((fact) => fact.class === name);
    return {
      class: name,
      pooled: facts.length,
      recorded: facts.filter(recordedHas).length,
      candidate: facts.filter(candidateHas).length,
    };
  });
  return {
    classes,
    lost: recordedFacts.filter((fact) => !candidateHas(fact)),
    gained: candidateFacts.filter((fact) => !recordedHas(fact)),
  };
}

export function poolRetention(all: readonly Retention[]): ClassRetention[] {
  return FACT_CLASSES.map((name) => {
    const slots = all.map((one) => one.classes.find((slot) => slot.class === name));
    return {
      class: name,
      pooled: slots.reduce((sum, slot) => sum + (slot?.pooled ?? 0), 0),
      recorded: slots.reduce((sum, slot) => sum + (slot?.recorded ?? 0), 0),
      candidate: slots.reduce((sum, slot) => sum + (slot?.candidate ?? 0), 0),
    };
  });
}

export function retentionVerdict(pooled: readonly ClassRetention[], cases: number, all: readonly Retention[]): "MERGE-GRADE" | "NEEDS-DECISION" {
  if (cases < 20) return "NEEDS-DECISION";
  for (const slot of pooled) {
    if (slot.class === "toolQuote") continue;
    if (slot.candidate < slot.recorded) return "NEEDS-DECISION";
  }
  for (const one of all) {
    for (const fact of one.lost) {
      if (fact.class === "quote" || fact.class === "openDecision") return "NEEDS-DECISION";
    }
  }
  return "MERGE-GRADE";
}
