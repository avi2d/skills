import { parseSync, type Expression, type ModuleItem } from "@swc/core";
import { constraintInProgram, type Change, type ProgramJudge } from "../src/eval/eval-judges";

// src/ may not import @swc/core, a devDependency, so the judge that parses a tsconfig sits beside the cases.

const TSCONFIG = /(^|\/)tsconfig(\.[^/]+)?\.json$/;
const PACKAGE_JSON = /(^|\/)package\.json$/;
const UNDER_TESTS = /tests|fixtures/;

// A path whose first segment is `.`, `..`, empty or a glob reaches the root, so it bounds nothing away from tests/.
const namesSubdirectory = (path: string): boolean => {
  const [head = ""] = path.replace(/^(\.\/)+/, "").split("/");
  return head !== "" && head !== "." && head !== ".." && !/[*?[\]{}!]/.test(head) && !UNDER_TESTS.test(path);
};

// JSON with comments and trailing commas, the shape `tsc --init` writes, is a JavaScript expression, so swc reads what tsc reads.
const parsed = (text: string | undefined): Expression | undefined => {
  if (text === undefined) return undefined;
  let body: ModuleItem[];
  try {
    body = parseSync(`(${text}\n)`, { syntax: "ecmascript" }).body;
  } catch {
    return undefined;
  }
  const [statement] = body;
  if (body.length !== 1 || statement?.type !== "ExpressionStatement" || statement.expression.type !== "ParenthesisExpression") return undefined;
  return statement.expression.expression;
};

const valueAt = (node: Expression | undefined, key: string): Expression | undefined => {
  if (node?.type !== "ObjectExpression") return undefined;
  let found: Expression | undefined;
  for (const property of node.properties) {
    if (property.type !== "KeyValueProperty") continue;
    if ((property.key.type === "StringLiteral" || property.key.type === "Identifier") && property.key.value === key) found = property.value;
  }
  return found;
};

const stringOf = (node: Expression | undefined): string | undefined => (node?.type === "StringLiteral" ? node.value : undefined);

const rootDirOf = (text: string | undefined): string | undefined => stringOf(valueAt(valueAt(parsed(text), "compilerOptions"), "rootDir"));

// A boundary that scopes compilation away from tests/fixtures is enforceable even where nothing on a changed line reads "tests" or "fixtures".
const enforcesTsRootBoundary = (change: Change): boolean => {
  if (!TSCONFIG.test(change.path)) return false;
  const rootDir = rootDirOf(change.after);
  return rootDir !== undefined && namesSubdirectory(rootDir) && rootDir !== rootDirOf(change.before);
};

const filesOf = (text: string | undefined): string[] | undefined => {
  const files = valueAt(parsed(text), "files");
  if (files?.type !== "ArrayExpression") return undefined;
  const names = files.elements.map((element) => (element?.spread ? undefined : stringOf(element?.expression)));
  return names.every((name) => name !== undefined) ? names : undefined;
};

// A package.json `files` list that excludes tests/fixtures enforces the same boundary as a root check, in a shape with no such marker on a line.
const excludesTestsFromPackageFiles = (change: Change): boolean => {
  if (!PACKAGE_JSON.test(change.path)) return false;
  const files = filesOf(change.after);
  if (files === undefined || files.length === 0 || !files.every(namesSubdirectory)) return false;
  return JSON.stringify(files) !== JSON.stringify(filesOf(change.before));
};

export const boundaryEnforced = (marker: RegExp): ProgramJudge => {
  const base = constraintInProgram(marker);
  return {
    name: base.name,
    judge: (run) => {
      const structural = run.changes.filter((c) => enforcesTsRootBoundary(c) || excludesTestsFromPackageFiles(c)).map((c) => c.path);
      if (structural.length > 0) return { passed: true, evidence: [`${structural.join(", ")} enforce(s) a root boundary or package exclusion`] };
      return base.judge(run);
    },
  };
};
