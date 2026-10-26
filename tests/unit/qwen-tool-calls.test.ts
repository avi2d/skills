import { describe, expect, test } from "bun:test";
import { Type } from "@earendil-works/pi-ai";
import { createSyntheticSourceInfo } from "@earendil-works/pi-coding-agent";
import {
  emitsQwenToolCalls,
  parseValue,
  repair,
  typesFromTools,
  typesOf,
  type TypesFor,
} from "../../harness/pi/extensions/qwen-tool-calls";

// The bytes pi received from Ollama 0.34.2 on a run that dead-ended with no tool executed.
const LEAKED = `I'll read the notes.txt file and provide exactly its second line.

<function=read>
<parameter=path>
notes.txt
</parameter>
</function>
</tool_call>`;

const WRAPPED = `Reading it now.

<tool_call>
<function=read>
<parameter=path>
notes.txt
</parameter>
</function>
</tool_call>`;

const readTypes = typesOf({
  type: "object",
  properties: {
    path: { type: "string" },
    offset: { type: "integer" },
    limit: { type: "number" },
  },
});

const typesFor: TypesFor = (tool) => (tool === "read" ? readTypes : undefined);

describe("repair", () => {
  test("recovers the call Ollama left as text, opener missing and closer stray", () => {
    expect(repair(LEAKED, typesFor)).toEqual({
      text: "I'll read the notes.txt file and provide exactly its second line.",
      calls: [{ name: "read", arguments: { path: "notes.txt" } }],
    });
  });

  test("recovers the same call when the opener is present", () => {
    expect(repair(WRAPPED, typesFor)).toEqual({
      text: "Reading it now.",
      calls: [{ name: "read", arguments: { path: "notes.txt" } }],
    });
  });

  test("leaves ordinary prose untouched", () => {
    expect(repair("The second line is beta.", typesFor)).toBeUndefined();
    expect(repair("", typesFor)).toBeUndefined();
    expect(repair("A function= sign is not a call.", typesFor)).toBeUndefined();
  });

  test("types each argument against the registered tool's schema", () => {
    const text = `<function=read>
<parameter=path>
notes.txt
</parameter>
<parameter=offset>
12
</parameter>
<parameter=limit>
2.5
</parameter>
</function>`;
    expect(repair(text, typesFor)?.calls).toEqual([
      { name: "read", arguments: { path: "notes.txt", offset: 12, limit: 2.5 } },
    ]);
  });

  test("leaves an argument raw when the tool is not registered", () => {
    const text = "<function=mystery>\n<parameter=n>\n12\n</parameter>\n</function>";
    expect(repair(text, typesFor)?.calls).toEqual([{ name: "mystery", arguments: { n: "12" } }]);
  });

  test("recovers several calls and keeps the prose between them", () => {
    const text = `First.
<function=read>
<parameter=path>
a.txt
</parameter>
</function>
</tool_call>
Then.
<function=read>
<parameter=path>
b.txt
</parameter>
</function>`;
    expect(repair(text, typesFor)).toEqual({
      text: "First.\nThen.",
      calls: [
        { name: "read", arguments: { path: "a.txt" } },
        { name: "read", arguments: { path: "b.txt" } },
      ],
    });
  });

  test("recovers a call that takes no parameters", () => {
    expect(repair("<function=ls>\n</function>", typesFor)?.calls).toEqual([{ name: "ls", arguments: {} }]);
  });

  test("fails closed on a block that does not parse", () => {
    expect(repair("<function=read>\n<parameter=path>\nnotes.txt\n</parameter>", typesFor)).toBeUndefined();
    expect(repair("<function=read>\n<parameter=path\nnotes.txt\n</parameter>\n</function>", typesFor)).toBeUndefined();
    expect(repair("<function=read", typesFor)).toBeUndefined();
  });
});

