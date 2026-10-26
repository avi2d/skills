import { expect, test } from "bun:test";
import { wouldDangle } from "../lib/dangling";

test("a target no clone can come by is reported, and so is one the tree does not hold", () => {
  const links = { ".probe": "probe", ".gone": "gone", ".fine": "fine" };
  const dangling = wouldDangle(links, new Set(["gone", "fine"]), new Set(["probe", "fine"]));
  expect(dangling).toEqual([
    { link: ".probe", target: "probe", why: "absent-from-clone" },
    { link: ".gone", target: "gone", why: "missing" },
  ]);
});

test("a target outside the repository is reported rather than read as absent", () => {
  const links = { up: "../elsewhere", root: "/etc/hosts", parent: ".." };
  const dangling = wouldDangle(links, new Set(), new Set(["../elsewhere", "/etc/hosts", ".."]));
  expect(dangling).toEqual([
    { link: "up", target: "../elsewhere", why: "outside" },
    { link: "root", target: "/etc/hosts", why: "outside" },
    { link: "parent", target: "..", why: "outside" },
  ]);
});
