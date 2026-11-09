import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ALPHANUMERIC = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

const alphanumeric = (length: number): string =>
  Array.from(crypto.getRandomValues(new Uint8Array(length)), (byte) => ALPHANUMERIC[byte % ALPHANUMERIC.length]).join("");

export const githubToken = (): string => `ghp_${alphanumeric(36)}`;

export const npmToken = (): string => `npm_${alphanumeric(36)}`;

export const wireguardKey = (): string => Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64");

export function wireguardKeyFile(dir: string, key: string): string {
  mkdirSync(dir, { recursive: true });
  const file = join(dir, "wg0-priv.key");
  writeFileSync(file, `${key}\n`);
  return file;
}
