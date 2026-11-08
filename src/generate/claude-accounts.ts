import type { Machine } from "./machine";

export const MAIN_ACCOUNT = "main";

export const SECOND_ACCOUNT = "second";

export type ClaudeAccount = typeof MAIN_ACCOUNT | typeof SECOND_ACCOUNT;

export const accountDirUnder = (account: ClaudeAccount): string => `.claude-accounts/${account}`;

export const CLAUDE_ACCOUNTS: Readonly<Record<Machine, readonly ClaudeAccount[]>> = {
  mac: [],
  windows: [MAIN_ACCOUNT, SECOND_ACCOUNT],
};
