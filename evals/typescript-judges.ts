import { parseSync } from "@swc/core";
import { addedLineNumbers, type Change, type Judgement, type ProgramJudge } from "../src/eval/eval-judges";

// src/ may not import @swc/core, a devDependency, so the judges that parse TypeScript sit beside the cases.

const TYPESCRIPT = /\.[cm]?tsx?$/;

type Node = { type: string } & Readonly<Record<string, unknown>>;

const isNode = (value: unknown): value is Node => typeof value === "object" && value !== null && "type" in value && typeof value.type === "string";

function* nodesIn(value: unknown): Generator<Node> {
  if (typeof value !== "object" || value === null) return;
  if (isNode(value)) yield value;
  for (const child of Array.isArray(value) ? value : Object.values(value)) yield* nodesIn(child);
}

const offsetOf = (node: Node): number | undefined => {
  const { span } = node;
  return typeof span === "object" && span !== null && "start" in span && typeof span.start === "number" ? span.start : undefined;
};

type Finding = { node: Node; says: string };

type Parsed = { findings: string[] } | { unparsed: string };

// swc's span is a 1-based offset in UTF-8 bytes from the start of the source it parsed.
const lineAt = (bytes: Uint8Array, start: number): number => bytes.subarray(0, start - 1).filter((byte) => byte === 10).length + 1;

function findingsIn(change: Change, find: (root: Node) => Finding[]): Parsed {
  let root: unknown;
  try {
    root = parseSync(change.after, { syntax: "typescript", tsx: change.path.endsWith("x") });
  } catch (error) {
    return { unparsed: `${change.path} does not parse: ${String(error).split("\n")[0] ?? ""}` };
  }
  if (!isNode(root)) return { unparsed: `${change.path} parsed to no syntax tree` };
  const bytes = new TextEncoder().encode(change.after);
  const added = addedLineNumbers(change);
  return {
    findings: find(root).flatMap(({ node, says }) => {
      const start = offsetOf(node);
      if (start === undefined) return [];
      const line = lineAt(bytes, start);
      return added.has(line) ? [{ line, text: `${change.path}:${line} ${says}` }] : [];
    }).toSorted((a, b) => a.line - b.line).map(({ text }) => text),
  };
}

const judgeCode = (find: (root: Node) => Finding[], clean: string) => ({ changes }: { changes: readonly Change[] }): Judgement => {
  const code = changes.filter((change) => TYPESCRIPT.test(change.path));
  if (code.length === 0) return { unjudged: "the agent changed no TypeScript file, so there was no code to judge" };
  const findings: string[] = [];
  for (const change of code) {
    const parsed = findingsIn(change, find);
    if ("unparsed" in parsed) return { unjudged: `${parsed.unparsed}, so the run did not do the task` };
    findings.push(...parsed.findings);
  }
  if (findings.length > 0) return { passed: false, evidence: findings };
  return { passed: true, evidence: [`${code.length} changed TypeScript file(s) ${clean}: ${code.map((c) => c.path).join(", ")}`] };
};

const isKeyword = (node: unknown, kind: string): boolean => isNode(node) && node.type === "TsKeywordType" && node.kind === kind;

const assertionOf = (node: Node): string | undefined => {
  if (node.type === "TsAsExpression") return isKeyword(node.typeAnnotation, "unknown") ? undefined : "makes an `as` assertion";
  return node.type === "TsTypeAssertion" ? "makes an angle-bracket assertion" : undefined;
};

export const noTypeAssertion: ProgramJudge = {
  name: "no-type-assertion",
  judge: judgeCode(
    (root) => [...nodesIn(root)].flatMap((node) => {
      const says = assertionOf(node);
      return says === undefined ? [] : [{ node, says }];
    }),
    "add no type assertion",
  ),
};

const ERASERS = new Set(["ignore", "ignoreCause", "ignoreLogged", "catchCause", "catchCauseIf", "catchCauseFilter", "catchAllCause"]);

const HANDLED = new Set(["catch", "catchAll", "orElse", "orElseSucceed"]);

const DYING = new Set(["orDie", "orDieWith"]);

const effectMember = (node: unknown): string | undefined => {
  if (!isNode(node) || node.type !== "MemberExpression") return undefined;
  const { object, property } = node;
  if (!isNode(object) || object.type !== "Identifier" || object.value !== "Effect") return undefined;
  return isNode(property) && property.type === "Identifier" && typeof property.value === "string" ? property.value : undefined;
};

const nameOf = (param: unknown): string | undefined => {
  const pattern = isNode(param) && param.type === "Parameter" ? param.pat : param;
  return isNode(pattern) && pattern.type === "Identifier" && typeof pattern.value === "string" ? pattern.value : undefined;
};

const FUNCTIONS = new Set(["ArrowFunctionExpression", "FunctionExpression"]);

const readsItsError = (handler: unknown): boolean => {
  if (!isNode(handler) || !FUNCTIONS.has(handler.type)) return true;
  const [first] = Array.isArray(handler.params) ? handler.params : [];
  if (first === undefined) return false;
  const name = nameOf(first);
  if (name === undefined) return true;
  return !name.startsWith("_") && [...nodesIn(handler.body)].some((node) => node.type === "Identifier" && node.value === name);
};

const handlerOf = (call: Node): unknown => {
  const args = Array.isArray(call.arguments) ? call.arguments : [];
  const last: unknown = args.at(-1);
  return typeof last === "object" && last !== null && "expression" in last ? last.expression : undefined;
};

const erasureOf = (node: Node, failuresHappen: boolean): Finding | undefined => {
  if (node.type === "CallExpression") {
    const name = effectMember(node.callee);
    if (name === undefined || !HANDLED.has(name)) return undefined;
    const blind = name.startsWith("orElse") || !readsItsError(handlerOf(node));
    return blind ? { node, says: `erases the error with \`Effect.${name}\`, whose handler never reads it` } : undefined;
  }
  const name = effectMember(node);
  if (name === undefined) return undefined;
  if (ERASERS.has(name)) return { node, says: `erases the error with \`Effect.${name}\`` };
  if (failuresHappen && DYING.has(name)) return { node, says: `erases the error with \`Effect.${name}\`, claiming a failure the task says happens can never happen` };
  return undefined;
};

export const keepsTheErrorChannel = ({ failuresHappen }: { failuresHappen: boolean }): ProgramJudge => ({
  name: "keeps-the-error-channel",
  judge: judgeCode(
    (root) => [...nodesIn(root)].flatMap((node) => {
      const found = erasureOf(node, failuresHappen);
      return found === undefined ? [] : [found];
    }),
    "erase no error unseen",
  ),
});
