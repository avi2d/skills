---
name: unslop
description: "The AI tells in what prose says and how it sounds, and what each becomes: vague feeling instead of the mechanism, puffery and promotion, unsourced claims, forced shapes such as the rule of three, and chatbot framing, with a self-audit. Pull before writing or editing prose a person reads, such as a doc, a commit message or a PR description."
kind: reference
source: https://github.com/cursor/plugins@fd6dd6f7276956a532bb78a748a8d2818b6eb5f4
---
# Unslop

Each heading is one principle about what prose says and how it sounds.

## Audit the draft for what still reads machine-made

Scan the draft for the tells below, and rewrite each while keeping the meaning and the intended tone.
Then ask "What makes this obviously AI generated?" and fix what remains.
Removing tells is half the job, because sterile, voiceless writing is just as obvious.

## Be specific

Name the mechanism or a number, not a feeling.
"SQL you can read" becomes "`.toSQL()` returns the exact string sent to the database", and "types that follow your schema" becomes "a column rename fails the build".
Ask what the sentence tells the reader to do or know, then write that, and cut it when it states no instruction, fact or number.
A sentence that could appear unchanged in another project's docs says nothing about this one.
Where something is genuinely mixed, say so: "impressive but also kind of unsettling" beats "impressive".

## Report what happened, without praise

State what happened, in neutral words.

- Puffery such as "pivotal moment", "testament to", "evolving landscape", "setting the stage for" and "indelible mark" becomes the event itself.
- Promotional words such as "nestled", "vibrant", "breathtaking", "groundbreaking", "renowned" and "must-visit" become a plain description.
- "Despite challenges, it continues to thrive" becomes the specific facts.
- A generic conclusion such as "The future looks bright" becomes a specific plan or fact, or goes.

## Name the source, or cut the claim

"Experts believe" and "Some critics argue" name who said it, or go.
A list of outlets becomes one source and what it said.
A cutoff disclaimer such as "While specific details are limited" becomes a found source, or goes.

## Give the point its natural shape

Use the natural number of items rather than forcing three.
"Not just X, but Y" becomes a direct statement of Y.
"From X to Y" is kept only when X and Y sit on a real scale, and otherwise the topics are listed.
A comparison set up only to frame the point goes, so the point stands on its own.

## Answer without chatbot framing or flattery

"I hope this helps!", "Let me know if...", "Certainly!", "Great question!" and "You're absolutely right!" go, and the answer starts with the answer.
