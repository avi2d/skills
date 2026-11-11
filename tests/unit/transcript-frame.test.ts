import { describe, expect, test } from "bun:test";
import { keepLines, oncePerFrame, sameRows } from "../../harness/pi/extensions/transcript-style/frame";
import { nextFrame } from "../lib/spinner-frame";

describe("sameRows", () => {
  test("takes a changed, a dropped or an added row for the rows it kept", () => {
    expect([sameRows(["a", "b"], ["a", "c"]), sameRows(["a", "b"], ["a"]), sameRows(["a"], ["a", "b"])]).toEqual([false, false, false]);
  });

  test("takes the rows it kept for new ones when pi hands them back in a new array", () => {
    expect([sameRows(["a", "b"], ["a", "b"]), sameRows([], [])]).toEqual([true, true]);
  });
});

describe("keepLines", () => {
  function counted() {
    const builds = { count: 0 };
    const lines = keepLines((rows, mark: string) => {
      builds.count += 1;
      return rows.map((row) => mark + row);
    });
    return { builds, lines };
  }

  test("builds again from rows and a key that did not change", () => {
    const { builds, lines } = counted();
    const first = lines(["a", "b"], ">");
    expect(lines(["a", "b"], ">")).toBe(first);
    expect(builds.count).toBe(1);
  });

  test("serves the kept lines after the key changed", () => {
    const { lines } = counted();
    lines(["a"], ">");
    expect(lines(["a"], "#")).toEqual(["#a"]);
  });

  test("serves the kept lines after pi changed, in place, the array it returned last time", () => {
    const { lines } = counted();
    const rows = ["a", "b"];
    lines(rows, ">");
    rows[1] = "c";
    expect(lines(rows, ">")).toEqual([">a", ">c"]);
  });

  test("compares keys by identity when it is given a comparison of its own", () => {
    const builds = { count: 0 };
    const lines = keepLines(
      (rows, key: { readonly width: number }) => {
        builds.count += 1;
        return rows.map((row) => row.padEnd(key.width));
      },
      (kept, key) => kept.width === key.width,
    );
    lines(["a"], { width: 3 });
    lines(["a"], { width: 3 });
    expect(builds.count).toBe(1);
    expect(lines(["a"], { width: 4 })).toEqual(["a   "]);
  });
});

describe("oncePerFrame", () => {
  function counted() {
    const reads = { count: 0 };
    const value = oncePerFrame(() => {
      reads.count += 1;
      return reads.count;
    });
    return { reads, value };
  }

  test("reads again for every component a frame draws", () => {
    const { reads, value } = counted();
    expect([value({}), value({}), value({})]).toEqual([1, 1, 1]);
    expect(reads.count).toBe(1);
  });

  test("holds one frame's value into the next frame", async () => {
    const { value } = counted();
    const component = {};
    const other = {};
    value(component);
    await nextFrame();
    expect([value(other), value(component)]).toEqual([2, 2]);
  });

  test("holds the first value for a component drawn twice with no frame between", () => {
    const { value } = counted();
    const component = {};
    expect([value(component), value({}), value(component), value({})]).toEqual([1, 1, 2, 2]);
  });
});
