import { AGENTS_MD_ROUTER } from "./utility/agents-md-router";
import { COMMENT_DISCIPLINE } from "./engineering/comment-discipline";
import { EFFECT_ERROR_CHANNEL } from "./engineering/effect-error-channel";
import type { EvalCase } from "./fixture";
import { FIX_WHAT_YOU_SEE } from "./engineering/fix-what-you-see";
import { FORCE_DETERMINISM } from "./engineering/force-determinism";
import { GIT_HYGIENE } from "./utility/git-hygiene";
import { GIT_HYGIENE_CO_AUTHOR } from "./utility/git-hygiene-co-author";
import { GUARD_THE_CONTEXT_WINDOW } from "./utility/guard-the-context-window";
import { PROVE_IT_WORKS } from "./engineering/prove-it-works";
import { PROVE_IT_WORKS_TEST_FIRST } from "./engineering/prove-it-works-test-first";
import { RIGHT_SIZE_THE_WORK } from "./utility/right-size-the-work";
import { TYPESCRIPT_BEST_PRACTICES } from "./engineering/typescript-best-practices";
import { PLAIN_SENTENCES } from "./writing/plain-sentences";
import { PLAIN_WORDS } from "./writing/plain-words";
import { PUNCTUATION } from "./writing/punctuation";
import { RUSSIAN_PROSE } from "./writing/russian-prose";
import { TECHNICAL_WRITING } from "./writing/technical-writing";
import { UNSLOP } from "./writing/unslop";
import { WRITING_FOR_AGENTS } from "./writing/writing-for-agents";
import { WRITING_FOR_PEOPLE } from "./writing/writing-for-people";

export const CASES: readonly EvalCase[] = [
  ...AGENTS_MD_ROUTER,
  ...COMMENT_DISCIPLINE,
  ...PROVE_IT_WORKS,
  ...PROVE_IT_WORKS_TEST_FIRST,
  ...GUARD_THE_CONTEXT_WINDOW,
  ...EFFECT_ERROR_CHANNEL,
  ...FIX_WHAT_YOU_SEE,
  ...FORCE_DETERMINISM,
  ...GIT_HYGIENE,
  ...GIT_HYGIENE_CO_AUTHOR,
  ...RIGHT_SIZE_THE_WORK,
  ...TYPESCRIPT_BEST_PRACTICES,
  ...WRITING_FOR_PEOPLE,
  ...UNSLOP,
  ...WRITING_FOR_AGENTS,
  ...PLAIN_SENTENCES,
  ...PLAIN_WORDS,
  ...PUNCTUATION,
  ...RUSSIAN_PROSE,
  ...TECHNICAL_WRITING,
];
