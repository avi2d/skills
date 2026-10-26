import { Option, Schema } from "effect";
import { addedLines, type AgentRun, type ProgramJudge } from "../src/eval/eval-judges";

const FENCE = /^\s*(?:```|~~~)/;
const proseLines = (lines: readonly string[]): string[] => {
  let fenced = false;
  return lines.flatMap((line) => {
    if (FENCE.test(line)) {
      fenced = !fenced;
      return [];
    }
    return fenced ? [] : [line.replaceAll(/`[^`]*`/g, "").replaceAll(/\]\([^)]*\)/g, "]")];
  });
};

const DASHED = /[\u2013\u2014();]|\S\s-\s\S/;

const NOMINAL = /^(?:\S+(?:ion|ing|ment)|setup|usage|tests|prerequisites|requirements|quickstart)$/i;

const headingOf = (line: string): string | undefined => /^#{1,6}\s+(?:(?:step|шаг)\s+\d+[.:)]?\s+|\d+[.)]\s+)?(.+)$/iu.exec(line)?.[1];

const frontMatterEnd = (lines: readonly string[]): number => (lines[0] === "---" ? lines.indexOf("---", 1) + 1 : 0);

// Line for line with the input, so an index found in the raw lines points at the same line here.
const bodyOutsideFences = (lines: readonly string[]): string[] => {
  const body = frontMatterEnd(lines);
  let fenced = false;
  return lines.map((line, at) => {
    if (FENCE.test(line)) {
      fenced = !fenced;
      return "";
    }
    return fenced || at < body ? "" : line;
  });
};

export const releasePointer: ProgramJudge = {
  name: "release-pointer",
  judge: ({ changes }) => {
    const doc = changes.find((change) => change.path === "AGENTS.md");
    if (doc === undefined) return { unjudged: "AGENTS.md was not changed" };
    const lines = addedLines(doc);
    const pointer = lines.find((line) => line.includes("docs/release.md"));
    if (pointer === undefined) return { unjudged: "the new instructions do not point release work at docs/release.md" };
    const copied = lines.some((line) => /bun run release:dry|git tag/.test(line));
    return { passed: !copied, evidence: [copied ? "the release procedure was copied into AGENTS.md" : `the release procedure stays behind the pointer: ${pointer}`] };
  },
};

const PROPER_NOUNS = new Set(["Ledger"]);

const titleCased = (line: string): boolean => {
  const words = (headingOf(line) ?? "").split(/\s+/).slice(1).filter((word) => /^[A-Za-z]{4,}$/.test(word) && !PROPER_NOUNS.has(word));
  return words.length > 0 && words.every((word) => /^[A-Z]/.test(word));
};

const TELLS: ReadonlyArray<readonly [string, (line: string) => boolean]> = [
  ["a heading in title case", titleCased],
  ["a fancy way to say \"is\"", (line) => /\b(?:serves|stands) as\b|\bboasts\b/i.test(line)],
  ["a passive sentence whose actor could lead it", (line) => /\b(?:is|are|was|were)\s+\w+ed\s+by\b/i.test(line)],
  ["an inline-header label", (line) => /^\s*(?:[-*]\s+)?\*\*[^*]+(?::\*\*|\*\*:)/.test(line)],
  ["a dash, a parenthesis or a semicolon", (line) => DASHED.test(line)],
];

const tellsIn = (lines: readonly string[]): string[] =>
  TELLS.flatMap(([tell, found]) => proseLines(lines).filter(found).map((line) => `${tell}: ${line}`));

const rewrittenOverview: Reader = ({ changes }) => {
  const page = changes.find((change) => change.path === "docs/overview.md");
  if (page === undefined) return { unjudged: "docs/overview.md was not changed" };
  if (!/ledger\.csv/.test(page.after) || !/bun run import/.test(page.after)) return { unjudged: "the rewritten overview dropped the import command or file" };
  return { lines: page.after.split("\n") };
};

export const plainOverview: ProgramJudge = {
  name: "plain-overview",
  judge: (run) => {
    const page = rewrittenOverview(run);
    if ("unjudged" in page) return page;
    const offenses = tellsIn(page.lines);
    return { passed: offenses.length === 0, evidence: offenses.length > 0 ? offenses : ["the import facts remain and the overview keeps none of the planted tells"] };
  },
};

