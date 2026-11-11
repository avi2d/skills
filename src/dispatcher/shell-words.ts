export type Word = { text: string; from: number; to: number; noExpand?: boolean };

const hasEscapedDollar = (inner: string): boolean => {
  let escaped = false;
  for (let at = 0; at < inner.length; at += 1) {
    const char = inner.charAt(at);
    if (escaped) {
      if (char === "$") return true;
      escaped = false;
    } else if (char === "\\") escaped = true;
  }
  return false;
};

type Lexer = { segments: Word[][]; word: string | undefined; from: number; to: number; noExpand: boolean; target: "drop" | "heredoc" | undefined; heredocs: string[]; inside: boolean[]; arithmetic: number };

function append(lexer: Lexer, text: string, from: number, to: number): void {
  if (lexer.word === undefined) lexer.from = from;
  lexer.word = (lexer.word ?? "") + text;
  lexer.to = to;
}

const SEPARATORS = new Set([";", "&", "|", "(", ")", "\n"]);

const BLANKS = new Set([" ", "\t"]);

function endWord(lexer: Lexer): void {
  const { word, target } = lexer;
  if (word === undefined) return;
  if (target === "heredoc") lexer.heredocs.push(word.replace(/^-/, ""));
  else if (target === undefined)
    lexer.segments.at(-1)?.push({ text: word, from: lexer.from, to: lexer.to, ...(lexer.noExpand ? { noExpand: true as const } : {}) });
  lexer.target = undefined;
  lexer.word = undefined;
  lexer.noExpand = false;
}

function quote(lexer: Lexer, command: string, at: number): number {
  const mark = command.charAt(at);
  let close = at + 1;
  if (mark === "\"") {
    while (close < command.length && command.charAt(close) !== "\"") close += command.charAt(close) === "\\" ? 2 : 1;
    if (close >= command.length) close = -1;
  } else {
    close = command.indexOf(mark, at + 1);
  }
  const stop = close === -1 ? command.length : close;
  const inner = command.slice(at + 1, stop);
  if (mark === "\x27" ? inner.includes("$") : hasEscapedDollar(inner)) lexer.noExpand = true;
  lexer.inside.fill(true, at, stop + 1);
  append(lexer, inner, at, stop + 1);
  return stop;
}

function redirect(lexer: Lexer, command: string, at: number): number {
  if (lexer.word !== undefined && /^\d+$/.test(lexer.word)) lexer.word = undefined;
  endWord(lexer);
  const [operator = ""] = /^[<>]+[&|]?\d*-?/.exec(command.slice(at)) ?? [];
  if (!/&(?:\d+)?-?$/.test(operator)) lexer.target = operator === "<<" || operator === "<<-" ? "heredoc" : "drop";
  return at + operator.length - 1;
}

function lineEnd(command: string, at: number): number {
  const next = command.indexOf("\n", at);
  return next === -1 ? command.length : next;
}

function pastHeredocs(command: string, newline: number, delimiters: readonly string[]): number {
  let at = newline;
  for (const delimiter of delimiters) {
    let line: string | undefined;
    while (at < command.length && line !== delimiter) {
      const end = lineEnd(command, at + 1);
      line = command.slice(at + 1, end).replace(/^\t+/, "");
      at = end;
    }
  }
  return at;
}

function separate(lexer: Lexer, command: string, at: number): number {
  const char = command.charAt(at);
  endWord(lexer);
  const past = char === "\n" && lexer.heredocs.length > 0 ? pastHeredocs(command, at, lexer.heredocs.splice(0)) : at;
  if (past > at) lexer.inside.fill(true, at, past + 1);
  if (SEPARATORS.has(char) && lexer.segments.at(-1)?.length !== 0) lexer.segments.push([]);
  return past;
}

function step(lexer: Lexer, command: string, at: number): number {
  const char = command.charAt(at);
  if (char === "'" || char === '"') return quote(lexer, command, at);
  if (char === "\\") {
    if (command.charAt(at + 1) === "$") lexer.noExpand = true;
    lexer.inside.fill(true, at, at + 2);
    if (command.charAt(at + 1) !== "\n") append(lexer, command.charAt(at + 1), at, at + 2);
    return at + 1;
  }
  if (char === "#" && lexer.word === undefined) {
    const next = lineEnd(command, at);
    lexer.inside.fill(true, at, next);
    return next - 1;
  }
  if (char === "$" && command.slice(at, at + 3) === "$((") {
    lexer.arithmetic += 2;
    append(lexer, "$((", at, at + 3);
    return at + 2;
  }
  if (lexer.arithmetic > 0 && char === "(") lexer.arithmetic += 1;
  else if (lexer.arithmetic > 0 && char === ")") lexer.arithmetic -= 1;
  if (lexer.arithmetic > 0 && (char === "<" || char === ">")) {
    append(lexer, char, at, at + 1);
    return at;
  }
  if (char === "<" || char === ">") return redirect(lexer, command, at);
  if (SEPARATORS.has(char) || BLANKS.has(char)) return separate(lexer, command, at);
  append(lexer, char, at, at + 1);
  return at;
}

type Scan = { segments: Word[][]; inside: boolean[] };

function scan(command: string): Scan {
  const lexer: Lexer = { segments: [[]], word: undefined, from: 0, to: 0, noExpand: false, target: undefined, heredocs: [], inside: new Array<boolean>(command.length).fill(false), arithmetic: 0 };
  for (let at = 0; at < command.length; at += 1) at = step(lexer, command, at);
  endWord(lexer);
  return { segments: lexer.segments.filter((segment) => segment.length > 0), inside: lexer.inside };
}

export function segments(command: string): Word[][] {
  return scan(command).segments;
}

export function quoted(command: string): boolean[] {
  return scan(command).inside;
}
