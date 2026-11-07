const URL = /https?:\/\/[\w[][^\s<>"'`)\]}|]*/g;
const PATH = /(?<![\w@.~/-])(?:~\/|\.{1,2}\/|\/)?[\w.@+-]+(?:\/[\w.@+-]+)+\/?/g;
const EXTENSION = /\.[A-Za-z][A-Za-z0-9]{0,5}$/;
const TASK_ID_SOURCES = [
  /state\/([a-z0-9][a-z0-9.-]*[a-z0-9])\.(?:status|inbox)\b/g,
  /\bfm\/([a-z0-9][a-z0-9.-]*[a-z0-9])/g,
  /\/tmp\/fm-([a-z0-9][a-z0-9.-]*[a-z0-9])\//g,
  /(?<![0-9A-Za-z.-])(01[0-9A-HJKMNP-TV-Z]{24})(?![0-9A-Za-z-])(?!\.[A-Za-z0-9])/g,
];
const DECISION_KEY_SOURCES = [/(?<![\w-])key=([A-Za-z0-9][\w.:-]*[A-Za-z0-9])/g, /\bcorr[= ]([0-9a-f]{8,})\b/g];
const FACT_KINDS = ["url", "path", "taskId", "decisionKey"] as const;

export type FactKind = (typeof FACT_KINDS)[number];

export type ClassRetention = {
  readonly kind: FactKind;
  readonly pooled: number;
  readonly recorded: number;
  readonly candidate: number;
};

type Fact = {
  readonly kind: FactKind;
  readonly value: string;
};

export type Retention = {
  readonly classes: ClassRetention[];
  readonly lost: Fact[];
  readonly gained: Fact[];
};

function cleaned(text: string): string {
  return text.replace(/\\(\/|u[0-9a-fA-F]{4}|["bfnrt\\])/g, (match, esc: string) => {
    if (esc === "/") return "/";
    if (esc.startsWith("u")) return String.fromCharCode(Number.parseInt(esc.slice(1), 16));
    return " ";
  });
}

function trimTail(text: string): string {
  return text.replace(/[.,;:!?*]+$/, "");
}

function matchesOf(text: string, pattern: RegExp): string[] {
  return [...text.matchAll(pattern)].map((match) => match[1] ?? match[0]);
}

export function urlsIn(text: string): string[] {
  return matchesOf(cleaned(text), URL).map(trimTail);
}

export function pathsIn(text: string): string[] {
  const normalized = cleaned(text);
  return matchesOf(normalized.replace(URL, " "), PATH)
    .map(trimTail)
    .map((path) => path.replace(/\/$/, ""))
    .filter((path) => path.length >= 4)
    .filter((path) => /^(?:\/|~\/|\.{1,2}\/)/.test(path) || EXTENSION.test(path));
}

function known(text: string, patterns: readonly RegExp[]): string[] {
  return [...new Set(patterns.flatMap((pattern) => matchesOf(text, pattern)))].filter((value) => value.length >= 4);
}

type Source = {
  readonly urls: readonly string[];
  readonly paths: readonly string[];
  readonly taskIds: readonly string[];
  readonly decisionKeys: readonly string[];
};

function sourceOf(text: string): Source {
  const plain = cleaned(text);
  return {
    urls: urlsIn(plain),
    paths: pathsIn(plain),
    taskIds: known(plain, TASK_ID_SOURCES),
    decisionKeys: known(plain, DECISION_KEY_SOURCES),
  };
}

function summaryTaskIds(summary: string, taskIds: readonly string[]): string[] {
  const ids = new Set(taskIds);
  return [...new Set(known(cleaned(summary), TASK_ID_SOURCES))].filter((id) => ids.has(id));
}

function summaryDecisionKeys(summary: string, decisionKeys: readonly string[]): string[] {
  const ids = new Set(decisionKeys);
  return [...new Set(known(cleaned(summary), DECISION_KEY_SOURCES))].filter((key) => ids.has(key));
}

function factsOf(summary: string, source: Source): Fact[] {
  const urls = [...new Set(urlsIn(summary))].filter((url) => source.urls.includes(url));
  const paths = [...new Set(pathsIn(summary))].filter((path) => source.paths.includes(path));
  const taskIds = summaryTaskIds(summary, source.taskIds);
  const decisionKeys = summaryDecisionKeys(summary, source.decisionKeys);
  const facts: Fact[] = [
    ...urls.map((value) => ({ kind: "url" as const, value })),
    ...paths.map((value) => ({ kind: "path" as const, value })),
    ...taskIds.map((value) => ({ kind: "taskId" as const, value })),
    ...decisionKeys.map((value) => ({ kind: "decisionKey" as const, value })),
  ];
  return [...new Map(facts.map((fact) => [fact.kind + "\0" + fact.value, fact])).values()];
}

function keptBy(fact: Fact, others: readonly Fact[]): boolean {
  return others.some((other) => other.kind === fact.kind && other.value === fact.value);
}

function poolOf(recordedFacts: readonly Fact[], candidateFacts: readonly Fact[]): Fact[] {
  const pool = [...recordedFacts];
  for (const fact of candidateFacts) {
    if (!pool.some((other) => other.kind === fact.kind && other.value === fact.value)) pool.push(fact);
  }
  return pool;
}

export function retentionOf(recorded: string, candidate: string, sourceText: string): Retention {
  const source = sourceOf(sourceText);
  const recordedFacts = factsOf(recorded, source);
  const candidateFacts = factsOf(candidate, source);
  const pool = poolOf(recordedFacts, candidateFacts);
  return {
    classes: FACT_KINDS.map((kind) => {
      const facts = pool.filter((fact) => fact.kind === kind);
      return {
        kind,
        pooled: facts.length,
        recorded: facts.filter((fact) => keptBy(fact, recordedFacts)).length,
        candidate: facts.filter((fact) => keptBy(fact, candidateFacts)).length,
      };
    }),
    lost: recordedFacts.filter((fact) => !keptBy(fact, candidateFacts)),
    gained: candidateFacts.filter((fact) => !keptBy(fact, recordedFacts)),
  };
}

export function poolRetention(all: readonly Retention[]): ClassRetention[] {
  return FACT_KINDS.map((kind) => {
    const slots = all.map((one) => one.classes.find((slot) => slot.kind === kind));
    return {
      kind,
      pooled: slots.reduce((sum, slot) => sum + (slot?.pooled ?? 0), 0),
      recorded: slots.reduce((sum, slot) => sum + (slot?.recorded ?? 0), 0),
      candidate: slots.reduce((sum, slot) => sum + (slot?.candidate ?? 0), 0),
    };
  });
}