export const plainPuffedOverview: ProgramJudge = {
  name: "plain-puffed-overview",
  judge: (run) => {
    const page = rewrittenOverview(run);
    if ("unjudged" in page) return page;
    const offenses = plainProse(page.lines);
    return { passed: offenses.length === 0, evidence: offenses.length > 0 ? offenses : ["the import facts remain and the overview keeps none of the planted tells"] };
  },
};

export const boundedReview: ProgramJudge = {
  name: "bounded-review",
  judge: ({ changes }) => {
    const doc = changes.find((change) => change.path === "AGENTS.md");
    if (doc === undefined) return { unjudged: "AGENTS.md was not changed" };
    const lines = addedLines(doc).filter((line) => line.trim() !== "");
    const text = lines.join("\n");
    if (!/bun (?:run )?test|test suite|test`? script/i.test(text) || !/fail/i.test(text)) return { unjudged: "the new review step does not run tests and address failures" };
    const bounded = /\b(?:0|zero|no) fail(?:s|ures)?\b|\b(?:suite|tests?)\b.{0,45}\b(?:pass(?:es)?|green)\b|\b(?:fix|resolve)\b.{0,35}\b(?:all|every|each)\b.{0,20}\bfail|\b(?:all|every|each)\b.{0,20}\bfail.{0,35}\b(?:fix|resolve)/i.test(text);
    return { passed: bounded, evidence: [bounded ? "the step names an observable end to resolving test failures" : "the step has no observable completion criterion for test failures", ...lines] };
  },
};

type Written = { lines: readonly string[] } | { unjudged: string };

export type Reader = (run: AgentRun) => Written;

export type Check = (lines: readonly string[]) => string[];

const writtenWith = (path: string, keeps: (before: string, after: string) => boolean, facts: readonly RegExp[]): Reader => ({ changes }) => {
  const page = changes.find((change) => change.path === path);
  if (page === undefined) return { unjudged: `${path} was not written` };
  if (!keeps(page.before ?? "", page.after)) return { unjudged: `${path} dropped what it held before` };
  const lines = addedLines(page);
  const text = lines.join("\n");
  return facts.every((fact) => fact.test(text)) ? { lines } : { unjudged: `${path} does not carry the facts the task gave` };
};

const everyLineKept = (before: string, after: string): boolean => {
  const kept = new Set(after.split("\n"));
  return before.split("\n").every((line) => line.trim() === "" || kept.has(line));
};

export const addedTo = (path: string, facts: readonly RegExp[]): Reader => writtenWith(path, everyLineKept, facts);

// A seeded line holding two sentences is one the Rule asks the agent to split, so what the file held is kept as facts rather than as lines.
export const revisedTo = (path: string, held: readonly RegExp[], facts: readonly RegExp[]): Reader =>
  writtenWith(path, (_, after) => held.every((fact) => fact.test(after)), facts);

const COMMIT_TYPE = /^[a-z]+(?:\([^)]*\))?!?:\s*/;
const SPAN_OR_CALL = /`[^`]*`|\b(?:[a-z]+[A-Z]\w*|\w+(?:\.\w+)+)\([^()\s]*\)|\b\w+\(\)/g;

// A commit message is plain text, so a call such as toFixed(2) carries no code span to set it apart from prose, and a conventional commit's scope is syntax a title lint reads.
const asProse = (message: string): string[] =>
  message
    .trim()
    .split("\n")
    .map((line, at) => (at === 0 ? line.replace(COMMIT_TYPE, "") : line).replaceAll(SPAN_OR_CALL, (found) => (found.startsWith("`") ? found : `\`${found}\``)));

// Git wraps a body at 72 columns, so a fact is read across the line breaks.
export const committedWith = (facts: readonly RegExp[]): Reader => ({ commits }) => {
  if (commits.length === 0) return { unjudged: "the run made no commit" };
  const lines = commits.flatMap(asProse);
  const text = lines.join(" ").replaceAll(/\s+/g, " ");
  return facts.every((fact) => fact.test(text)) ? { lines } : { unjudged: "the commit message does not carry the facts the task gave" };
};

export const sectionEach = (read: Reader, commands: readonly RegExp[]): Reader => (run) => {
  const written = read(run);
  if ("unjudged" in written) return written;
  const headings = commands.map((command) => headingAbove(written.lines, command));
  return headings.every((heading) => heading !== undefined) && new Set(headings).size === commands.length ? written : { unjudged: "the new commands do not sit under a heading each" };
};

const decodeMessages = Schema.decodeUnknownOption(Schema.fromJsonString(Schema.Record(Schema.String, Schema.Unknown)));

const stringsIn = (value: unknown): string[] =>
  typeof value === "string" ? [value] : typeof value === "object" && value !== null ? Object.values(value).flatMap(stringsIn) : [];

const textOf = (value: unknown): string => stringsIn(value).join("\n");

// Each message becomes a paragraph of its own, so no check reads two messages as one text.
export const messagesIn = (path: string, facts: Readonly<Record<string, readonly RegExp[]>>): Reader => ({ changes }) => {
  const file = changes.find((change) => change.path === path);
  if (file === undefined) return { unjudged: `${path} was not written` };
  const messages = Option.getOrUndefined(decodeMessages(file.after));
  if (messages === undefined) return { unjudged: `${path} is not a JSON object` };
  const missing = Object.keys(facts).filter((code) => textOf(messages[code]).trim() === "");
  if (missing.length > 0) return { unjudged: `${path} has no message for ${missing.join(", ")}` };
  const dropped = Object.entries(facts).flatMap(([code, needed]) => (needed.every((fact) => fact.test(textOf(messages[code]))) ? [] : [code]));
  if (dropped.length > 0) return { unjudged: `${path} drops the fact the task gave for ${dropped.join(", ")}` };
  return { lines: Object.values(messages).flatMap(stringsIn).flatMap((message) => ["", message]) };
};

export const judgedBy = (name: string, check: Check, read: Reader): ProgramJudge => ({
  name,
  judge: (run) => {
    const written = read(run);
    if ("unjudged" in written) return written;
    const offenses = check(written.lines);
    return { passed: offenses.length === 0, evidence: offenses.length > 0 ? offenses : [`the text breaks none of the ${name} asks this judge reads`] };
  },
});

const ITEM = /^\s*(?:[-*+]|\d+[.)])\s+/;
const UNREAD = /^\s*(?:\||<!--)/;

// A code span stands for one word, as a number or an identifier counts as one.
const plain = (line: string): string =>
  line
    .replace(ITEM, "")
    .replaceAll(/`[^`]*`/g, "Code")
    .replaceAll(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replaceAll(/https?:\/\/\S+/g, "Link")
    .trim();

type Line = { text: string; heading: boolean; item: boolean };

const linesOf = (lines: readonly string[]): Line[] => {
  let fenced = false;
  return lines.slice(frontMatterEnd(lines)).flatMap((line) => {
    if (FENCE.test(line)) {
      fenced = !fenced;
      return [];
    }
    if (fenced || line.trim() === "" || UNREAD.test(line)) return [{ text: "", heading: false, item: false }];
    const heading = headingOf(line);
    return [{ text: plain(heading ?? line), heading: heading !== undefined, item: ITEM.test(line) }];
  });
};

type Paragraph = { text: string; item: boolean };

const paragraphsOf = (lines: readonly string[]): Paragraph[] => {
  const paragraphs: Paragraph[] = [];
  let open = false;
  for (const line of linesOf(lines)) {
    const last = paragraphs.at(-1);
    if (line.text === "" || line.heading) open = false;
    else if (open && !line.item && last !== undefined) last.text = `${last.text} ${line.text}`;
    else {
      paragraphs.push({ text: line.text, item: line.item });
      open = true;
    }
  }
  return paragraphs;
};

const ABBREVIATED = /(?:\b(?:e\.g|i\.e|vs|cf)|т\. ?[дпе])\.$/iu;

const sentencesOf = (text: string): string[] =>
  text
    .split(/(?<=[.!?…][*_"»”)]*)\s+(?=[*_"«“(]*[\p{Lu}\p{N}])/u)
    .reduce<string[]>((sentences, piece) => {
      const last = sentences.at(-1);
      if (last !== undefined && ABBREVIATED.test(last)) sentences[sentences.length - 1] = `${last} ${piece}`;
      else sentences.push(piece);
      return sentences;
    }, [])
    .filter((sentence) => sentence.trim() !== "");

const WORD = /[\p{L}\p{N}](?:[\p{L}\p{N}._/'’-]*[\p{L}\p{N}])?/gu;

const wordsIn = (sentence: string): string[] => sentence.match(WORD) ?? [];

const LONGEST = 25;

const PASSIVE = /\b(?:is|are|was|were|be|been|being)\s+\w+ed\s+by\b/i;

const openingOf = (sentence: string): string => {
  const words = wordsIn(sentence.toLowerCase());
  return words.length < 2 ? "" : words.slice(0, 2).join(" ");
};

export const plainSentences: Check = (lines) =>
  paragraphsOf(lines).flatMap(({ text }) => {
    const sentences = sentencesOf(text);
    return [
      ...sentences.flatMap((sentence) => {
        const words = wordsIn(sentence).length;
        return words > LONGEST ? [`a sentence of ${words} words, over the ${LONGEST} the reference allows: ${sentence}`] : [];
      }),
      ...sentences.filter((sentence) => PASSIVE.test(sentence)).map((sentence) => `a passive sentence whose actor could lead it: ${sentence}`),
      ...sentences.filter((sentence) => /\bplease\b/i.test(sentence)).map((sentence) => `an instruction that says please: ${sentence}`),
      ...sentences.flatMap((sentence, at) => {
        const opening = openingOf(sentence);
        return at > 0 && opening !== "" && opening === openingOf(sentences[at - 1] ?? "") ? [`two sentences in a row open with "${opening}": ${sentence}`] : [];
      }),
    ];
  });

const tellsOf = (tells: ReadonlyArray<readonly [string, RegExp]>): Check => (lines) =>
  linesOf(lines).flatMap(({ text }) => tells.filter(([, found]) => found.test(text)).map(([tell]) => `${tell}: ${text}`));

export const plainWords: Check = tellsOf([
  ["filler", /\b(?:in order to|due to the fact that|it is important to note|note that|in the event that)\b/i],
  ["a long word where a short one does", /\b(?:utili[sz](?:e|es|ed|ing)|leverag(?:e|es|ed|ing)|facilitat(?:e|es|ed|ing)|numerous)\b/i],
  ["a fancy way to say is or has", /\b(?:serves|served|stands|stood) as\b|\bboasts?\b/i],
  ["AI vocabulary", /\b(?:additionally|crucial|delv(?:e|es|ing)|enduring|enhanc(?:e|es|ed|ing)|foster(?:s|ed|ing)?|garner(?:s|ed)?|interplay|intricate|showcas(?:e|es|ed|ing)|tapestry|underscor(?:e|es|ed|ing))\b/i],
  ["an abstract noun that hides a plainer word", /\b(?:substrate|wedge in|evacuat(?:e|es|ed|ing)|endgame|gold-plating|locus|vantage|nexus|bedrock|modality|paradigm|north star|flywheel)\b/i],
  ["a Latin abbreviation", /\b(?:e\.g|i\.e|etc|cf|viz)\.|\bvs\b\.?|\bet al\b/i],
  ["an idiom", /\b(?:out of the box|under the hood|in a nutshell|low-hanging fruit|heavy lifting|game[- ]changer|a breeze|at your fingertips)\b/i],
  ["a hedge", /\b(?:potentially|possibly|arguably)\b/i],
  ["an adverb propping up a verb", /\b(?:simply|easily|easy|quickly|significantly)\b/i],
]);

export const punctuation: Check = tellsOf([
  ["a dash, a parenthesis or a semicolon", DASHED],
  ["a slash for and or or", /\p{L}\/\p{L}|\s\/\s/u],
  ["a curly quote", /[“”‘’]/],
  ["a decorative emoji", /\p{Extended_Pictographic}/u],
  ["a list ended with etc.", /\betc\.|(?<!\p{L})и т\. ?[дп]\./iu],
  ["link text that does not say where it goes", /\bclick here\b|нажмите здесь/i],
  ["a bold label", /\*\*[^*]+(?::\*\*|\*\*:)/],
]);

// No infinitive puts a vowel before -ти, so пути and памяти read as the nouns they are.
const INFINITIVE = /^[а-яё]+(?:ть|ться|[^аеёиоуыэюяь]ти|тись)$/;
const NOUN_ENDING_AS_INFINITIVE = /(?:сть|[ао]сти|путь|сеть|суть|треть|ртуть|четверть|память|печать)$/;
const VERB_ENDING_AS_NOUN = /^(?:[а-яё]+честь|[а-яё]*(?:сесть|класть|красть|пасть|съесть)|(?:вы|под|про|от|на|за|до)?расти|спасти)$/;

const infinitive = (word: string): boolean => INFINITIVE.test(word) && (!NOUN_ENDING_AS_INFINITIVE.test(word) || VERB_ENDING_AS_NOUN.test(word));
const SINGULAR_IMPERATIVE =
  /^(?:установи|запусти|проверь|выполни|добавь|открой|нажми|выбери|попробуй|убедись|скачай|загрузи|укажи|введи|сохрани|удали|обнови|измени|склонируй|клонируй|перейди|импортируй|используй|примени|создай|скопируй|настрой|повтори|исправь|запиши|прочитай|посмотри|сделай|поставь|подключи|экспортируй|выгрузи|разбей|раздели)$/;
const FOREIGN =
  /(?<!\p{L})(?:vs|фикс(?!ир|ац)\p{L}*|пофикс\p{L}*|багфикс\p{L}*|баг(?:и|ов|а|у|ом|ам|ами|ах)?|юзер\p{L}*|фич(?:а|и|у|ей|ам|ами|ах|е)|апдейт\p{L}*|дефолт\p{L}*|кейс(?:ы|ов|а|у|ом|ам|ами|ах)?|юнит-тест\p{L}*|unit-тест\p{L}*)(?!\p{L})/iu;
const MOST_SENTENCES = 6;
const REFLEXIVE_NOT_PERSONAL = /\p{Script=Cyrillic}+(?:(?<!шь|й|[её]м|им)ся|[аиоя]сь)(?!\p{L})/giu;
const INHERENTLY_REFLEXIVE = /^(?:вся|нрав|бо[яию]|каж|явля|оста|станов|находи|оказ|появ|получа|получи|уда[её]|удало|удава|приходи|пришл|стара|пыта|учи(?!тыва)|занима|наде|сме[ёю]|здоров|просыпа|лож|сади|встреча|нужда|пользу|относ|каса|случа|случи|понадоб|убед|отлича|различа)/iu;
const MOST_PASSIVE = 5;
const passiveVerbs = (sentence: string): string[] => (sentence.match(REFLEXIVE_NOT_PERSONAL) ?? []).filter((word) => !INHERENTLY_REFLEXIVE.test(word));
const checkSentence = (sentence: string, item: boolean): string[] => {
  const verb = leadingVerb(sentence);
  return [...(SINGULAR_IMPERATIVE.test(verb) ? [`an instruction in the singular imperative: ${sentence}`] : []), ...(item && infinitive(verb) ? [`a step in the infinitive rather than the plural imperative: ${sentence}`] : []), ...[FOREIGN.exec(sentence)?.[0]].flatMap((word) => (word === undefined ? [] : [`"${word}" where a Russian word exists: ${sentence}`]))];
};

const MODAL = /^(?:нужно|можно|надо|необходимо|важно|стоит|нельзя)$/;

// An adverb such as "повторно" can lead a step, while "нужно решить" states a need rather than giving one.
const leadingVerb = (sentence: string): string => {
  const [first = "", second = ""] = sentence.toLowerCase().match(/[\p{L}-]+/gu) ?? [];
  return /о$/.test(first) && !MODAL.test(first) && infinitive(second) ? second : first;
};

export const russianProse: Check = (lines) => {
  const paragraphs = paragraphsOf(lines).map(({ text, item }) => ({ text, item, sentences: sentencesOf(text) }));
  const passive = paragraphs.flatMap(({ sentences }) => sentences.filter((sentence) => passiveVerbs(sentence).length > 0));
  return [
    ...paragraphs.flatMap(({ text, item, sentences }) => [...sentences.flatMap((sentence) => checkSentence(sentence, item)), ...(sentences.length > MOST_SENTENCES ? [`a paragraph of ${sentences.length} sentences, over the ${MOST_SENTENCES} the reference allows: ${text}`] : [])]),
    ...(passive.flatMap(passiveVerbs).length > MOST_PASSIVE ? passive.map((sentence) => `a reflexive passive verb where an actor could lead the sentence: ${sentence}`) : []),
  ];
};

const namesRussianTask = (word: string): boolean => /^(?:как|[а-яё]+те)$/.test(word) || infinitive(word);

const namesTheTask = (heading: string): boolean => {
  const first = heading.split(/\s+/)[0] ?? "";
  return /\p{Script=Cyrillic}/u.test(first) ? namesRussianTask(first.toLowerCase()) : !NOMINAL.test(first);
};

const headingAbove = (lines: readonly string[], command: RegExp): string | undefined =>
  bodyOutsideFences(lines).slice(0, lines.findIndex((line) => command.test(line))).findLast((line) => headingOf(line) !== undefined);

const continues = (next: Line | undefined): boolean => next !== undefined && next.text !== "" && !next.heading && !next.item;

const PAGE_TALK =
  /^(?:this|the following) (?:page|document|doc|guide|section|readme|file|article|tutorial)\b|^(?:этот|эта|это|данный|данная|данное|в этом|в этой|на этой) (?:раздел|документ|руководств|страниц|файл|стать|инструкци)/iu;
const NOT_NOW = /\b(?:will soon|is planned|are planned|coming soon|used to|formerly|no longer)\b|\buntil #\d|скоро появится|планируется/iu;
const MODE = /^kind:\s*(?:tutorial|how-to|reference|explanation)\s*$/m;

// The heading checked is the one over each command the task asked the doc to teach, since the kit's template adds nominal ones such as Troubleshooting.
export const docShape = (commands: readonly RegExp[], page: boolean): Check => (lines) => {
  const title = page ? bodyOutsideFences(lines).find((line) => /^#\s/.test(line)) : undefined;
  const headings = [...new Set([...(title === undefined ? [] : [title]), ...commands.flatMap((command) => headingAbove(lines, command) ?? [])])];
  const read = linesOf(lines);
  const prose = read.filter(({ text, heading }) => text !== "" && !heading);
  const wrapped = read.filter(({ text, heading }, at) => text !== "" && !heading && !/[.!?…:]["»”)*_]*$/.test(text) && continues(read[at + 1]));
  return [
    ...(page && !MODE.test(lines.slice(0, frontMatterEnd(lines)).join("\n")) ? ["the page names no Diátaxis mode in kind front matter"] : []),
    ...headings.filter((line) => !namesTheTask(headingOf(line) ?? "")).map((line) => `a heading names a thing rather than the task: ${line}`),
    ...headings.filter(titleCased).map((line) => `a heading in title case: ${line}`),
    ...prose.flatMap(({ text }) => {
      const sentences = sentencesOf(text);
      return [
        ...(sentences.length > 1 ? [`a line holds ${sentences.length} sentences: ${text}`] : []),
        ...sentences.filter((sentence) => PAGE_TALK.test(sentence)).map((sentence) => `talks about the page rather than the subject: ${sentence}`),
        ...sentences.filter((sentence) => NOT_NOW.test(sentence)).map((sentence) => `says what is not true now: ${sentence}`),
      ];
    }),
    ...wrapped.map(({ text }) => `a sentence wraps onto the next line: ${text}`),
  ];
};

export const firstPerson: Check = tellsOf([
  ["first person", /\bI\b/],
  ["first person", /\b(?:we|us|me|my|mine|our|ours|myself|ourselves)\b/i],
  ["first person", /(?<!\p{L})(?:я|мы|меня|нас|мне|нам|мной|мною|нами|мо(?:й|я|[её]|и|ю|его|ей|ею|ему|им|[её]м|их|ими)|наш(?:|а|е|и|у|его|ей|ею|ему|им|ем|их|ими))(?!\p{L})/iu],
]);

const INPUT = /csv/i;
const BENEFIT = /^\p{L}+\s+(?:helps?|lets?|allows?|saves?(?:\s+\p{L}+){0,2}\s+(?:time|hours|effort)|помога\p{L}*|позволя\p{L}*|экономит|избавля\p{L}*)(?!\p{L})/iu;

const codeSpansAsText = (line: string): string => line.replaceAll(/`([^`]*)`/g, "$1");

export const opensOnMechanism: Check = (lines) => {
  const first = paragraphsOf(lines.map(codeSpansAsText)).find(({ text }) => text !== "");
  if (first === undefined) return [];
  const [sentence] = sentencesOf(first.text);
  if (sentence === undefined) return [];
  return INPUT.test(sentence) && !BENEFIT.test(sentence) ? [] : [`does not open on the mechanism: ${sentence}`];
};

export const unslop: Check = tellsOf([
  [
    "puffery or promotion",
    /\b(?:pivotal|testament to|evolving landscape|setting the stage|indelible|nestled|vibrant|breathtaking|groundbreaking|renowned|must-visit|game[- ]chang\w*|cutting[- ]edge|revolutionary|transformative|unlock(?:s|ing)?|empower(?:s|ing)?|seamless(?:ly)?|effortless(?:ly)?|hassle[- ]free|worry[- ]free|peace of mind|powerful)\b|(?<!\p{L})(?:уникальн\p{L}*|революцион\p{L}*|мощн\p{L}*|идеальн\p{L}*|без лишних хлопот|без лишней рутины|без головной боли|забудьте о|в считанные (?:минуты|секунды)|легко и просто|раз и навсегда)(?!\p{L})/iu,
  ],
  ["a generic conclusion", /\bthe future looks bright\b|\bcontinues to thrive\b|\bdespite (?:the )?challenges\b/i],
  ["a framing set up to state the point", /\bnot (?:just|only|merely)\b[^.]*\bbut\b|(?<!\p{L})не (?:просто|только)(?!\p{L})[^.]*(?<!\p{L})(?:а|но и)(?!\p{L})/iu],
  ["an unsourced claim", /\b(?:experts|critics|studies|research) (?:say|says|believe|agree|argue|show|shows|suggest)\b|\bwhile specific details are limited\b/i],
  ["chatbot framing", /\bi hope this helps\b|\blet me know if\b|^certainly!|\bgreat question\b|\byou're absolutely right\b/i],
]);

export const plainProse: Check = (lines) => [...tellsIn(lines), ...unslop(lines)];

const agentsDoc = (changes: AgentRun["changes"]) => changes.find((change) => change.path === "AGENTS.md");

export const positiveTarget: ProgramJudge = {
  name: "positive-target",
  judge: ({ changes }) => {
    const doc = agentsDoc(changes);
    if (doc === undefined) return { unjudged: "AGENTS.md was not changed" };
    const lines = addedLines(doc).filter((line) => line.trim() !== "");
    const instruction = lines.filter((line) => /export/i.test(line));
    if (instruction.length === 0) return { unjudged: "the new instruction says nothing about exports" };
    const banned = instruction.filter((line) => /default[ -]exports?|export default/i.test(line));
    if (banned.length > 0) return { passed: false, evidence: banned.map((line) => `the instruction speaks the behaviour it bans: ${line}`) };
    return { passed: true, evidence: instruction.map((line) => `the instruction states the target alone: ${line}`) };
  },
};

const RESTATED = 2;

// One script named beside the gotcha can be the pointer to package.json, so a cache is two or more.
export const lookupLeft = (scripts: Readonly<Record<string, string>>, gotcha: RegExp): ProgramJudge => ({
  name: "lookup-left-to-the-environment",
  judge: ({ changes }) => {
    const doc = agentsDoc(changes);
    if (doc === undefined) return { unjudged: "AGENTS.md was not changed" };
    const lines = addedLines(doc);
    if (!lines.some((line) => gotcha.test(line))) return { unjudged: "AGENTS.md does not carry the gotcha the notes gave" };
    const rest = lines.map((line) => line.split(gotcha).join(" "));
    const restated = Object.entries(scripts).filter(([name, command]) => rest.some((line) => line.includes(`bun run ${name}`) || line.includes(command)));
    if (restated.length >= RESTATED) return { passed: false, evidence: restated.map(([name, command]) => `AGENTS.md restates the ${name} script, ${command}, which package.json holds`) };
    return { passed: true, evidence: [`AGENTS.md keeps the gotcha and restates ${restated.length} of the ${Object.keys(scripts).length} scripts`] };
  },
});

const HOW_TO_TEST = /\bbun (?:run )?test\b/;

export const oneSource: ProgramJudge = {
  name: "one-source",
  judge: ({ changes }) => {
    const doc = agentsDoc(changes);
    if (doc === undefined) return { unjudged: "AGENTS.md was not changed" };
    const added = addedLines(doc).join("\n");
    if (!/lint/i.test(added) || !/changelog/i.test(added)) return { unjudged: "the new section does not cover the lint and the changelog" };
    const stated = doc.after.split("\n").filter((line) => HOW_TO_TEST.test(line));
    if (stated.length > 1) return { passed: false, evidence: [`the test command is stated on ${stated.length} lines`, ...stated] };
    return { passed: true, evidence: [`the test command is stated once: ${stated[0] ?? "nowhere"}`] };
  },
};
