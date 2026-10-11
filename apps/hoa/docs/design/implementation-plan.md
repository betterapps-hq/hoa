# Implementation plan: rules schema, encoding and fence review

Builds [encoding.md](encoding.md) and [application-review.md](application-review.md) on the schema in
[schema.md](schema.md). Nothing is released, so data is reset and the build re-run rather than migrated. The sample
Declaration's golden encoding is committed at `apps/hoa/samples/declaration/`.

Each task is one pull-request-sized change with a check that says it's done. Every task ends with `pnpm verify` clean,
and every UX task is checked in the integrated browser. Decisions, status and evaluation scores are in
[implementation-log.md](implementation-log.md).

## Built

Each finished phase in one line. Task ids that code and other docs cite are kept in place.

| Phase | What was built |
| --- | --- |
| 0 Spikes and decisions | The encoding draft's JSON Schema measured and accepted inline by both models; the data reset (0.4, `pnpm db:reset:rules`); the decisions in [README.md](README.md). Recognition replaced the planned text-analysis service. |
| 1 Schema in the app | `src/schema/`: types, Zod validators and drafts, core terms, `validateRulebook` with typing checks, `describe`, statement links; the 57 examples and the sample tested; `pnpm docs:schema`. |
| 2 Engine | `src/engine/`: exact numbers, vocabulary, three-valued values, calendar, paths, operands, conditions, derived properties, checks, deadlines, overrides, evaluate and decide; the fence fixture `src/tests/fenceSchemaFixture.ts` (2.13) and the fence and garage enclosure expected results as tests. Sanctions (2.15) wait for the violations work. |
| 3 Storage | Additive migrations for provisions, rulebook rules, terms and questions, rulebook file and coverage columns and the review's rules file hash; `src/rulebook/assemble.ts` and `carryForward.ts`; the sample seed (3.11, `pnpm db:seed:sample`). |
| 4 Encoding pipeline | `src/encoding/` and `src/text/`: clean, numbering, provisions, check, references, defined terms, plan, prompt variables, merge, consolidate, repair as patches, and the `RulebookBuild` Workflow with `ENCODING_CONCURRENCY` calls in flight (default 16), the check stage, build scores, stop, step progress and results as they arrive. |
| 5 Rules UX | `RuleReference`, `TermChip`, `Statement`, `RuleTable`, `RuleCard`, the rule form and check editors, the Vocabulary, Coverage, Questions and Settings tabs, publish, the rule preview (5.15) and the coverage report (`src/rulebook/coverage.ts`). |
| 6 Review pipeline | `src/review/`: load, selection, fact plan and schema, model-first normalization with the generic verifier (`valueCheck.ts`), numerals, evidence, second readings with escalation, corrections and `pnpm review:corrections`, rule markers, the writer; `reviewApplication` (`run.ts`) inside the `ApplicationReview` Workflow; the synthetic garage enclosure cases. |
| 7 Review UX | The project kind picker, `ReviewReport`, findings by outcome, "What we read from your packet", the provisional notice, the rule matrix (`ReviewMatrix.utils.ts` and `ReviewMatrix`), the finding sheet, entity headers, and project types as organization data (`project_types`, the `/project-types` pages and the homeowner's form). |

Not planned for now: the encoding audit (4.21 to 4.23, a Haiku pass listing each provision's values for code to check
against the rules); the reordered step pipeline below replaces the need.

## Reordered encoding pipeline

The current work. The build is reordered into steps that each do one thing and can each be tested alone, before any
of them is wired into the build: B defined terms (`hoa-defined-terms`), E find the rules (`hoa-rule-finding`), C shared
vocabulary over E's outlines (`hoa-vocabulary-group`), C-merge (`hoa-vocabulary-merge`), F structure each rule with
its retry (`hoa-rule-structuring`), and consolidation (`hoa-consolidation`; the naive encoder keeps `hoa-rulebook-consolidation`). The code is in
`src/encoding/steps/`. Each step has a local dataset from the goldens (`pnpm eval:datasets`) and runs alone over it, a
saved build run or an earlier step run (`pnpm eval:step`; [evaluation.md](evaluation.md#encoding-step-datasets)).

| Id | Task | Done when |
| --- | --- | --- |
| R.1 | Step answer formats, variables, checks and scorers; `pnpm eval:datasets` and `pnpm eval:step`. | Done. |
| R.2 | B defined terms. | Done: `hoa-defined-terms` v6 on Opus at high effort. |
| R.3 | E find the rules. | Done: `hoa-rule-finding` v5 (with `hoa-guide-rule-kinds` v5) on Opus at high effort, checked on four held-out organizations. |
| R.4 | C shared vocabulary and C-merge. | Done: `hoa-vocabulary-group` v2 and `hoa-vocabulary-merge` v1 (implementation-log.md, 2026-10-11). Open: C-merge's clusters miss duplicates whose labels differ. |
| R.5 | F structure the rules, with its retry. | Built; `hoa-rule-structuring` v1 created; testing on the dev split. The judged-requirement gap is settled (below). |
| R.6 | Consolidation. | Built, not yet tested: clears its dataset on `pnpm eval:step`. |
| R.7 | Wire the steps into `RulebookBuild` in place of vocabulary, plan, encode, verify and repair; `pnpm eval:step` chained runs match the build's. | A build of the sample documents runs end to end on the steps. |
| R.8 | Update the build's UX (steps, estimate, results as they arrive) for the new stages. | Browser check during a build. |

Tested one step at a time: revise a prompt, run it alone, judge every miss, then move to the next step.

### Settled for R.5: a requirement is fact-checked only

The schema lets a requirement (a norm with modality requirement and no bearer) carry a judgment check, but neither E
nor F can produce one: E has no judged kind for a requirement, and F's format gives a requirement only a fact check.
Rather than add a kind to both prompts, the golden follows the rule already applied to obligations (a judgment check
only for a quality no fact settles). On 2026-10-11 its 28 judged requirements became 24 fact checks, 3 judged
obligations on the party bearing the duty (an application's completeness and its freedom from possible violations, on
the applicant and decided by the Reviewer; a withdrawal that doesn't unreasonably violate the development scheme, on
the Declarant) and 1 folded into the Section 3.3 process rules (samples/declaration/notes.md, "Judged requirements").

A second approach is being explored beside this one: [taxonomy-ingestion.md](taxonomy-ingestion.md) discovers rule
kinds across organizations and sorts provisions with small models, the large model as fallback.

## Evaluation round 1: encoding quality

Exit: the pipeline's encoding of the sample Declaration matches the golden sample (`samples/declaration/rules.json`) in
quality, on articles it wasn't tuned on.

The golden sample was itself made by model encoders, so it's a reference, not ground truth: where the pipeline and the
golden disagree, the coding agent judging the run decides which reading the text supports, and a confirmed golden error
is fixed in the sample and recorded.

**Who scores what.** Code computes every score it can (keys, text, coverage, reasons, modality, the engine's check
agreement, term recall, validity, repair). Rule recall, rule precision and pairwise quality are judged by the coding
agent in its own session from the comparison files `pnpm eval:encoding:score` writes, and the pairs it finds go back to
the code's scores through the run's `pairs.json` ([evaluation.md, Judging by the coding agent](evaluation.md#judging-by-the-coding-agent)).
There are no judge prompts and no judge calls through OpenRouter.

**Split.** Tune on Articles 1 to 8 and Exhibit C (dev); measure on Articles 9 to 21 (test). The test articles are run
only to measure, never to tune.

| Measure | Bar (test split) |
| --- | --- |
| Provision keys match the golden | at least 98% |
| Provision text similarity | at least 0.97 on average |
| Coverage: every provision cited or given a reason | 100%; reasons agreeing with the golden at least 85% |
| Rule recall (a golden rule has a pipeline rule stating the same requirement, judged by the coding agent) | at least 90% |
| Rule precision (pipeline rules the coding agent finds faithful to the text) | at least 90% |
| Modality agreement on paired rules (paired by key or by the coding agent) | at least 95% |
| Check agreement on paired rules (both evaluated by the engine on generated facts) | at least 85% |
| Term recall | at least 85% |
| Pairwise quality (the coding agent compares pipeline and golden per provision: better, equal or worse) | better or equal at least 80% |
| Units Zod-valid after repair | 100%; at most 15% needing repair |

| Id | Task | Done when |
| --- | --- | --- |
| E1.1 | OCR the sample Declaration once into page records, cached in the git-ignored `.fixtures/`. | Done (`pnpm ocr:fixture`). |
| E1.2 | `scripts/eval-encoding.ts`: run the encoding stages in process on a split, save the draft, score it against the golden. | Done (`pnpm eval:encoding`). |
| E1.3 | Scorers in code and comparison files for the coding agent. | Done (`src/evaluation/encoding/`, `pnpm eval:encoding:score`). |
| E1.4 | Runs of the current build on dev and test. | Done: they are the step datasets' comparison columns ([evaluation.md](evaluation.md#encoding-step-datasets)). |
| E1.5 | Clear every bar on dev, then measure test once. | Pursued through the reordered pipeline above, not by tuning the current build's prompts. |

## Evaluation round 2: review quality

Exit: reviews of the fence packet, the garage enclosure packet and their variants match their expected results.

| Measure | Bar |
| --- | --- |
| Entities: right types and counts | 100% on every case |
| Facts: right state and value per property, against each case's expected facts | at least 90% |
| Normalization: stated values matched to the right terms and units | at least 98% |
| Evidence quotes found on their pages | at least 95% |
| Finding outcomes per rule and entity | at least 95% |
| Recommendation | 100% of cases |
| Action items: right rules and entities | at least 95% |
| Writer faithfulness and clarity (judged by the coding agent from each case's `writer.md`) | at least 0.9 |

| Id | Task | Done when |
| --- | --- | --- |
| E2.1 | Expected facts, documents and findings for every case, as data next to the cases (the fence packet's stay in `.fixtures/` until 8.12 redacts it). | Done. |
| E2.2 | `scripts/eval-review.ts`: run the review stages in process on a case and score it. | Done (`pnpm eval:review`). |
| E2.4 | **Iterate** until every bar clears, one change per round, logged. Tuning and measurement are separate ([evaluation.md](evaluation.md#tuning-and-measurement)): tune on the garage enclosure cases; the fence is held out and measured, never tuned on. | Every bar clears on the held-out slices; prompt versions labeled `preview`. Open: the generic prompts' scores are in the log. |

## Remaining tasks

| Id | Task | Done when |
| --- | --- | --- |
| 6.25 | **People's corrections:** a committee member or homeowner corrects a fact on the review, recorded as `person-corrected` with the reading it replaces; the export already carries them. | Component test; browser check. |
| 8.3 | Fence gold encoding: guidelines Article 5 and its exhibits and Declaration Article 4, checked against the fence fixture (2.13). | The fixture agrees with the golden. |
| 8.6 | Review datasets from the redacted packet variants ([evaluation.md](evaluation.md)): `entity-facts`, `subject-identification`, `document-review`, `review-decision`, with the garage enclosure cases' items. | Datasets in Langfuse. |
| 8.8 | **Deferred until after the demo** (the person's decision, 2026-10-10): production evaluators on root observations for `review-summary` and the build. They'd bill OpenRouter on every sampled trace. | Not started. |
| 8.9 | Move prompts from `development` to `preview` and `production` labels once each clears its bar. | Labels moved; recorded in evaluation.md. |
| 8.10 | Commit the sample Declaration's page text and PDF without the recording cover sheet and the signature and notary pages, reviewed by a person for names. | Under `samples/declaration/`; the review recorded in the samples README. |
| 8.11 | Commit the Residential Design Guidelines (after the same review) and the rest of their encoding. | Under `samples/`. |
| 8.12 | Commit a redacted copy of the sample fence application, reviewed by a person, and the packet variants built from it. | Under `samples/fence-application/`; the review recorded. |
| 9.3 | Update [platform.md](platform.md) (workflow step names, storage) for the built pipelines. | Links checked. |
| 9.4 | `Dashboard.tsx`: project type labels from the organization's project types (`ApplicationsPage` done). | Done with the dashboard's redesign. |
| 9.5 | Reset preview and demo data, run the build on the sample documents, publish, and run the sample review. | The demo shows the expected result. |
| 9.6 | Migration dropping `sections`, `rules` and the old `governing_documents`, `rulebooks` and `applications` columns (`src/rules/rule.ts` goes with them), once main no longer reads them. | Migration applied to preview after merge. |

## After the proof of concept

Deferred until the demo works end to end on the fence and garage enclosure:

| Item | What it is |
| --- | --- |
| More sample documents | Governing documents from other organizations (other states, condos, older scans, fine schedules), some held out from all tuning, to measure whether the schema, prompts and parser generalize beyond the sample Declaration |
| A general encoding prompt | Rewrite the encoding prompts' examples from several documents, so they don't teach through the sample Declaration's clauses |
| Amendments | Consolidate an amended document's current text from the original and its separately recorded amendments before structure |
| Large allowed-value lists | Above about 50 allowed values (paint palettes), ask the model for the stated value and match in code instead of listing them |
| State law | Load a state's HOA statute as documents so statutory overrides (solar, flags, EV chargers, fine caps) are exercised |
| Sanctions | `engine/sanctions.ts` (2.15): cure, preconditions, liability, amounts, repeats, caps and limits, with the violations work |

## Order

The reordered pipeline comes first: finish E, then C, C-merge, F and consolidation one at a time, wire them into the
build (R.7, R.8), and measure evaluation round 1 on them. Then the demo (9.5) and the cutover migration (9.6). The
committed samples (8.10 to 8.12) need a person's review for names and can happen any time.
