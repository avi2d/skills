import { describe, expect, test } from "bun:test";
import { hub } from "../../src/generate/hub";
import { selected } from "../../src/bodies/selection";
import { dirOf, type Kind } from "../../src/bodies/bodies";
import { value } from "../lib/effect";
import { bodies, repo, selection } from "../lib/tree";

const EMIL = {
  origin: "https://github.com/emilkowalski/skills@e8a175de22ae1e49370fc144c1f3bb9aeedf988d",
  notice: ["MIT License", "Copyright (c) 2026 Emil Kowalski"],
};
const IMPECCABLE = {
  origin: "https://github.com/pbakaus/impeccable@e103efe779e2dd01274dabae83531fef00bf2563",
  notice: ["Apache License", "Version 2.0, January 2004", "Copyright 2025 Paul Bakaus"],
};
const UI_PRINCIPLES = {
  origin: "https://github.com/CyberAP/ui-principles@531c436c07900a84d1ec7d793a419dec5cd3eba4",
  notice: ["CC0 1.0 Universal"],
};

type Upstream = typeof EMIL;

const ADOPTED: Record<string, { kind: Kind; licences: { LICENSE: Upstream } & Record<string, Upstream> }> = {
  motion: { kind: "reference", licences: { LICENSE: EMIL, "LICENSE-impeccable": IMPECCABLE } },
  "motion-vocabulary": { kind: "reference", licences: { LICENSE: EMIL } },
  "mobile-web": { kind: "reference", licences: { LICENSE: EMIL } },
  "visitor-job": { kind: "reference", licences: { LICENSE: IMPECCABLE } },
  typography: { kind: "reference", licences: { LICENSE: IMPECCABLE } },
  "interface-copy": { kind: "reference", licences: { LICENSE: IMPECCABLE } },
  "ui-principles": { kind: "reference", licences: { LICENSE: UI_PRINCIPLES } },
  "stress-test-content": {
    kind: "skill",
    licences: { LICENSE: EMIL, "LICENSE-impeccable": IMPECCABLE, "LICENSE-ui-principles": UI_PRINCIPLES },
  },
  "build-and-review-motion": { kind: "skill", licences: { LICENSE: EMIL } },
  "refine-design": { kind: "skill", licences: { LICENSE: IMPECCABLE } },
};

const reached = selected(bodies, selection);
const entries = value(hub(reached));

describe("the adopted design guidance", () => {
  for (const [name, { kind, licences }] of Object.entries(ADOPTED)) {
    test(`${name} reaches every Profile and the Hub as a ${kind}, sourced from the upstream its LICENSE carries`, () => {
      const body = bodies.find((b) => b.name === name && b.kind === kind) ?? expect.unreachable(`${name} is absent`);
      expect<string>(body.source, "the frontmatter source is the upstream its LICENSE carries").toBe(licences.LICENSE.origin);

      expect(selection.profiles.length).toBeGreaterThan(0);
      for (const profile of selection.profiles) {
        expect(kind === "skill" ? profile.skills : profile.references, `${profile.name} cannot reach ${name}`).toContain(name);
      }
      expect(reached).toContain(body);
      expect(entries.get(name), `the Hub offers no ${name} entry`).toBe(dirOf(body));
    });

    test(`${name} ships each upstream's licence text in its Hub entry`, async () => {
      const entry = entries.get(name) ?? expect.unreachable(`the Hub offers no ${name} entry`);
      for (const [file, { notice }] of Object.entries(licences)) {
        const text = await Bun.file(`${repo}${entry}/${file}`).text();
        for (const line of notice) expect(text, `${name}/${file}`).toContain(line);
      }
    });
  }
});
