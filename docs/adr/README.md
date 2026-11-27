# Decision records

`bun run docs` writes this index from the records beside it, and `bun run test` fails when the two disagree.

**Status** is the first word of a record's Status section.

<!-- generated adr-index: checks-adr-index writes it from the records in docs/adr/ -->

| Number | Title | Status | Governs |
| --- | --- | --- | --- |
| [0001](0001-a-sub-agent-holds-the-rules-its-own-context-earns.md) | A sub-agent holds the Rules its own context earns | Accepted | `src/dispatcher/scope-condition.ts` |
| [0002](0002-a-rule-reaches-the-model-in-the-conversation.md) | A Rule reaches the model in the conversation | Accepted | `src/dispatcher/pi-dispatcher.ts` |
| [0003](0003-a-fan-out-refuses-a-provider-that-cannot-run-one.md) | A fan-out refuses a provider that cannot run one | Superseded |  |
| [0004](0004-the-repo-installs-itself-and-the-contract-stays-hand-written.md) | The repo installs itself, and the Contract stays hand-written | Accepted | `src/generate/link.ts` |
| [0005](0005-a-step-hands-a-fact-to-the-branches-that-cannot-see-it.md) | A step hands a Fact to the branches that cannot see it | Superseded |  |
| [0006](0006-a-fan-out-asks-nothing-of-its-provider.md) | A fan-out asks nothing of its provider | Superseded |  |
| [0007](0007-the-herdr-port-lands-on-the-fork-and-the-refactors-are-offered-upstream.md) | The herdr port lands on the fork, and the refactors are offered upstream | Accepted | `harness/pi/settings.json` |
| [0008](0008-the-set-directory-takes-the-name-the-root-symlink-held.md) | The set directory takes the name the root symlink held | Accepted | `src/generate/link.ts` |
| [0009](0009-a-claim-about-what-a-clone-gets-is-checked-on-one.md) | A claim about what a clone gets is checked on one | Accepted | `.github/workflows/ci.yml` |
| [0010](0010-a-branch-session-is-attributed-to-the-run-that-spawned-it.md) | A branch session is attributed to the run that spawned it | Retired |  |
| [0011](0011-a-context-the-harness-does-not-name-does-not-drive-a-run.md) | A Context the harness does not name does not drive a run | Superseded |  |
| [0012](0012-a-rules-trigger-is-a-list-and-any-match-fires-it.md) | A Rule's trigger is a list, and any match fires it | Accepted | `src/dispatcher/dispatch-types.ts`, `src/dispatcher/dispatch.ts` |
| [0013](0013-the-bundle-guard-lives-in-bundle-and-reads-runtime-imports.md) | The bundle guard lives in bundle() and reads runtime imports | Accepted | `src/generate/bundle.ts` |
| [0014](0014-a-fan-out-runs-as-the-script-generation-wrote.md) | A fan-out runs as the script generation wrote | Superseded |  |
| [0015](0015-extends-composes-one-body-at-generation.md) | `extends` composes one Body at generation | Superseded |  |
| [0016](0016-a-workflow-a-harness-cannot-enforce-is-absent.md) | A Workflow a harness cannot enforce is absent, not weakened | Superseded |  |
| [0017](0017-a-fan-out-declares-its-branches.md) | A fan-out declares its branches | Superseded |  |
| [0018](0018-the-subagent-steer-is-pinned-rather-than-left-to-a-remote-gate.md) | The subagent steer is pinned, rather than left to a remote gate | Accepted | `harness/claude-code/settings.json` |
| [0019](0019-a-rule-that-falls-due-mid-turn-arrives-as-a-refusal.md) | A Rule that falls due mid-turn arrives as a refusal | Accepted | `src/dispatcher/claude-dispatcher.ts` |
| [0020](0020-a-path-home-took-from-here-is-retired-rather-than-forgotten.md) | A path $HOME took from here is retired, rather than forgotten | Accepted | `src/generate/link.ts`, `tests/unit/link.test.ts` |
| [0021](0021-the-emitted-tree-reaches-a-clone-through-the-generator.md) | The emitted tree reaches a clone through the generator | Accepted | `src/generate/generate.ts` |
| [0022](0022-codex-hooks-like-claude-codes-and-a-hub-that-is-pis.md) | Codex's hooks are Claude Code's, and its Hub is pi's | Accepted | `src/dispatcher/codex-dispatcher.ts`, `harness/codex/hooks.json` |
| [0023](0023-a-comment-survives-on-two-rows-and-nothing-in-the-code-points-at-a-record.md) | A comment survives on two rows, and nothing in the code points at a record | Accepted | `library/engineering/rules/comment-discipline/SKILL.md` |
| [0024](0024-a-constraint-a-program-can-decide-is-written-as-a-program.md) | A constraint a program can decide is written as a program | Accepted | `library/engineering/rules/force-determinism/SKILL.md` |
| [0025](0025-the-comment-rule-keeps-only-what-needs-judgment-and-one-source-holds-it.md) | The comment rule keeps only what needs judgment, and one source holds it | Accepted | `src/dispatcher/comments.ts` |
| [0026](0026-the-global-instruction-file-empties-into-three-rules.md) | The global instruction file empties into three Rules | Accepted | `library/utility/rules/git-hygiene/SKILL.md`, `library/utility/rules/git-hygiene-stash/SKILL.md`, `library/utility/rules/git-hygiene-co-author/SKILL.md` |
| [0027](0027-the-library-is-fetched-at-a-pin-and-the-pin-is-what-is-committed.md) | The library is fetched at a pin, and the pin is what is committed | Superseded |  |
| [0028](0028-a-bundled-module-declares-the-packages-its-harness-supplies.md) | A bundled module declares the packages its harness supplies | Accepted | `src/generate/bundle.ts` |
| [0029](0029-a-hub-is-links-into-the-tree-and-is-reconciled-rather-than-rewritten.md) | A Hub is links into the tree, and is reconciled rather than rewritten | Accepted | `src/generate/hub.ts` |
| [0030](0030-inheritance-goes-and-a-skill-is-the-words-it-holds.md) | Inheritance goes, and a Skill is the words it holds | Accepted | `src/bodies/bodies.ts` |
| [0031](0031-a-leaked-tool-call-is-repaired-in-the-harness-rather-than-waited-on-upstream.md) | A leaked tool call is repaired in the harness rather than waited on upstream | Superseded | `harness/pi/extensions/qwen-tool-calls.ts` |
| [0032](0032-the-web-tools-are-off-until-a-session-asks-for-them.md) | The web tools are off until a session asks for them | Superseded | `harness/pi/extensions/web-tools.ts`, `harness/pi/web-search.json` |
| [0033](0033-a-clause-a-program-can-decide-leaves-the-rule-body-and-becomes-a-lint-rule.md) | A clause a program can decide leaves the Rule body and becomes a lint rule | Accepted | `oxlint.config.ts` |
| [0034](0034-pi-cache-warming-is-off-until-a-model-declares-a-prompt-cache.md) | pi cache warming is off until a model declares a prompt cache | Accepted | `harness/pi/settings.json` |
| [0035](0035-the-suite-builds-what-a-clone-does-not-carry-and-fetches-the-checks-at-a-pin.md) | The suite builds what a clone does not carry, and the checks arrive at a pin | Accepted | `bunfig.toml`, `tests/lib/emitted.ts` |
| [0036](0036-a-session-is-named-by-its-first-prompt-once.md) | A session is named by its first prompt, once | Accepted | `harness/pi/extensions/session-name.ts` |
| [0037](0037-the-suite-workflow-is-where-a-clone-only-claim-gets-checked.md) | The suite workflow is where a clone-only claim gets checked | Accepted | `.github/workflows/ci.yml` |
| [0038](0038-what-a-session-opens-with-is-a-number-a-check-holds.md) | What a session opens with is a number a check holds | Accepted | `tests/lib/budget.ts`, `tests/unit/budget.test.ts` |
| [0039](0039-the-hub-holds-what-a-harness-reaches-by-name-and-there-is-one-of-it.md) | The Hub holds what a harness reaches by name, and there is one of it | Accepted | `src/generate/hub.ts`, `selection.toml` |
| [0040](0040-one-command-writes-one-directory.md) | One command writes one directory | Accepted | `src/generate/generate.ts`, `src/generate/hub.ts` |
| [0041](0041-the-tree-holds-what-something-invokes.md) | The tree holds what something invokes | Accepted | `selection.toml` |
| [0042](0042-a-compaction-point-is-per-model-and-fires-when-the-agent-is-idle.md) | A compaction point is per model, and fires when the agent is idle | Superseded |  |
| [0043](0043-a-compaction-point-is-a-per-model-reserve-in-pi-settings.md) | A compaction point is a per-model reserve in pi's settings | Accepted | `harness/pi/settings.json` |
| [0044](0044-the-checks-are-consumed-from-npm-by-range.md) | The checks are consumed from npm, by range | Accepted | `package.json` |
| [0045](0045-a-rate-limited-request-is-retried-inside-the-request.md) | A rate-limited request is retried inside the request | Accepted | `harness/pi/settings.json` |
| [0046](0046-a-tool-that-ships-its-own-skill-supplies-it.md) | A tool that ships its own skill supplies it | Accepted | `src/generate/hub.ts` |
| [0047](0047-each-test-process-generates-into-a-root-of-its-own.md) | Each test process generates into a root of its own | Accepted | `tests/lib/generated-root.ts`, `src/generate/bundle.ts` |
| [0048](0048-a-session-that-changed-the-tree-settles-past-the-checks-its-push-gate-runs.md) | A session that changed the tree settles past the checks its push gate runs | Accepted | `src/dispatcher/gate.ts`, `src/dispatcher/gate-config.ts` |
| [0049](0049-a-pin-resolves-when-the-dependencies-install.md) | A pin resolves when the dependencies install | Accepted | `package.json` |
| [0050](0050-the-assertion-rules-hold-a-generated-baseline.md) | The assertion rules hold a generated baseline | Accepted | `oxlint.config.ts`, `tests/e2e/assertion-baseline.test.ts` |
| [0051](0051-a-banned-comment-is-refused-at-every-write-by-the-kits-own-matchers.md) | A banned comment is refused at every write, by the kit's own matchers | Accepted | `src/dispatcher/forbid.ts`, `library/engineering/rules/comment-discipline/SKILL.md` |
| [0052](0052-the-dispatch-log-is-read-by-a-command-a-session-at-a-time.md) | The dispatch log is read by a command, a session at a time | Accepted | `src/report/dispatch-report.ts`, `src/dispatcher/dispatch-log.ts` |
| [0053](0053-a-hook-harness-reads-a-rules-arrival-back-from-its-transcript.md) | A hook harness reads a Rule's arrival back from its transcript | Accepted | `src/dispatcher/hook-harness.ts`, `src/dispatcher/transcript.ts` |
| [0054](0054-claude-code-carries-a-prompts-rules-in-parts-one-per-prompt-hook.md) | Claude Code carries a prompt's Rules in parts, one per prompt hook | Accepted | `src/dispatcher/claude-dispatcher.ts`, `harness/claude-code/settings.json` |
| [0055](0055-src-outside-the-bundles-is-held-to-effect-by-its-checks.md) | src/ outside the bundles is held to Effect by its checks | Accepted | `oxlint.config.ts`, `tests/e2e/effect-scope.test.ts` |
| [0056](0056-the-assertion-rules-are-a-ban-in-src-and-harness.md) | The assertion rules are a ban in src/ and harness/ | Accepted | `oxlint.config.ts`, `tests/e2e/assertion-baseline.test.ts` |
| [0057](0057-a-rule-is-measured-by-ablation-on-vitest-evals-with-a-program-as-judge.md) | A Rule is measured by ablation, on vitest-evals, with a program as judge | Accepted | `evals/vitest.config.ts`, `src/eval/ablation.ts` |
| [0058](0058-the-assertion-rules-are-a-ban-in-every-file.md) | The assertion rules are a ban in every file | Accepted | `oxlint.config.ts`, `tests/e2e/assertion-baseline.test.ts` |
| [0059](0059-the-lint-runs-the-kits-gates-through-one-entry-point.md) | The lint runs the kit's gates through one entry point | Accepted | `package.json` |
| [0060](0060-a-rule-fires-on-what-a-repository-declares-and-a-project-switches-a-catalogued-rule.md) | A Rule fires on what a repository declares, and a project switches a catalogued Rule | Accepted | `src/dispatcher/project.ts`, `src/dispatcher/dispatch.ts`, `selection.toml` |
| [0061](0061-guidance-for-people-docs-is-a-reference-a-rule-on-their-paths-names.md) | Guidance for people docs is a Reference that a Rule on their paths names | Accepted | `library/writing/references/technical-writing/SKILL.md` |
| [0062](0062-a-separator-in-a-doc-is-refused-at-every-write-by-the-kits-prose-matchers.md) | A separator in a doc is refused at every write, by the kit's prose matchers | Accepted | `src/dispatcher/prose.ts`, `library/writing/rules/writing-for-people/SKILL.md` |
| [0063](0063-a-sweep-commits-its-record-and-a-bare-sweep-measures-the-rule-least-recently-swept.md) | A sweep commits its record, and a bare sweep measures the Rule least recently swept | Accepted | `evals/sweeps/README.md`, `src/eval/eval-sweeps.ts` |
| [0064](0064-the-empty-global-instruction-file-and-its-four-links-are-retired.md) | The empty global instruction file and its four links are retired | Accepted | `src/generate/link.ts` |
| [0065](0065-guidance-for-agent-docs-is-a-reference-a-rule-on-their-paths-names-and-voice-is-a-reference-too.md) | Guidance for agent docs is a Reference that a Rule on their paths names, and voice is a Reference too | Accepted | `library/writing/references/unslop/SKILL.md`, `library/writing/references/writing-for-agents/SKILL.md`, `selection.toml` |
| [0066](0066-the-workflow-kind-goes-and-its-machinery-with-it.md) | The Workflow Kind goes, and its machinery with it | Accepted | `src/bodies/bodies.ts`, `selection.toml` |
| [0067](0067-the-suppressions-baseline-is-removed.md) | The suppressions baseline is removed | Accepted | `oxlint.config.ts`, `tests/e2e/assertion-baseline.test.ts` |
| [0068](0068-a-reproduction-is-a-command-whose-output-shows-the-defect.md) | A reproduction is a command whose output shows the defect | Accepted | `src/eval/eval-judges.ts` |
| [0069](0069-the-kits-consumer-suite-proves-each-effect-scope-rule-fails.md) | The kit's consumer suite proves each Effect scope rule fails | Accepted | `tests/e2e/effect-scope.test.ts`, `oxlint.config.ts` |
| [0070](0070-vendoring-a-library-moves-to-the-kits-checks-vendor.md) | Vendoring a library moves to the kit's checks-vendor | Accepted | `.github/workflows/ci.yml` |
| [0071](0071-four-rules-the-evals-found-no-gain-in-are-switched-off-and-a-rule-left-off-keeps-its-refusal.md) | Four Rules the evals found no gain in are switched off, and a Rule left off keeps its refusal | Accepted | `selection.toml` |
| [0072](0072-a-profile-scopes-named-rules-by-model-without-changing-tools.md) | A Profile scopes named Rules by model without changing tools | Accepted | `selection.toml`, `src/bodies/selection.ts` |
| [0073](0073-a-profile-is-a-complete-model-selection.md) | A Profile is a complete model selection | Accepted | `selection.toml`, `src/bodies/selection.ts` |
| [0074](0074-a-project-declares-itself-in-its-package-json-and-quality-json-is-gone.md) | A project declares itself in its package.json, and quality.json is gone | Accepted | `src/dispatcher/project.ts` |
| [0075](0075-the-generated-root-is-read-through-config-where-the-program-touches-the-tree.md) | The generated root is read through Config where the program touches the tree | Accepted | `src/generate/bundle.ts`, `tests/lib/generated-root.ts` |
| [0076](0076-the-verdict-gate-hands-each-check-the-files-the-settle-changed.md) | The verdict gate hands each check the files the settle changed | Accepted | `src/dispatcher/gate.ts` |
| [0077](0077-the-verdict-gate-diffs-against-the-settle-baseline-commit.md) | The verdict gate diffs against the settle baseline commit | Accepted | `src/dispatcher/gate.ts` |
| [0078](0078-an-agent-file-is-a-router-and-one-rule-says-so-in-every-project.md) | An agent file is a router, and one Rule says so in every project | Accepted | `library/utility/rules/agents-md-router/SKILL.md`, `selection.toml` |
| [0079](0079-pi-settings-are-a-file-of-the-machines-own-written-from-the-checkout.md) | Pi's settings are a file of the machine's own, written from the checkout | Accepted | `src/generate/link.ts`, `harness/pi/settings.json` |
| [0080](0080-effect-codemode-is-piloted-on-pis-own-sandbox-behind-one-settings-entry.md) | Effect codemode is piloted on pi's own sandbox, behind one settings entry | Retired |  |
| [0081](0081-a-firstmate-session-is-named-by-its-role-rather-than-its-first-prompt.md) | A Firstmate session is named by its role rather than its first prompt | Accepted | `harness/pi/extensions/session-name.ts` |
| [0082](0082-a-link-waits-until-pi-loads-every-extension-in-a-temporary-home.md) | A link waits until pi loads every extension in a temporary home | Accepted | `src/generate/link.ts` |
| [0083](0083-review-account-order-moved.md) | Review account order moved | Retired |  |
| [0084](0084-the-effect-codemode-pilot-is-removed-and-built-in-codemode-stays.md) | The effect codemode pilot is removed, and built-in codemode stays | Accepted | `harness/pi/settings.json` |
| [0085](0085-skills-and-references-are-declared-once-in-the-default-profile.md) | Skills and References are declared once, in the default Profile | Accepted | `selection.toml`, `src/bodies/selection.ts` |
| [0086](0086-a-heavy-command-is-queued-by-the-dispatcher-and-the-local-job-queue-rule-goes.md) | A heavy command is queued by the Dispatcher, and the local-job-queue Rule goes | Accepted | `src/dispatcher/job-queue.ts` |
| [0087](0087-writing-guidance-is-seven-references-and-each-principle-is-stated-once.md) | Writing guidance is seven References, and each principle is stated once | Accepted | `library/writing/references/technical-writing/SKILL.md`, `library/writing/references/plain-sentences/SKILL.md`, `library/writing/references/plain-words/SKILL.md`, `library/writing/references/punctuation/SKILL.md`, `library/writing/references/russian-prose/SKILL.md`, `library/writing/references/unslop/SKILL.md`, `library/writing/references/writing-for-agents/SKILL.md` |
| [0088](0088-a-profile-declares-only-what-differs-from-the-default.md) | A Profile declares only what differs from the default | Accepted | `src/bodies/selection.ts`, `selection.toml` |
| [0089](0089-mutation-concurrency-is-the-kits-half-of-the-cores.md) | Mutation concurrency is the kit's half of the cores | Accepted | `stryker.conf.mjs` |
| [0090](0090-pi-sessions-see-codemode-alone-and-a-supervising-session-opts-back.md) | Pi sessions see codemode alone, and a supervising session opts back | Accepted | `harness/pi/settings.json` |
| [0091](0091-a-fix-starts-from-a-reproduction-kept-as-a-test-only-when-its-expected-result-comes-from-outside-the-code.md) | A fix starts from a reproduction, kept as a test only when its expected result comes from outside the code | Accepted | `library/engineering/rules/prove-it-works/SKILL.md` |
| [0092](0092-the-lint-configs-are-the-kits-builders-and-effect-holds-every-source-file-outside-the-tests.md) | The lint configs are the kit's builders, and Effect holds every source file outside the tests | Accepted | `oxlint.config.ts`, `knip.config.ts`, `dependency-cruiser.config.ts` |
| [0093](0093-an-outcome-case-is-graded-by-a-hidden-verifier-and-a-rules-past-text-is-measured-under-its-own-name.md) | An outcome case is graded by a hidden verifier, and a Rule's past text is measured under its own name | Accepted | `src/eval/eval-sandbox.ts`, `evals/cases/fixture.ts` |
| [0094](0094-an-eval-run-queues-at-a-concurrency-of-3-and-model-inference-that-exits-on-its-own-queues-in-gpu.md) | An eval run queues at a concurrency of 3, and model inference that exits on its own queues in gpu | Accepted | `src/dispatcher/job-queue.ts` |
| [0095](0095-the-codex-reviewer-runs-to-empty-and-the-pro-reviewer-keeps-its-floor.md) | The Codex reviewer runs to empty, and the Pro reviewer keeps its floor | Superseded |  |
| [0096](0096-the-title-lint-is-a-step-of-the-ci-job-and-a-docs-only-change-skips-the-suite.md) | The title lint is a step of the ci job, and a docs-only change skips the suite | Accepted | `.github/workflows/ci.yml` |
| [0097](0097-writing-for-people-is-one-rule-in-force-from-the-prompt-for-every-text-a-person-reads.md) | Writing for people is one Rule in force from the prompt, for every text a person reads | Accepted | `library/writing/rules/writing-for-people/SKILL.md` |
| [0098](0098-writing-for-people-is-measured-on-four-harder-cases-and-stays-off-pending-the-captains-call-for-each-model.md) | Writing for people is measured on four harder cases, and stays off pending the captain's call for each model | Accepted | `tests/fixtures/writing`, `library/writing/rules/writing-for-people/SKILL.md` |
| [0099](0099-writing-for-people-is-switched-on-for-muse-spark-alone.md) | Writing for people is switched on for Muse Spark alone | Accepted | `selection.toml` |
| [0100](0100-codex-reviewer-ruling-moved.md) | Codex reviewer ruling moved | Retired |  |
| [0101](0101-claude-reviewer-ruling-moved.md) | Claude reviewer ruling moved | Retired |  |
| [0102](0102-the-main-account-reviews-first-codex-second-and-the-second-account-last-with-no-floor.md) | The main account reviews first, Codex second, and the second account last with no floor | Superseded | `src/generate/no-mistakes-config.ts`, `tests/unit/machine-files.test.ts` |
| [0103](0103-a-read-of-a-known-credential-file-is-refused-by-the-dispatcher.md) | A read of a known credential file is refused by the Dispatcher | Accepted | `src/dispatcher/credential-reads.ts` |
| [0104](0104-tool-output-is-scrubbed-at-the-harness-with-the-checks-kits-gitleaks-rules.md) | Tool output is scrubbed at the harness with the checks kit's gitleaks rules | Accepted | `src/dispatcher/redact.ts`, `src/dispatcher/pi-redact.ts` |
| [0105](0105-the-mutation-config-is-the-kits-preset-and-the-unit-test-files.md) | The mutation config is the kit's preset and the unit test files | Accepted | `stryker.conf.mjs` |
| [0106](0106-a-type-that-repeats-a-schema-or-asserts-outside-data-is-refused-at-every-write-by-oxlint.md) | A type that repeats a schema or asserts outside data is refused at every write, by oxlint | Accepted | `src/dispatcher/types.ts`, `library/engineering/rules/typescript-best-practices/SKILL.md` |
| [0107](0107-a-push-to-main-starts-no-ci-run-and-the-fleet-names-scan-runs-alone-only-on-a-docs-only-change.md) | A push to main starts no ci run, and the fleet-names scan runs alone only on a docs-only change | Superseded |  |
| [0108](0108-astra-reviews-first-with-no-floor-and-codex-models-join-four-dispatch-rules.md) | Astra reviews first with no floor, and Codex models join four dispatch rules | Superseded | `src/generate/no-mistakes-config.ts`, `src/generate/crew-dispatch-config.ts`, `src/generate/crew-dispatch.ts`, `harness/firstmate/crew-dispatch.json`, `tests/unit/crew-dispatch.test.ts`, `tests/unit/machine-files.test.ts` |
| [0109](0109-claude-candidates-lead-the-three-implementation-dispatch-rules.md) | Claude candidates lead the three implementation dispatch rules | Superseded | `src/generate/crew-dispatch-config.ts`, `harness/firstmate/crew-dispatch.json`, `tests/unit/crew-dispatch.test.ts`, `tests/unit/machine-files.test.ts` |
| [0110](0110-fable-5-2-leads-the-ambiguous-investigation-and-unknown-cause-dispatch-rules.md) | Fable 5.2 leads the ambiguous, investigation and unknown-cause dispatch rules | Superseded | `src/generate/crew-dispatch-config.ts`, `src/generate/crew-dispatch.ts`, `selection.toml`, `harness/firstmate/crew-dispatch.json`, `tests/unit/crew-dispatch.test.ts`, `harness/pi/settings.json` |
| [0111](0111-one-crew-dispatch-file-holds-the-mac-rules.md) | One crew dispatch file holds the Mac rules | Superseded | `src/generate/crew-dispatch-config.ts`, `src/generate/machine-files.ts`, `src/generate/link.ts`, `src/generate/firstmate-pins.ts`, `harness/firstmate/crew-dispatch.json`, `tests/unit/crew-dispatch.test.ts`, `tests/unit/machine-files.test.ts` |
| [0112](0112-the-firstmate-dispatch-rules-and-pins-move-to-the-dotfiles-repository.md) | The firstmate dispatch rules and pins move to the dotfiles repository | Accepted | `src/generate/link.ts`, `src/generate/no-mistakes-config.ts`, `tests/unit/link.test.ts`, `tests/unit/no-mistakes-config.test.ts` |
| [0113](0113-finish-the-task-is-switched-off.md) | Finish the task is switched off | Accepted | `selection.toml` |
| [0114](0114-sol-returns-to-the-reviewer-chain-with-no-floor.md) | Sol returns to the reviewer chain with no floor | Accepted | `src/generate/no-mistakes-config.ts`, `tests/unit/no-mistakes-config.test.ts` |
| [0115](0115-the-web-tools-and-the-qwen-repair-leave-the-harness.md) | The web tools and the qwen repair leave the harness | Accepted | `src/generate/link.ts`, `harness/pi/settings.json`, `tests/e2e/extension-preflight.test.ts` |
| [0116](0116-repository-settings-live-in-skills-json-and-local-tests-stay-refused-by-default.md) | Repository settings live in .skills.json and local tests stay refused by default | Accepted | `.skills.json`, `schema/skills.schema.json`, `harness/local-tests/project-settings.ts`, `src/dispatcher/project.ts` |
| [0117](0117-sonnet-runs-the-no-mistakes-pipeline-steps-in-place-of-muse-spark.md) | Sonnet runs the no-mistakes pipeline steps in place of Muse Spark | Accepted | `src/generate/no-mistakes-config.ts`, `tests/unit/no-mistakes-config.test.ts`, `selection.toml` |
| [0118](0118-the-workflows-are-the-set-the-checks-kit-writes.md) | The workflows are the set the checks kit writes | Accepted | `.github/workflows/ci.yml`, `.github/actions/setup/action.yml`, `scripts/ci-test.sh`, `package.json`, `.no-mistakes.yaml` |

<!-- end generated adr-index -->
