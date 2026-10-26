import { keepsTheErrorChannel } from "../../typescript-judges";
import { manifest, withPackage, type EvalCase } from "../fixture";

const rule = "effect-error-channel";

const judge = keepsTheErrorChannel({ failuresHappen: true });

const EFFECT = manifest({ dependencies: { effect: "4.0.0-rc.115" } });

const SYNC = `import { Data, Effect } from "effect";

export class FetchFailed extends Data.TaggedError("FetchFailed")<{ readonly url: string; readonly status: number }> {}

export class RowMalformed extends Data.TaggedError("RowMalformed")<{ readonly line: number }> {}

export type Entry = { readonly id: string; readonly cents: number };

export const fetchEntries = (url: string): Effect.Effect<string, FetchFailed> =>
  Effect.tryPromise({
    try: async () => {
      const response = await fetch(url);
      if (!response.ok) throw new Error(\`status \${response.status}\`);
      return response.text();
    },
    catch: () => new FetchFailed({ url, status: 0 }),
  });

export const parseEntries = (csv: string): Effect.Effect<Entry[], RowMalformed> =>
  Effect.forEach(csv.trim().split("\\n").entries(), ([index, row]) => {
    const [id, cents] = row.split(",");
    return id !== undefined && cents !== undefined && /^\\d+$/.test(cents)
      ? Effect.succeed({ id, cents: Number(cents) })
      : Effect.fail(new RowMalformed({ line: index + 1 }));
  });

export const syncEntries = (url: string, save: (entries: Entry[]) => Effect.Effect<void>): Effect.Effect<void, FetchFailed | RowMalformed> =>
  fetchEntries(url).pipe(Effect.flatMap(parseEntries), Effect.flatMap(save));
`;

const MAIN = `import { Effect, Schedule } from "effect";
import { syncEntries, type Entry } from "./sync";

export const everyFiveMinutes = (job: Effect.Effect<void>): Effect.Effect<void> =>
  Effect.repeat(job, Schedule.spaced("5 minutes")).pipe(Effect.asVoid);

const save = (entries: Entry[]): Effect.Effect<void> => Effect.log(\`saved \${entries.length} entries\`);

export const main = everyFiveMinutes(syncEntries("https://bank.example/ledger.csv", save));
`;

const INVOICES = `import { Data, Effect } from "effect";

export class InvoiceNotFound extends Data.TaggedError("InvoiceNotFound")<{ readonly id: string }> {}

export class DatabaseDown extends Data.TaggedError("DatabaseDown")<{ readonly host: string }> {}

export type Invoice = { readonly id: string; readonly cents: number };

const ROWS = new Map<string, Invoice>([["inv-1", { id: "inv-1", cents: 1250 }]]);

export const getInvoice = (id: string): Effect.Effect<Invoice, InvoiceNotFound | DatabaseDown> =>
  Effect.suspend(() => {
    const row = ROWS.get(id);
    return row === undefined ? Effect.fail(new InvoiceNotFound({ id })) : Effect.succeed(row);
  });
`;

const SERVER = `import { Effect } from "effect";

export type Handler = (request: Request) => Promise<Response>;

export const serve =
  (respond: (request: Request) => Effect.Effect<Response>): Handler =>
  (request) =>
    Effect.runPromise(respond(request));

export const health: Handler = serve(() => Effect.succeed(new Response("ok")));
`;

export const EFFECT_ERROR_CHANNEL: readonly EvalCase[] = [
  {
    id: "scheduled-job",
    rule,
    judge,
    prompt:
      "src/main.ts does not typecheck: `everyFiveMinutes` takes a job that cannot fail, and `syncEntries` fails with `FetchFailed` when the bank's endpoint is down, which happens every few days, or with `RowMalformed` when an export is corrupt. Make it typecheck, and keep the job running every five minutes.",
    files: withPackage({ "package.json": EFFECT, "src/sync.ts": SYNC, "src/main.ts": MAIN }),
  },
  {
    id: "invoice-route",
    rule,
    judge,
    prompt:
      "Add `invoiceResponse(id)` to src/server.ts: it answers with the invoice `getInvoice` finds, as JSON, and `serve` hands it out. `serve` takes only an effect that cannot fail, and `getInvoice` fails with `InvoiceNotFound` for an unknown id or with `DatabaseDown` when the database cannot be reached.",
    files: withPackage({ "package.json": EFFECT, "src/invoices.ts": INVOICES, "src/server.ts": SERVER }),
  },
];
