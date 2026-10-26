import type { Check } from "./writing-judges";

type Invocation = readonly string[];

type Source = { text: string; paths: ReadonlySet<string>; commands: readonly Invocation[]; claims: readonly string[] };

const TOOL = "(?:bun|npm|npx|git|gh|docker|podman|yarn|pnpm|brew|cargo|python3?|pip3?|curl|wget|sudo|apt(?:-get)?|nix)";
const ARGUMENT = "\"[^\"\\n]*\"|'[^'\\n]*'|[^\\s,;!?`'\"()\\[\\]{}&|\u2013\u2014]*[^\\s.,;:!?`'\"()\\[\\]{}&|\u2013\u2014]";
const PROSE = "(?:to|and|or|then|with|for|in|on|from|again|after|before|until|if|when|so|that|as|by|и|или|затем|потом|чтобы|для|с|в|на|по|после|перед|снова|когда|если|а|но)(?=[\\s.,;:!?]|$)";
const INVOCATION = new RegExp(`\\b${TOOL}(?:[ \\t]+(?!${PROSE})(?:${ARGUMENT}))+`, "g");
const ARGUMENTS = new RegExp(ARGUMENT, "g");
const PLACEHOLDER = /^<[^>]+>$/;
const SLASHED = /(?<![\w./~$+=-])((?:[~.]?\/)?[\w.~$+=-]+(?:\/[\w.~$+=-]+)+)/g;
const FILENAME = /(?<![\w./~$+=-])([\w.~$+=-]+\.(?:json|ya?ml|toml|lock|csv|md|mdown|ts|mts|cts|js|mjs|cjs|tsx|jsx|sh|txt|diff|patch|log|db|sqlite))\b/gi;
const MODULES = /\bnode_modules\b/g;
const LITERAL = /`([^`]+)`|«([^»]+)»|"([^"]+)"|“([^”]+)”/g;
const CLAIM = [
  /\b(?:command|install(?:ation|er)?|test(?:s|ing)?|import(?:er|ing)?|run|build|ledger|it|they|this)\b[^.!?]{0,80}\b(?:ends?\s+with|prints?|outputs?|displays?|shows?|reports?|says|tells\s+you|you\s+(?:see|get))\b/i,
  /(?<!\p{L})(?:команд\p{L}*|установк\p{L}*|тест\p{L}*|импорт\p{L}*|запуск|сборк\p{L}*|ledger|он[аио]?|они|это)(?!\p{L})[^.!?]{0,80}(?<!\p{L})(?:вывод|выведет|печата|напечата|показ|покаж|отобра|сообща|сообщит|пишет|напишет|заканчива|законч|заверш|увидит|получит)\p{L}*/iu,
];
const CLAIM_ARTIFACT = [
  /\b(?:done|success(?:ful|fully)?|output|line|message|prompt|result|summary|green)\b/gi,
  /(?<!\p{L})(?:строк|сообщени|готово|успешн|результат|итог|зелён|приглашени)\p{L}*/giu,
];

const escaped = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const held = (text: string, literal: string): boolean => new RegExp(`(?<![\\p{L}\\p{N}_])${escaped(literal)}(?![\\p{L}\\p{N}_])`, "iu").test(text);

const invocationsIn = (text: string): Invocation[] => [...text.matchAll(INVOCATION)].map(([found]) => [...found.matchAll(ARGUMENTS)].map(([token]) => token));

const pathsIn = (text: string): string[] =>
  [...text.replace(/[a-z][a-z0-9+.-]*:\/\//gi, "").matchAll(SLASHED), ...text.matchAll(FILENAME)].map(([, token = ""]) =>
    token.replace(/[.,;:!?]+$/, ""),
  );

const sentencesOf = (text: string): string[] => text.split(/(?<=[.!?…])\s+/);

const shownBy = (sentence: string): string | undefined => {
  for (const claim of CLAIM) {
    const found = claim.exec(sentence);
    if (found !== null) return sentence.slice(found.index + found[0].length);
  }
  return undefined;
};

// The ignore file names node_modules without holding a claim about it.
const sourceOf = (files: Readonly<Record<string, string>>, written: string): Source => {
  const text = Object.entries(files)
    .filter(([path]) => path !== ".gitignore")
    .map(([, contents]) => contents)
    .join("\n");
  return {
    text,
    paths: new Set([...Object.keys(files), written, ...pathsIn(text)]),
    commands: invocationsIn(text),
    claims: sentencesOf(text).filter((sentence) => shownBy(sentence) !== undefined),
  };
};

export const both = (...checks: readonly Check[]): Check => (lines) => checks.flatMap((check) => check(lines));

const placeholdersFilled = (written: Invocation, command: Invocation): string[] | undefined =>
  written.length <= command.length && written.every((token, at) => PLACEHOLDER.test(command[at] ?? "") || token === command[at])
    ? written.filter((_, at) => PLACEHOLDER.test(command[at] ?? ""))
    : undefined;

const commandsIn = (line: string, source: Source): { found: string[]; free: ReadonlySet<string> } => {
  const found: string[] = [];
  const free = new Set<string>();
  for (const written of invocationsIn(line)) {
    const filled = source.commands.flatMap((command) => {
      const tokens = placeholdersFilled(written, command);
      return tokens === undefined ? [] : [tokens];
    });
    if (filled.length === 0) found.push(`an invented command the notes and repository do not hold: ${written.join(" ")}`);
    for (const token of filled.flat()) free.add(token);
  }
  return { found, free };
};

const placesIn = (line: string, source: Source, free: ReadonlySet<string>): string[] => {
  const found: string[] = [];
  for (const token of pathsIn(line)) {
    if (!source.paths.has(token) && !free.has(token)) found.push(`an invented path the notes and repository do not hold: ${token}`);
  }
  for (const [name] of line.matchAll(MODULES)) {
    if (!source.text.includes(name)) found.push(`an invented path the notes and repository do not hold: ${name}`);
  }
  return found;
};

const artifactsOf = (shown: string): string[] => [
  ...[...shown.matchAll(LITERAL)].map(([, ...quoted]) => quoted.join("")),
  ...CLAIM_ARTIFACT.flatMap((artifact) => [...shown.replace(LITERAL, "Code").matchAll(artifact)].map(([word]) => word)),
];

const claimsIn = (line: string, source: Source): string[] =>
  sentencesOf(line).flatMap((sentence) => {
    const shown = shownBy(sentence);
    return shown !== undefined && artifactsOf(shown).some((artifact) => !source.claims.some((claim) => held(claim, artifact)))
      ? [`states what the command shows, which the notes and repository do not hold: ${sentence.trim()}`]
      : [];
  });

export const noInvention = (files: Readonly<Record<string, string>>, written: string): Check => {
  const source = sourceOf(files, written);
  return (lines) =>
    lines.flatMap((line) => {
      const { found, free } = commandsIn(line, source);
      return [...new Set([...found, ...placesIn(line, source, free), ...claimsIn(line, source)])];
    });
};
