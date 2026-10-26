---
name: typography
description: "Craft depth for interface type inside an established visual direction: the evidence-backed type assessment, role scale, measure and leading, font loading and fallback metrics, script coverage, and verifying text under stress. Pull when a specific type defect needs fixing, such as a heading that wraps badly in one language or text that reflows as fonts load."
kind: reference
source: https://github.com/pbakaus/impeccable@e103efe779e2dd01274dabae83531fef00bf2563
consults:
  - visitor-job
---
# Typography

Type carries information, hierarchy and voice.
Improve it inside the visual direction the surface already has, and keep its confirmed families.
A Russian headline that wraps badly is fixed through the loaded face, its fallback, the role scale and the real text, never by replacing the brand to make one heading fit.
A new family or a new identity is a redesign, and a person decides it.

## Assess before editing

Answer every question with a file, a selector or a computed value, and make this assessment before reading any scanner output, so a scanner's findings never anchor it.

- **Authority:** which faces, weights and roles are established, and is each family necessary?
- **Hierarchy:** can heading, body, label, metadata and data roles be told apart at a glance?
- **Scale:** is there a deliberate role scale, and does each repeated role stay identical across screens and states?
- **Reading:** does body copy keep a 45 to 75 character measure, with leading, contrast and tracking tuned to the actual face, width and language?
- **Stress:** what happens with long headings, a longer translation, 200 % zoom, a narrow container, a missing weight and the fallback face?
- **Delivery:** are only used files and weights loaded, and do the fallback metrics and loading strategy avoid invisible text and disruptive reflow?
- **Coverage:** does every face hold every glyph the product's languages need, such as Cyrillic for Russian copy, rather than falling back mid-word?

## Set the system

Before editing, write down the roles the interface needs, the contrast between them, the reading measure and density, the authoritative faces and weights, and the loading, language and accessibility constraints.
Use the fewest roles and families that make the hierarchy unmistakable, and let size, weight, space and tone share the work.
Name roles and tokens for their purpose, such as `--text-label`, rather than their value.
The `visitor-job` reference sets the latitude: Persuade and Experience may let display type carry the voice, and Operate and Read put a stable role scale and measure first.

## Apply

- Body text on the web starts at 16 px unless a dense role, a platform convention or the person's setting justifies otherwise.
- Wider lines take more leading, and leading is tuned to the face, width, language and contrast rather than one ratio.
- Light text on a dark ground takes slightly more leading, a touch more tracking and, when the face needs it, one step more weight.
- Numbers that change or align take `font-variant-numeric: tabular-nums`.
- Only used font files and weights load, each with a metric-compatible fallback through `size-adjust` or the ascent and descent overrides, and text renders during the load through `font-display`.
- A subset of a font keeps every script the product ships.
- Browser zoom, the person's font settings and platform text scaling keep working.
- Paragraph rhythm comes from spacing or a first-line indent, and not both.

## Verify

- Each role is recognisable without reading the copy.
- Long text stays comfortable at every supported width and in every shipped language.
- Loading shows no invisible text and no disruptive reflow, checked on a throttled network.
- Zoom, text scaling, focus, contrast and the narrow viewport stay usable.

Answer each item with rendered or source evidence.
A clean scan is a floor, not proof of good typography.

## Sources

This Reference adapts and changes text from `skill/reference/typeset.md` in Impeccable at `https://github.com/pbakaus/impeccable@e103efe779e2dd01274dabae83531fef00bf2563`, Copyright 2025 Paul Bakaus, under the Apache 2.0 licence in `LICENSE`.
The text here is rewritten and shortened, and is not the upstream wording.
