export const SECOND_ACCOUNT = "second";

export type ClaudeAccount = typeof SECOND_ACCOUNT;

export const accountDirUnder = (account: ClaudeAccount): string => `.claude-accounts/${account}`;
