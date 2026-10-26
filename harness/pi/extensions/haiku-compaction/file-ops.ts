import type { AssistantMessage } from "@earendil-works/pi-ai";
import type { SessionBeforeCompactEvent, SessionBeforeCompactResult } from "@earendil-works/pi-coding-agent";

export type BranchEntries = SessionBeforeCompactEvent["branchEntries"];

export type FileOps = {
  readonly read: ReadonlySet<string>;
  readonly edited: ReadonlySet<string>;
  readonly written: ReadonlySet<string>;
};

export type SessionModel = { readonly provider: string; readonly id?: string };

export type SummaryModel = {
  readonly id: string;
  readonly maxTokens: number;
};

export type SummaryRequest = {
  readonly systemPrompt?: string;
  readonly messages: {
    readonly role: "user";
    readonly content: { readonly type: "text"; readonly text: string }[];
    readonly timestamp: number;
  }[];
};

export type SummaryOptions = {
  readonly maxTokens: number;
  readonly signal: AbortSignal;
  readonly cacheRetention: "none";
  readonly sessionId: string;
};

export type SummaryRegistry = {
  find(provider: string, modelId: string): SummaryModel | undefined;
  complete(model: SummaryModel, context: SummaryRequest, options: SummaryOptions): Promise<AssistantMessage>;
};

export type Context = {
  readonly model: SessionModel | undefined;
  readonly modelRegistry: SummaryRegistry;
};

export type Pi = {
  on(
    event: "session_before_compact",
    handler: (event: unknown, ctx: Context) => Promise<SessionBeforeCompactResult | undefined>,
  ): unknown;
  getSettings(): unknown;
};
