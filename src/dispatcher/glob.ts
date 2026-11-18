const LITERAL = /[.+^$()|[\]\\]/g;

type Token = { emit: string; over: number; depth: number };

function star(glob: string, i: number): Pick<Token, "emit" | "over"> {
  if (glob[i + 1] !== "*") return { emit: "[^/]*", over: 1 };
  return glob[i + 2] === "/" ? { emit: "(?:.*/)?", over: 3 } : { emit: ".*", over: 2 };
}

function exclusion(glob: string, i: number, depth: number, whole: string): Pick<Token, "emit" | "over"> {
  const close = glob.indexOf(")", i + 2);
  if (close < 0) throw new Error(`glob ${JSON.stringify(whole)} opens a !( exclusion and never closes it`);
  if (depth > 0) throw new Error(`glob ${JSON.stringify(whole)} puts a !( exclusion inside a { alternation`);
  const excluded = glob.slice(i + 2, close).split("|").map((branch) => source(branch, whole)).join("|");
  return { emit: `(?!(?:${excluded})${source(glob.slice(close + 1), whole)}$)[^/]*`, over: close + 1 - i };
}

function token(glob: string, i: number, depth: number, whole: string): Token {
  const c = glob.charAt(i);
  if (c === "*") return { ...star(glob, i), depth };
  if (c === "?") return { emit: "[^/]", over: 1, depth };
  if (c === "!" && glob[i + 1] === "(") return { ...exclusion(glob, i, depth, whole), depth };
  if (c === "{") return { emit: "(?:", over: 1, depth: depth + 1 };
  if (c === "}" && depth > 0) return { emit: ")", over: 1, depth: depth - 1 };
  if (c === "," && depth > 0) return { emit: "|", over: 1, depth };
  return { emit: c.replace(LITERAL, "\\$&"), over: 1, depth };
}

function source(glob: string, whole: string): string {
  let out = "";
  let depth = 0;
  for (let i = 0; i < glob.length; ) {
    const next = token(glob, i, depth, whole);
    out += next.emit;
    i += next.over;
    depth = next.depth;
  }
  if (depth > 0) throw new Error(`glob ${JSON.stringify(whole)} opens a { alternation and never closes it`);
  return out;
}

export const compileGlob = (glob: string): RegExp => new RegExp(`^${source(glob, glob)}$`);

export const matchesGlob = (glob: string, path: string): boolean => compileGlob(glob).test(path);
