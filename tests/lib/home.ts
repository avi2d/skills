import { lstat } from "node:fs/promises";
import { LINKS, MERGED } from "../../src/generate/link";

export async function isLinked(home: string): Promise<boolean> {
  const found = await Promise.all(
    [...Object.keys(LINKS), ...Object.keys(MERGED)].map((rel) => lstat(`${home}/${rel}`).then(() => true).catch(() => false)),
  );
  return found.every(Boolean);
}
