import { afterEach, expect, test } from "bun:test";
import type { ProviderConfig } from "@earendil-works/pi-coding-agent";
import codexToken from "../../evals/codex-token";

const TOKEN_ENV = "OPENAI_ACCESS_TOKEN";
const saved = process.env[TOKEN_ENV];

afterEach(() => {
  if (saved === undefined) delete process.env[TOKEN_ENV];
  else process.env[TOKEN_ENV] = saved;
});

function registered() {
  const calls: Array<{ name: string; config: ProviderConfig }> = [];
  const pi = {
    registerProvider: (name: string, config: ProviderConfig): void => {
      calls.push({ name, config });
    },
  };
  return { pi, calls };
}

test("the eval token path registers the openai provider", () => {
  process.env[TOKEN_ENV] = "fixture-access-token";
  const { pi, calls } = registered();
  codexToken(pi);
  expect(calls.length).toBe(1);
  expect(calls[0]?.name).toBe("openai");
  expect(calls[0]?.config).toEqual({ apiKey: "$" + TOKEN_ENV });
});

test("a missing token stops with the openai entry and the login", () => {
  delete process.env[TOKEN_ENV];
  const { pi } = registered();
  let message = "";
  try {
    codexToken(pi);
  } catch (error) {
    message = error instanceof Error ? error.message : String(error);
  }
  expect(message).toContain("openai");
  expect(message).toContain("auth.json");
  expect(message).toContain("/login");
});
