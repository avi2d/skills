---
name: readme-front-door
description: "Holds a README.md to how to run the project and where things are, and keeps it from restating what a test checks. Fires on a README.md wherever it sits, and never on an AGENTS.md or a CLAUDE.md, which agents-md-router covers."
kind: rule
source: local
trigger:
  predicate: file-matches
  glob: "**/README.md"
---

# README front door

A README.md says how to run the project and where things are.
It never restates what a test checks: it names the command that runs the tests and the folder that holds them.
It holds the concept in two to four sentences, Install, the few tasks nearly every reader does and Where things are.
Every other topic is its own page under docs/, linked from the README in one line.
State each fact once, in the page that owns it.
A list of tests, gates, flags or settings is generated or left out, never copied by hand.
When an edit would take the README past 6,000 characters, move the least read section to docs/ first.
Keep every table cell under 300 characters.
