export const HARNESSES = ["pi", "claude-code", "codex"] as const;
export type Harness = (typeof HARNESSES)[number];

export const isHarness = (value: unknown): value is Harness => (HARNESSES as readonly unknown[]).includes(value);
