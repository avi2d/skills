---
name: stress-test-content
description: "Stress a rendered page or component with realistic worst-case content and adverse states: long and short names, unbreakable strings, real translations, empty, one and huge lists, missing media, loading, errors, offline, zoom and narrow widths, then fix what breaks and keep the fixtures. Use when a person asks to stress-test, break or harden a UI, or to try the worst case."
kind: skill
source: https://github.com/emilkowalski/skills@e8a175de22ae1e49370fc144c1f3bb9aeedf988d
consults:
  - typography
  - mobile-web
---
# Stress-test content

A layout that looks right with demo data was built against kind data.
Change the data, not the component: every worst case enters through the boundary the demo data enters by, such as props, the content collection, a fixture or an API stub.
A value is plausible or schema-backed, so the person cannot answer that it never happens.
The fixtures outlive the fix as the regression test for the next change.

## 1. Map the surface

List every value the target renders, with its source, its type, its limit and whether it is optional.
Include what people forget: counts in headings, relative times, badge and status text, labels that come from data, tooltips, images, and the length of each list.
Find each limit in the validation schema, the database column, the API type or the form's `maxLength`, and write "unbounded" where there is none.
List the languages the product ships, because the longest real translation is a worst case.

**Done when** every rendered value has a row with a source and a limit or "unbounded".

## 2. Build the fixtures

Pick values for each field from [catalog.md](catalog.md).
Shape each fixture exactly like the demo data and keep it beside it.
Spread different failures across the first rows of a list rather than stacking them in one, because the first rows are what shows.

Build these sets:

- **Worst case:** long and short names, unbreakable emails and URLs, long labels, counts at their limits, missing optional fields and missing images, mixed across rows.
- **Languages:** the real copy of every shipped language, never English stretched by a percentage, with the faces checked for every glyph that language needs.
- **Empty, one and huge:** zero items, exactly one item with every count at 1, and the realistic upper bound for a list.
- **Adverse states:** loading, an API error, a slow or offline network, a failed request followed by a retry, a missing permission, a double submission, and an input or a drag interrupted halfway, where the target has them.

Keep the set relevant to the product rather than every platform and every conceivable error.
Enter each set through a boundary the project already has, such as a story, a test that passes props, a content entry or an API stub, and never by patching the rendered DOM, so the next run reproduces it the same way.

**Done when** every catalog row that applies to a mapped field has a value in a fixture, and each adverse state the target can reach has a way to reproduce it.

## 3. Break it

Render every set and look for the failure signatures in [catalog.md](catalog.md):

- at the component's real container width, then at 320 px and at the widest layout it supports
- with text enlarged to 200 %, because text grows and boxes do not
- in every shipped language
- in dark mode and right to left where the product supports them
- on a phone for touch, where the `mobile-web` reference says which claims need hardware.

Screenshot each set at each width and look at every screenshot.
Read a broken glyph or a reflow through the `typography` reference.

**Done when** every applicable catalog row has been tried at every width and setting above, and each break has a signature, a cause and a fix.

## 4. Assert what a program can decide

Where the project runs browser tests, add assertions that render the fixtures at the declared widths and text sizes:

- required text is present and reachable
- each named action is visible, clickable and distinct from its neighbour
- no named control clips, overlaps or overflows its container
- the page has no horizontal overflow, except a scroll container the test declares as intended
- after a failed request, the retry and the contact route still work.

Each test records the route, language, viewport, state and target it checked, and fails when it scanned no page or no target.
See each new assertion fail against the unfixed component before it passes against the fixed one.
Readability, optical alignment and whether the words are clear stay with visual review.

## 5. Fix and decide

Fix an engineering defect at once, such as a flex child missing `min-width: 0`, a missing image fallback or a hardcoded plural.
Then render every set again, demo data included, because a fix for the worst case must not regress the demo.
A break with more than one right answer is a product decision: wrap or truncate a field, what a missing role shows, whether a long list paginates or virtualises.
Give the person each decision with a recommendation and the reason, and leave it open until they answer.

## 6. Report

Report in three parts:

1. **What broke**, worst first, rated Broken when content is unreadable, an action unreachable or data wrong, Ugly when it is readable but visibly wrong, and Fragile when it is one realistic step from breaking, each row with the field, the value, what happens, the fix and its `file:line`.
2. **Decisions** left for the person, one line each with a recommendation.
3. **What held up**, so the person sees the test was real and knows what not to touch.

Say what produced each finding: a rendered browser, an emulated viewport, synthesized touch, a physical device, or reasoning from the CSS alone.
Close with where the fixtures live, the sets they hold and the boundary each enters through.

## Sources

This Skill adapts and changes text from three pinned upstreams.

- Emil Kowalski's skills at `https://github.com/emilkowalski/skills@e8a175de22ae1e49370fc144c1f3bb9aeedf988d`, from `skills/break-ui`, under the MIT licence in `LICENSE`.
- Impeccable at `https://github.com/pbakaus/impeccable@e103efe779e2dd01274dabae83531fef00bf2563`, from `skill/reference/harden.md`, Copyright 2025 Paul Bakaus, under the Apache 2.0 licence in `LICENSE-impeccable`.
- UI principles at `https://github.com/CyberAP/ui-principles@531c436c07900a84d1ec7d793a419dec5cd3eba4`, from principle 18 of `SKILL.md`, under CC0 1.0 Universal in `LICENSE-ui-principles`.

The text here is rewritten, shortened and merged, and is not the upstream wording.
