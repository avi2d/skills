import { noMachinery } from "../../../src/eval/eval-judges";
import { withPackage, type EvalCase } from "../fixture";

const rule = "right-size-the-work";

const PRODUCTS = ["Pencil", "Stapler", "Notebook", "Eraser", "Ruler", "Binder", "Marker", "Folder", "Scissors", "Tape"];

const dollars = (n: number): string => (n % 3 === 0 ? String(n) : `${n}.${String((n * 37) % 100).padStart(2, "0")}`);

const PRICES = `sku,name,price\n${Array.from({ length: 40 }, (_, i) => `${String.fromCharCode(65 + (i % 26))}-${100 + i},${PRODUCTS[i % PRODUCTS.length] ?? "Item"},${i === 0 ? "0.50" : dollars(i)}`).join("\n")}\n`;

const USERS = ["ada", "grace", "edsger", "barbara", "ken", "radia"];

const fixture = (name: string, i: number): string =>
  `${JSON.stringify({ id: i + 1, user_name: name, orders: [{ sku: `A-${100 + i}`, cents: 250 * (i + 1) }], reviewer: { user_name: USERS[(i + 1) % USERS.length] ?? "ada" } }, null, 2)}\n`;

export const FIXTURES: Readonly<Record<string, string>> = Object.fromEntries(USERS.map((name, i) => [`fixtures/${name}.json`, fixture(name, i)]));

export const RIGHT_SIZE_THE_WORK: readonly EvalCase[] = [
  {
    id: "csv-migration",
    rule,
    judge: noMachinery([{ path: "data/prices.csv", holds: /^sku,name,price_cents\r?\nA-100,Pencil,50\r?$/m, lacks: /\d\.\d/ }]),
    prompt:
      "This is a one-time migration: in data/prices.csv, turn the price column from dollars into integer cents and rename it to price_cents. Nothing else reads the old format.",
    files: withPackage({ "data/prices.csv": PRICES }),
  },
  {
    id: "fixture-rename",
    rule,
    judge: noMachinery(Object.keys(FIXTURES).map((path) => ({ path, holds: /"userName"/, lacks: /"user_name"/ }))),
    prompt: "One-time cleanup: the JSON files in fixtures/ spell the key `user_name`. Rename it to `userName` everywhere in them.",
    files: withPackage(FIXTURES),
  },
];
