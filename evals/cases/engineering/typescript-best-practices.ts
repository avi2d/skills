import { noSchemaTwin, noTypeAssertion } from "../../typescript-judges";
import { manifest, withPackage, type EvalCase } from "../fixture";

const rule = "typescript-best-practices";

const EFFECT = manifest({ dependencies: { effect: "4.0.0-rc.115" } });

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
  {
    id: "schema-twin",
    rule,
    judge: noSchemaTwin,
    prompt:
      "Add `loadUsers(path)` to src/users.ts. It reads a JSON file that holds an array of users, checks each row against the `User` schema, and returns the rows as users. A row that does not match throws a `UsersError` that names the path. Cover it in tests/users.test.ts.",
    files: withPackage({
      "package.json": EFFECT,
      "src/users.ts": 'import { Schema } from "effect";\n\nexport const User = Schema.Struct({ id: Schema.String, age: Schema.Number });\n',
    }),
  },
];
