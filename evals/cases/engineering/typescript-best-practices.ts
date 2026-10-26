import { noTypeAssertion } from "../../typescript-judges";
import { withPackage, type EvalCase } from "../fixture";

const rule = "typescript-best-practices";

export const TYPESCRIPT_BEST_PRACTICES: readonly EvalCase[] = [
  {
    id: "json-config",
    rule,
    judge: noTypeAssertion,
    prompt:
      "Add `loadConfig(path)` to src/config.ts: it reads a JSON file and returns a `Config`, taking any field the file leaves out from `DEFAULTS`. Cover it in tests/config.test.ts.",
    files: withPackage({
      "src/config.ts":
        'export type Config = { readonly port: number; readonly host: string; readonly retries: number };\n\nexport const DEFAULTS: Config = { port: 8080, host: "localhost", retries: 3 };\n',
    }),
  },
  {
    id: "error-message",
    rule,
    judge: noTypeAssertion,
    prompt:
      "Add `readLedger(path)` to src/ledger-file.ts. It returns the file's non-empty lines, and when the file cannot be read it throws a `LedgerError` carrying the path and the message of the error that stopped it. Test both in tests/ledger-file.test.ts.",
    files: withPackage({
      "src/ledger-file.ts":
        "export class LedgerError extends Error {\n  constructor(\n    readonly path: string,\n    reason: string,\n  ) {\n    super(`${path}: ${reason}`);\n  }\n}\n",
    }),
  },
];
