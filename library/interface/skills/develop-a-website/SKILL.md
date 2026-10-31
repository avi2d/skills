---
name: develop-a-website
description: "Build or change a website one block at a time on a live demo server, with a demo-only variants panel the published build leaves out, screenshots of every change at the shared screen sizes, the shared browser checks, a fresh judge, and the person's approval of each block. Use when a person asks to build, redesign or change the pages of a website."
kind: skill
source: local
consults:
  - visitor-job
  - build-and-review-motion
  - stress-test-content
---
# Develop a website

A page is built and approved one **block** at a time, where a block is a section the person can judge alone, such as the header, the first screen, a list of services or the footer.
Every block runs one loop: build it on the demo server, capture it, check it, have a fresh judge review it, then show it to the person.
The person approves what they saw on the running page, and the captures are the evidence beside it.
The judge decides only whether a block is ready to show, and the approval is the person's alone.

## 1. Open the demo server

1. Run the site's development or preview server on an address the person's own browser and phone can open, and give the person that address.
1. Write the brief: the page's job from the `visitor-job` reference, written as the one question a first-time visitor answers from the first screen, and the page's blocks in page order.
1. Name the commit the server runs in every review, so each review says what it saw.

**Done when** the person has opened the address, and the brief holds the job question and every block in scope.

## 2. Declare the shared screens and checks

The screen sizes and the browser checks come from `@avi2dg/checks` 0.59.0 or later.
Its `checks-browser` page, installed at `node_modules/@avi2dg/checks/docs/gates/checks-browser.md`, holds the size tables, the declaration's fields and the commands, so read its Screen sizes section and its starter declaration before declaring anything.
The sizes were checked on 2026-10-31 against StatCounter's screen resolution statistics, Apple's Human Interface Guidelines, Material Design's device metrics and the Chrome UX Report, and are due a recheck once a year, so take them from the installed page.

1. Install the kit and the optional peers its page names, at the versions it pins.
1. Copy the starter `browser-checks.json` the page names, and set its routes and targets to the blocks built so far: every page with its locale, each page's headline, and every action a visitor takes, marked `focusable`, and grow it as each block is built.
1. Keep the starter's `anchor` preset as the viewports, its `enlarged-text` state, which sets the default text to 32 px, and its reduced motion state.
1. Run `checks-browser` on every pull request, in a script that builds the published site first.
1. For the night run, keep a second declaration in a directory of its own, whose `site` points back at the build, such as `../dist`, and whose viewports are the `full` preset, and run `checks-browser <directory>` on it every night.
1. Add a viewport of the site's own beside a preset only for a size no preset holds, because a name or a size declared twice is refused.
1. Add the expanded anchor names and dimensions to the brief, so the brief holds the job question, the blocks and every expected size.

The checks decide the measurable floor: layout, keyboard reach and visible focus, motion with reduced motion on, axe's WCAG 2.2 AA rules, HTML nesting and failed requests.
Whether a block reads well, feels right and does the page's job stays with the judge and the person.

**Done when** `checks-browser` runs on the built site and its inventory names every declared route and target for the blocks built so far at every anchor size and state.

## 3. Build the block

1. Build one block at a time in page order, with the real copy and working links.
1. Approve each block on its own job, and judge the page job question only once the blocks that answer it exist in the first screen the visitor sees.
1. Grow the declaration to the new block before its check, so each check covers only the blocks built so far.
1. Reuse the site's own tokens, components and action names, so a new block speaks the vocabulary of the approved ones.
1. Build motion in a block through the `build-and-review-motion` skill, and run the `stress-test-content` skill on a block that renders content an editor or a visitor supplies.
1. Keep every approved block as it was approved.
   A change that reaches an approved block reopens its approval, and the block runs the loop again.

When a block has more than one direction worth seeing, offer them as **variants**:

1. Build each direction as a named variant of the block, and name what each one changes, such as layout, density or interaction.
1. Add a panel to the demo build that switches the block between its variants instantly, at native size in the same browser, with a replay where motion matters.
1. Load the panel and every variant only in the demo build, behind the build tool's development flag or an entry the published build never imports.
1. Mark the panel and every variant with an attribute the published build can be searched for, such as `data-demo-variant`.
1. Once the person picks, delete the other variants and the block's entry in the panel, after keeping the captures of every variant and the pick with the pull request.

**Done when** the block renders on the demo server at the commit under review, and a search of the published build's output for every demo marker finds nothing.

## 4. Capture every change

After every change, however small, capture each page it touches at every size in the anchor set, as the first screen and as the whole page, in every language the site ships.
Name each file for the page, the language, the size's name from the screen list, the extent and the short commit hash, such as `home-en-phone-375x667-first-screen-5599284.png`.
Look at every capture before going on.

**Done when** every touched page has a capture for each anchor size, extent and language at the current commit, and each one has been looked at.

## 5. Check and judge

1. Run `checks-browser` on the published build, and fix every failure it names.
1. Start a fresh agent that shares none of this session's context, and give it [judge.md](judge.md), the captures, the brief with its job question and the expanded anchor names and dimensions, the scope of the change, the commit and the demo server's address.
1. Act on the verdict: recapture, rebuild and fix send the block back through the loop to a new fresh judge, and only ship sends it to the person.

The judge runs as soon as a change is ready, so a review never waits for the night run.

**Done when** `checks-browser` exits 0 and the latest verdict, given at the current commit, is ship.

## 6. Get the block approved

1. Show the person the block on the demo server, with its captures, the judge's verdict and what remains open.
1. Ask about this block alone: approve it, or name what to change.
1. Record each approval with the block, the commit and the person's own words, in the pull request or the project's record of decisions.
1. Start the next block once this one is approved, and treat silence or an answer about something else as not approved yet.

**Done when** every block in scope has an approval that names its commit.

## 7. Hand over

1. Build the published site, search its output for every demo marker, and confirm the search finds nothing.
1. Run `checks-browser` on that build and confirm it exits 0.
1. Hand over the pull request with the approvals, the captures at its last commit, the judge's last verdict and the checks' output.
