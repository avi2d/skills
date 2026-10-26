import { describe, expect, test } from "bun:test";
import { isWebTool, parseSwitch, requested, withWebTools } from "../../harness/pi/extensions/web-tools";

const at = (path: string) => ({ name: "t", sourceInfo: { path } });

describe("isWebTool", () => {
  test("matches a tool the pi-web-access package registered", () => {
    expect(isWebTool(at("/Users/x/.pi/agent/npm/node_modules/pi-web-access/index.ts"))).toBe(true);
  });

  test("leaves a builtin and another package alone", () => {
    expect(isWebTool(at("<builtin:read>"))).toBe(false);
    expect(isWebTool(at("/Users/x/.pi/agent/npm/node_modules/@ff-labs/pi-fff/index.ts"))).toBe(false);
    expect(isWebTool(at("/Users/x/pi-web-access-notes/ext.ts"))).toBe(false);
  });
});

describe("requested", () => {
  test("only PI_WEB_TOOLS=1 asks for the tools", () => {
    expect(requested({ PI_WEB_TOOLS: "1" })).toBe(true);
    expect(requested({ PI_WEB_TOOLS: "0" })).toBe(false);
    expect(requested({ PI_WEB_TOOLS: "true" })).toBe(false);
    expect(requested({})).toBe(false);
  });
});

describe("withWebTools", () => {
  const web = ["web_search", "fetch_content"];

  test("off removes every web tool and keeps the rest in order", () => {
    expect(withWebTools(["read", "web_search", "bash", "fetch_content"], web, false)).toEqual(["read", "bash"]);
  });

  test("on adds each web tool once", () => {
    expect(withWebTools(["read", "web_search"], web, true)).toEqual(["read", "web_search", "fetch_content"]);
  });
});

describe("parseSwitch", () => {
  test("on and off are accepted, anything else including nothing is refused", () => {
    expect(parseSwitch("on")).toBe(true);
    expect(parseSwitch(" off ")).toBe(false);
    expect(parseSwitch("")).toBeUndefined();
    expect(parseSwitch("maybe")).toBeUndefined();
  });
});
