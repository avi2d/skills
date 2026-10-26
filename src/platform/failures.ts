import { Schema } from "effect";

export class MalformedBody extends Schema.TaggedError<MalformedBody>()("MalformedBody", {
  message: Schema.String,
}) {}

export class UncomposableBodies extends Schema.TaggedError<UncomposableBodies>()("UncomposableBodies", {
  message: Schema.String,
}) {}

export class MalformedSelection extends Schema.TaggedError<MalformedSelection>()("MalformedSelection", {
  message: Schema.String,
}) {}

export class MalformedRecord extends Schema.TaggedError<MalformedRecord>()("MalformedRecord", {
  message: Schema.String,
}) {}

export class MalformedMachineConfig extends Schema.TaggedError<MalformedMachineConfig>()("MalformedMachineConfig", {
  message: Schema.String,
}) {}

export class FetchFailed extends Schema.TaggedError<FetchFailed>()("FetchFailed", {
  message: Schema.String,
}) {}

export class UnloadableBundle extends Schema.TaggedError<UnloadableBundle>()("UnloadableBundle", {
  message: Schema.String,
}) {}

export class FileFailure extends Schema.TaggedError<FileFailure>()("FileFailure", {
  path: Schema.String,
  message: Schema.String,
  code: Schema.optional(Schema.String),
}) {}

export const ABSENT = "ENOENT";

export function fileFailure(path: string, cause: unknown): FileFailure {
  const code = typeof cause === "object" && cause !== null && "code" in cause ? cause.code : undefined;
  return new FileFailure({
    path,
    message: cause instanceof Error ? cause.message : String(cause),
    code: typeof code === "string" ? code : undefined,
  });
}
