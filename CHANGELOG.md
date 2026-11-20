# Changelog

Every release of `skills`, newest first, written by the release from its conventional commits.

## 0.7.0

Released 2026-11-20.

### Features

- add say-what-is-left rule to default profile [#102](https://github.com/avi2d/skills/pull/102)
- **harness:** make local-test scripts and eval configs configurable [#99](https://github.com/avi2d/skills/pull/99)
- refuse local test commands in agent harnesses [#98](https://github.com/avi2d/skills/pull/98)
- **interface:** add generate-assets skill for images through Codex [#97](https://github.com/avi2d/skills/pull/97)
- **interface:** add pause control and fluid type limits to motion and typography [#96](https://github.com/avi2d/skills/pull/96)
- **pi:** keep OpenAI compaction to the latest sol, astra, terra and luna [#94](https://github.com/avi2d/skills/pull/94)
- **pi:** compact OpenAI sessions at 150k with Haiku [#93](https://github.com/avi2d/skills/pull/93)
- **dispatcher:** give guard-the-context-window-slow-output to four models, fix its judge [#79](https://github.com/avi2d/skills/pull/79)
- **pi:** hide old tool output before compaction summary [#77](https://github.com/avi2d/skills/pull/77)
- **orc:** add orchestrator rules for holds, merges, news and projects [#75](https://github.com/avi2d/skills/pull/75)
- **dispatcher:** add Spark context, rerun, and commit identity guards [#74](https://github.com/avi2d/skills/pull/74)
- **generate:** consolidate firstmate dispatch to a single rules file [#72](https://github.com/avi2d/skills/pull/72)
- **generate:** lead the hard-work dispatch rules with Fable 5.2 [#71](https://github.com/avi2d/skills/pull/71)
- **generate:** list Claude candidates first in implementation dispatch rules [#68](https://github.com/avi2d/skills/pull/68)
- **dispatcher:** queue every heavy shape at priority through pueue [#67](https://github.com/avi2d/skills/pull/67)
- **generate:** list each Claude model on main and second accounts [#64](https://github.com/avi2d/skills/pull/64)
- route doc facts to their owning file [#61](https://github.com/avi2d/skills/pull/61)
- **generate:** review with astra first and route astra and terra in four dispatch rules [#55](https://github.com/avi2d/skills/pull/55)
- **generate:** graft Claude hooks into the config dirs an optional user config names [#52](https://github.com/avi2d/skills/pull/52)
- **dispatcher:** add types forbid matcher using project oxlint [#45](https://github.com/avi2d/skills/pull/45)
- **engineering:** derive types and never assert outside data [#40](https://github.com/avi2d/skills/pull/40)
- **dispatcher:** scrub tool output with checks kit gitleaks rules [#39](https://github.com/avi2d/skills/pull/39)
- **dispatcher:** refuse reads of known credential files [#36](https://github.com/avi2d/skills/pull/36)
- **replay-haiku-compaction:** rebuild retention check on exact fact values [#35](https://github.com/avi2d/skills/pull/35)
- **firstmate:** adopt the shared crew dispatch rule set [#33](https://github.com/avi2d/skills/pull/33)
- **writing:** add readme-front-door rule and move install and troubleshooting to docs [#24](https://github.com/avi2d/skills/pull/24)
- **interface:** preview develop-a-website on Cloudflare Pages with Mobile Safari check [#22](https://github.com/avi2d/skills/pull/22)
- **orc:** add chat orchestrator rules and home link [#15](https://github.com/avi2d/skills/pull/15)
- **no-mistakes:** publish evidence screenshots to Cloudflare Pages [#14](https://github.com/avi2d/skills/pull/14)

### Fixes

- **generate:** drop hardcoded Claude account from reviewer chain [#101](https://github.com/avi2d/skills/pull/101)
- use the remaining Claude account for review [#100](https://github.com/avi2d/skills/pull/100)
- **pi:** cache transcript-style decorations across spinner frames [#87](https://github.com/avi2d/skills/pull/87)
- **dispatcher:** keep arithmetic shifts from hiding later commands [#84](https://github.com/avi2d/skills/pull/84)
- **dispatcher:** require exported GIT_DIR for commit identity exemption [#83](https://github.com/avi2d/skills/pull/83)
- **dispatcher:** narrow rerun and commit identity guards [#82](https://github.com/avi2d/skills/pull/82)
- **generate:** return Sol to the reviewer chain with no floor [#80](https://github.com/avi2d/skills/pull/80)
- **profiles:** switch finish-the-task off for Muse Spark [#78](https://github.com/avi2d/skills/pull/78)
- **generate:** drop Astra from the no-mistakes reviewer chain [#66](https://github.com/avi2d/skills/pull/66)
- **generate:** drop Astra from crew dispatch investigation and unknown cause rules [#65](https://github.com/avi2d/skills/pull/65)
- **generate:** carry the main Claude account on generated Claude profiles [#56](https://github.com/avi2d/skills/pull/56)
- **generate:** link account home from any main checkout, refuse only worktrees [#51](https://github.com/avi2d/skills/pull/51)
- **transcript-style:** wrap each reply Markdown render once [#49](https://github.com/avi2d/skills/pull/49)
- **generate:** graft checkout hooks into Claude account settings [#48](https://github.com/avi2d/skills/pull/48)
- **replay-haiku-compaction:** drop retention check and keep rescore fixes [#21](https://github.com/avi2d/skills/pull/21)
- **generate:** put main account first in reviewer chain [#19](https://github.com/avi2d/skills/pull/19)
- **generate:** remove free-model sections from generated config [#18](https://github.com/avi2d/skills/pull/18)

### Performance

- **transcript-style:** keep what a spinner frame did not change [#90](https://github.com/avi2d/skills/pull/90)

## 0.6.0

Released 2026-10-31.

### Features

- **interface:** add the develop-a-website skill [#12](https://github.com/avi2d/skills/pull/12)

### Fixes

- **generate:** switch off the MiniMax advisory extra review [#5](https://github.com/avi2d/skills/pull/5)
- **evals:** read past Rule text from in-tree fixture [#2](https://github.com/avi2d/skills/pull/2)
