import { expect, test } from "bun:test";
import { readdir } from "node:fs/promises";
import { RECORDS, RECORD_INDEX } from "../../src/docs/docs";

const repo = new URL("../../", import.meta.url).pathname;
type Record = { file: string; filed: number; titled: number };

const NUMBERED = /^(\d{4})-[a-z0-9]+(?:-[a-z0-9]+)*\.md$/;
const HEADING = /^# (\d+)\. \S/;

const records = async (): Promise<Record[]> => {
  const files = (await readdir(`${repo}${RECORDS}`))
    .filter((name) => name.endsWith(".md") && `${RECORDS}/${name}` !== RECORD_INDEX)
    .sort();
  return Promise.all(
    files.map(async (file) => {
      const heading = (await Bun.file(`${repo}${RECORDS}/${file}`).text()).split("\n", 1)[0] ?? "";
      return {
        file,
        filed: Number(NUMBERED.exec(file)?.[1] ?? NaN),
        titled: Number(HEADING.exec(heading)?.[1] ?? NaN),
      };
    }),
  );
};

const filed = await records();

test("a record's file is a four-digit number and a kebab-case name, which is what sorts them", () => {
  const malformed = filed.filter((record) => Number.isNaN(record.filed)).map((record) => record.file);
  expect(malformed, "a record's name does not open with a four-digit number, so nothing places it").toEqual([]);
});

test("a record opens with the number its file carries, so the two cannot drift apart", () => {
  const disagreeing = filed
    .filter((record) => record.titled !== record.filed)
    .map((record) => `${record.file} opens with ${Number.isNaN(record.titled) ? "no number" : record.titled}`);
  expect(disagreeing, "a record's heading and its file name two different records").toEqual([]);
});

test("no two records hold the same number, because a number is how a record is cited", () => {
  const holders = new Map<number, string[]>();
  for (const record of filed) holders.set(record.filed, [...(holders.get(record.filed) ?? []), record.file]);
  const shared = [...holders]
    .filter(([, files]) => files.length > 1)
    .map(([number, files]) => `${String(number).padStart(4, "0")}: ${files.join(", ")}`);
  expect(shared, "two records answer to one number, so every citation of it names both").toEqual([]);
});
