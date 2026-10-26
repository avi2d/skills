import { describe, expect, test } from "bun:test";
import { decodeProject } from "../../src/dispatcher/project";

const PATH = "/work/package.json";

const decoded = (value: unknown) => decodeProject(PATH, JSON.stringify(value));

const refusal = (value: unknown): string => {
  const project = decoded(value);
  return "unreadable" in project ? project.unreadable : expect.unreachable(`${JSON.stringify(value)} was read as declarations`);
};

describe("decoding a package.json", () => {
  test("a dependency on effect declares it, in any dependency section, and switches nothing", () => {
    expect(decoded({ dependencies: { effect: "4.0.0-rc.115" } })).toEqual({ path: PATH, declares: ["effect"], on: [], off: [] });
    expect(decoded({ devDependencies: { effect: "4.0.0-rc.115" } })).toEqual({ path: PATH, declares: ["effect"], on: [], off: [] });
    expect(decoded({ peerDependencies: { effect: "4.0.0-rc.115" } })).toEqual({ path: PATH, declares: ["effect"], on: [], off: [] });
    expect(decoded({ optionalDependencies: { effect: "4.0.0-rc.115" } })).toEqual({ path: PATH, declares: ["effect"], on: [], off: [] });
  });

  test("an empty file declares nothing and switches nothing", () => {
    expect(decoded({})).toEqual({ path: PATH, declares: [], on: [], off: [] });
  });

  test("the switches are read as written, and an absent skills block switches nothing", () => {
    expect(decoded({ skills: { rules: { on: ["unslop"], off: ["fix-what-you-see"] } } })).toEqual({
      path: PATH,
      declares: [],
      on: ["unslop"],
      off: ["fix-what-you-see"],
    });
    expect(decoded({ skills: {} })).toEqual({ path: PATH, declares: [], on: [], off: [] });
    expect(decoded({ dependencies: { effect: "4.0.0-rc.115" }, skills: { rules: { on: ["effect-error-channel"], off: [] } } })).toMatchObject({
      declares: ["effect"],
      on: ["effect-error-channel"],
    });
  });

  test("keys the Dispatcher does not read are left to their own tools", () => {
    expect(decoded({ scripts: { test: "checks-test" }, somethingNewer: true })).toEqual({ path: PATH, declares: [], on: [], off: [] });
  });

  test("a file that is not JSON is unreadable, and says why", () => {
    const project = decodeProject(PATH, "{");
    expect("unreadable" in project && project.unreadable).toStartWith("is not JSON: ");
  });

  test("a declaration the Dispatcher reads, in a shape it cannot, makes the whole file unreadable", () => {
    expect(refusal([])).toBe("does not hold an object");
    expect(refusal({ dependencies: [] })).toBe("holds dependencies that is not an object");
    expect(refusal({ devDependencies: "effect" })).toBe("holds devDependencies that is not an object");
    expect(refusal({ skills: [] })).toBe("holds skills that is not an object");
    expect(refusal({ skills: { rules: [] } })).toBe("holds skills.rules that is not an object");
    expect(refusal({ skills: { rules: { on: "unslop" } } })).toBe("holds skills.rules.on that is not a list of Rule names");
    expect(refusal({ skills: { rules: { off: [3] } } })).toBe("holds skills.rules.off that is not a list of Rule names");
  });

  test("a Rule switched both on and off is unreadable rather than settled by an order nobody wrote", () => {
    expect(refusal({ skills: { rules: { on: ["unslop", "prove-it-works"], off: ["prove-it-works"] } } })).toBe(
      "switches prove-it-works both on and off",
    );
  });
});