describe("parseValue", () => {
  test("strips one surrounding newline and nothing more", () => {
    expect(parseValue("\nnotes.txt\n", ["string"])).toBe("notes.txt");
    expect(parseValue("\n\nnotes.txt\n\n", ["string"])).toBe("\nnotes.txt\n");
    expect(parseValue("  spaced  ", ["string"])).toBe("  spaced  ");
  });

  test("reads null ahead of every declared type", () => {
    expect(parseValue("null", ["string"])).toBeNull();
    expect(parseValue("NULL", [])).toBeNull();
  });

  test("keeps an untyped value as the raw string", () => {
    expect(parseValue("12", [])).toBe("12");
    expect(parseValue("true", [])).toBe("true");
  });

  test("parses numbers, booleans, arrays and objects", () => {
    expect(parseValue("12", ["integer"])).toBe(12);
    expect(parseValue("-3", ["integer"])).toBe(-3);
    expect(parseValue("2.5", ["number"])).toBe(2.5);
    expect(parseValue("1e3", ["number"])).toBe(1000);
    expect(parseValue("true", ["boolean"])).toBe(true);
    expect(parseValue("False", ["boolean"])).toBe(false);
    expect(parseValue('["a","b"]', ["array"])).toEqual(["a", "b"]);
    expect(parseValue('{"a":1}', ["object"])).toEqual({ a: 1 });
    expect(parseValue('{"a":[1,{"b":null}]}', ["object"])).toEqual({ a: [1, { b: null }] });
  });

  test("falls back the way Ollama's parser does when the only declared type refuses the value", () => {
    expect(parseValue("yes", ["boolean"])).toBe(false);
    expect(parseValue("twelve", ["integer"])).toBe("twelve");
    expect(parseValue("0x10", ["number"])).toBe("0x10");
    expect(parseValue("not json", ["array"])).toBe("not json");
    expect(parseValue("[1]", ["object"])).toBe("[1]");
    expect(parseValue('{"a":1}', ["array"])).toBe('{"a":1}');
  });

  test("walks a union in the precedence Ollama's parser uses", () => {
    expect(parseValue("123", ["string", "number"])).toBe(123);
    expect(parseValue("hello", ["string", "number"])).toBe("hello");
    expect(parseValue("yes", ["boolean", "string"])).toBe("yes");
  });
});

describe("typesOf", () => {
  test("reads a declared type, a union of types, and an anyOf", () => {
    const types = typesOf({
      type: "object",
      properties: {
        path: { type: "string" },
        size: { type: ["integer", "string"] },
        filter: { anyOf: [{ type: "string" }, { type: "array" }] },
        loose: {},
      },
    });
    expect(types.get("path")).toEqual(["string"]);
    expect(types.get("size")).toEqual(["integer", "string"]);
    expect(types.get("filter")).toEqual(["string", "array"]);
    expect(types.get("loose")).toEqual([]);
    expect(types.get("absent")).toBeUndefined();
  });

  test("reads a schema with no properties as no types at all", () => {
    expect(typesOf(undefined).size).toBe(0);
    expect(typesOf({ type: "object" }).size).toBe(0);
  });
});

describe("typesFromTools", () => {
  test("looks a registered tool up by name and nothing else", () => {
    const lookup = typesFromTools([
      {
        name: "read",
        description: "Read a file",
        parameters: Type.Object({ path: Type.String() }),
        exposure: "direct",
        sourceInfo: createSyntheticSourceInfo("/read.ts", { source: "test" }),
      },
    ]);
    expect(lookup("read")?.get("path")).toEqual(["string"]);
    expect(lookup("write")).toBeUndefined();
  });
});

describe("emitsQwenToolCalls", () => {
  test("names the models that emit this format and no others", () => {
    expect(emitsQwenToolCalls("qwen3-coder:30b")).toBe(true);
    expect(emitsQwenToolCalls("qwen3-coder-agent:30b")).toBe(true);
    expect(emitsQwenToolCalls("Qwen3Coder")).toBe(true);
    expect(emitsQwenToolCalls("qwen3:8b")).toBe(false);
    expect(emitsQwenToolCalls("claude-opus-5")).toBe(false);
  });
});
