import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { isRecord } from "./run-state";

export const SCANNER_CONFIG = "gitleaks.toml";

export const SCANNER_PIN = "secret-scanner.json";

export const SCAN_SECONDS = 15;

const KIT_CACHE = [".cache", "avi2dg-checks", "gitleaks"];

const DECODE_DEPTH = 5;

export type Scrubbed =
  | { readonly type: "clean" }
  | { readonly type: "redacted"; readonly texts: readonly string[]; readonly rules: readonly string[] }
  | { readonly type: "withheld"; readonly texts: readonly string[]; readonly why: string };

type Scanner = { readonly binary: string; readonly config: string };

type Finding = {
  readonly rule: string;
  readonly secret: string;
  readonly decoded: boolean;
  readonly startLine: number;
  readonly endLine: number;
};

type Span = { readonly from: number; readonly to: number; readonly rules: ReadonlySet<string> };

const because = (e: unknown): string => (e instanceof Error ? e.message : String(e));

function scannerIn(bundle: string): Scanner {
  const pin: unknown = JSON.parse(readFileSync(join(bundle, SCANNER_PIN), "utf8"));
  const version = isRecord(pin) ? pin.gitleaks : undefined;
  if (typeof version !== "string") throw new Error(`${join(bundle, SCANNER_PIN)} names no gitleaks version: regenerate it`);
  // node's homedir() reads $HOME every time, bun's answers from what the process started with.
  const binary = join(process.env.HOME ?? homedir(), ...KIT_CACHE, version, "gitleaks");
  if (!existsSync(binary)) throw new Error(`gitleaks ${version} is not installed at ${binary}, where the checks kit puts it when checks-secrets runs`);
  return { binary, config: join(bundle, SCANNER_CONFIG) };
}

type Reported = Record<"RuleID" | "Secret", string> & Record<"StartLine" | "EndLine", number> & { Tags: string[] };

const isFinding = (value: unknown): value is Reported =>
  isRecord(value) &&
  typeof value.RuleID === "string" &&
  typeof value.Secret === "string" &&
  Number.isInteger(value.StartLine) &&
  Number.isInteger(value.EndLine) &&
  Array.isArray(value.Tags) &&
  value.Tags.every((tag) => typeof tag === "string");

function findingsOf(report: string): Finding[] {
  const parsed: unknown = JSON.parse(report);
  if (!Array.isArray(parsed) || !parsed.every(isFinding)) throw new Error("gitleaks wrote a report this Dispatcher does not recognise");
  return parsed.map((found) => ({
    rule: found.RuleID,
    secret: found.Secret,
    decoded: found.Tags.some((tag) => tag.startsWith("decoded:")),
    startLine: found.StartLine,
    endLine: found.EndLine,
  }));
}

function gitleaks({ binary, config }: Scanner, source: readonly string[], input: string): Promise<Finding[]> {
  const quiet = mkdtempSync(join(tmpdir(), "skills-redact-"));
  // gitleaks reads a .gitleaksignore from where it runs, so it runs where a repository cannot put one.
  const args = [...source, "--config", config, "--gitleaks-ignore-path", quiet, "--ignore-gitleaks-allow", "--no-banner", "--no-color"];
  const report = ["--log-level", "error", "--exit-code", "0", "--report-format", "json", "--report-path", "-"];
  return new Promise<Finding[]>((resolve, reject) => {
    const child = spawn(binary, [...args, ...report], { cwd: quiet, stdio: ["pipe", "pipe", "pipe"] });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`gitleaks ran past ${SCAN_SECONDS}s`));
    }, SCAN_SECONDS * 1000);
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.stdin.on("error", reject);
    child.on("error", (e) => reject(new Error(`cannot run ${binary}: ${because(e)}`)));
    child.on("close", (code) => {
      clearTimeout(timer);
      const said = Buffer.concat(stderr).toString("utf8").trim();
      if (code !== 0 || said !== "") reject(new Error(`gitleaks failed: ${said || `exit code ${code}`}`));
      else {
        try {
          resolve(findingsOf(Buffer.concat(stdout).toString("utf8")));
        } catch (e) {
          reject(e);
        }
      }
    });
    child.stdin.end(input);
  }).finally(() => rmSync(quiet, { recursive: true, force: true }));
}

function occurrences(text: string, needle: string): [number, number][] {
  const found: [number, number][] = [];
  for (let at = text.indexOf(needle); at !== -1; at = text.indexOf(needle, at + needle.length)) found.push([at, at + needle.length]);
  return found;
}

function lineStart(text: string, line: number): number {
  let at = 0;
  for (let n = 1; n < line; n += 1) {
    const next = text.indexOf("\n", at);
    if (next === -1) return text.length;
    at = next + 1;
  }
  return at;
}

function linesSpan(text: string, first: number, last: number): [number, number] {
  const from = lineStart(text, first);
  const next = lineStart(text, last + 1);
  return [from, next > from && text[next - 1] === "\n" ? next - 1 : next];
}

