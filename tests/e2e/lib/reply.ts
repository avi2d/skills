import { Schema } from "effect";

const Reply = Schema.Struct({
  decision: Schema.optionalKey(Schema.String),
  reason: Schema.optionalKey(Schema.String),
  systemMessage: Schema.optionalKey(Schema.String),
  hookSpecificOutput: Schema.optionalKey(
    Schema.Struct({
      hookEventName: Schema.optionalKey(Schema.String),
      additionalContext: Schema.optionalKey(Schema.String),
      permissionDecision: Schema.optionalKey(Schema.String),
      permissionDecisionReason: Schema.optionalKey(Schema.String),
      updatedInput: Schema.optionalKey(Schema.Record(Schema.String, Schema.Unknown)),
    }),
  ),
});

export type Reply = typeof Reply.Type;

const decodeReply = Schema.decodeUnknownSync(Schema.fromJsonString(Reply));

export const replyOf = (out: string): Reply | undefined => (out.trim() ? decodeReply(out) : undefined);

export const carried = (reply: Reply | undefined): string | undefined =>
  reply?.reason ?? reply?.hookSpecificOutput?.additionalContext ?? reply?.hookSpecificOutput?.permissionDecisionReason;