const RUNS = [/[A-Za-z0-9+/_-]{16,}={0,3}/g, /[^\s"'<>`]*%[0-9A-Fa-f]{2}[^\s"'<>`]*/g];

const runsIn = (text: string): string[] => RUNS.flatMap((pattern) => text.match(pattern) ?? []);

function decodings(run: string): string[] {
  const decoded = [Buffer.from(run, "base64").toString("latin1")];
  if (/^(?:[0-9A-Fa-f]{2})+$/.test(run)) decoded.push(Buffer.from(run, "hex").toString("latin1"));
  if (run.includes("%")) decoded.push(run.replace(/%([0-9A-Fa-f]{2})/g, (_, hex: string) => String.fromCharCode(Number.parseInt(hex, 16))));
  return decoded;
}

function hides(run: string, secret: string, depth: number): boolean {
  return decodings(run).some(
    (decoded) => decoded.includes(secret) || (depth < DECODE_DEPTH && runsIn(decoded).some((inner) => hides(inner, secret, depth + 1))),
  );
}

// A decoded finding names the secret its encoding decodes to, so the encoded run is what the text holds.
// Line numbers count in the text only when the text was what gitleaks read, and not the file a read came from.
function spansOf(text: string, finding: Finding, inText: boolean): [number, number][] {
  const literal = finding.secret === "" ? [] : occurrences(text, finding.secret);
  if (!finding.decoded && literal.length > 0) return literal;
  const lines = linesSpan(text, finding.startLine, finding.endLine);
  const region = inText ? text.slice(...lines) : text;
  const runs = finding.secret === "" ? [] : runsIn(region).filter((run) => hides(run, finding.secret, 1));
  if (runs.length > 0) return [...literal, ...runs.flatMap((run) => occurrences(text, run))];
  return inText ? [...literal, lines] : literal;
}

function merged(spans: readonly Span[]): Span[] {
  const out: Span[] = [];
  for (const span of spans.toSorted((a, b) => a.from - b.from)) {
    const last = out.at(-1);
    if (last !== undefined && span.from <= last.to) {
      out[out.length - 1] = { from: last.from, to: Math.max(last.to, span.to), rules: new Set([...last.rules, ...span.rules]) };
    } else out.push(span);
  }
  return out;
}

const marker = (rules: ReadonlySet<string>): string => `[redacted: ${[...rules].toSorted().join(", ")}]`;

function cut(texts: readonly string[], spans: readonly Span[]): string[] {
  let start = 0;
  return texts.map((text) => {
    const end = start + text.length;
    let kept = "";
    let at = start;
    for (const span of spans) {
      if (span.to <= start || span.from > end) continue;
      if (span.from > at) kept += text.slice(at - start, span.from - start);
      if (span.from >= start) kept += marker(span.rules);
      at = Math.max(at, Math.min(span.to, end));
    }
    kept += text.slice(at - start);
    start = end + 1;
    return kept;
  });
}

const SHAPE = /^[a-z_]{1,24}$/;

const withheld = (texts: readonly string[], why: string): Scrubbed => {
  const message = `[tool output withheld: the secret scan could not run, so this output may hold a credential: ${why}]`;
  const kept = texts.map((text) => (text === "" || SHAPE.test(text) ? text : message));
  return { type: "withheld", texts: kept.some((text) => text === message) ? kept : [message, ...kept.slice(1)], why };
};

// The texts are scanned as one, joined by newlines, so a finding's line numbers count across all of them.
export async function scrub(texts: readonly string[], bundle: string, file?: string): Promise<Scrubbed> {
  const text = texts.join("\n");
  if (text.trim() === "") return { type: "clean" };
  let inText: Finding[];
  let inFile: Finding[];
  try {
    const scanner = scannerIn(bundle);
    [inText, inFile] = await Promise.all([
      gitleaks(scanner, ["stdin"], text),
      file === undefined ? Promise.resolve([]) : gitleaks(scanner, ["dir", file], ""),
    ]);
  } catch (e) {
    return withheld(texts, because(e));
  }
  const spans = [
    ...inText.flatMap((finding) => spansOf(text, finding, true).map(([from, to]) => ({ from, to, rules: new Set([finding.rule]) }))),
    ...inFile.flatMap((finding) => spansOf(text, finding, false).map(([from, to]) => ({ from, to, rules: new Set([finding.rule]) }))),
  ];
  if (spans.length === 0) return { type: "clean" };
  const rules = [...new Set(spans.flatMap((span) => [...span.rules]))].toSorted();
  return { type: "redacted", texts: cut(texts, merged(spans)), rules };
}

function mapStrings(value: unknown, f: (text: string) => string): unknown {
  if (typeof value === "string") return f(value);
  if (Array.isArray(value)) return value.map((item) => mapStrings(item, f));
  if (isRecord(value)) return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, mapStrings(item, f)]));
  return value;
}

export function stringsIn(value: unknown): string[] {
  const found: string[] = [];
  mapStrings(value, (text) => {
    found.push(text);
    return text;
  });
  return found;
}

export function withStrings(value: unknown, texts: readonly string[]): unknown {
  let at = 0;
  return mapStrings(value, (text) => texts[at++] ?? text);
}

export function scrubbedLine(tool: string, scrubbed: Exclude<Scrubbed, { type: "clean" }>): string {
  const line = scrubbed.type === "redacted" ? `redact ${tool}: ${scrubbed.rules.join(", ")}` : `withhold ${tool}: ${scrubbed.why}`;
  return line.replace(/\r\n|\r|\n/g, "\\n");
}
