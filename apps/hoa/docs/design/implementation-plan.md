# Implementation plan: rules schema, encoding and fence review

Builds [encoding.md](encoding.md) and [application-review.md](application-review.md) on the schema in
[schema.md](schema.md). Nothing is released, so the first build's rule model, catalog, tables and prompts are replaced,
not migrated: data is reset and the build re-run.

Each task is one pull-request-sized change with a check that says it's done. Tasks inside a phase can run in parallel
unless they list a dependency. Every task ends with `pnpm verify` clean, and every UX task is checked in the integrated
browser.

**Source material.** The schema, its Zod validator, the 57 examples and the checkers exist as scratch files from the
design work (`schema.ts`, `schema.zod.ts`, `examples.ts`, `check.ts`, `render.ts`, `build-doc.py`, and the encoding's
`check-ccrs.ts`, `build-rules-file.ts`). Phase 1 moves them into the app. The sample Declaration's encoding is committed
at `apps/hoa/samples/declaration/` (the rules file, the encoders' notes and the encoding brief).

## Phase 0: Spikes and decisions

Exit: the open technical risks are measured and the decisions below are recorded in [README.md](README.md).

| Id | Task | Done when |
| --- | --- | --- |
| 0.1 | **Tool schema size.** Generate the JSON Schema for `EncodingDraft` (rule drafts included) with `z.toJSONSchema`, `reused: "inline"`, then `reused: "ref"`. Send each as the `respond` tool to `anthropic/claude-opus-5.5` and `OPENROUTER_MODEL` through OpenRouter with a one-provision prompt. | A note in `ai.md` with sizes, which form each provider accepts, and the chosen form. `runObjectPrompt` gains a `schemaForm` option if `ref` is needed. |
| 0.2 | **Output length.** Encode the sample's largest unit (Article 7, section 7.4) by hand-prompting with the brief; record output tokens. | Unit token budget in `encoding.md` confirmed or lowered. |
| 0.3 | ~~**Text-analysis service.**~~ **Replaced** by recognition ([encoding.md, Recognition](encoding.md#recognition)): the model proposes values with quotes and code verifies them; no service is built. | Recorded in the implementation log. |
| 0.6 | ~~**LexNLP license.**~~ **Moot:** LexNLP is dropped (implementation log). | Recorded. |
| 0.4 | **Data reset.** Script that empties rulebooks, rules, sections, reviews and their R2 objects in local and preview environments. | `pnpm db:reset:rules` documented in `setup.md`. |
| 0.5 | **Decisions.** Add rows to the README decisions table: rules file as the published artifact; per-record D1 rows for drafts; code-based rule selection; language tools chosen for accuracy, in a text-analysis service where they're Python; exact decimals in the engine; sample data committed under `apps/hoa/samples/`, redacted where it names people. | Merged. |

## Phase 1: The schema in the app

Exit: `src/schema/` holds the types, Zod validators, draft schemas, core terms and `validateRulebook`, tested by the 57
examples.

| Id | Task | Done when |
| --- | --- | --- |
| 1.1 | Move shared schemas out of `src/rules/rule.ts`: `errorInfoSchema`, `promptVersionSchema` to `src/shared/`. Update `jobs/job.ts`, `applications/application.ts`, `documents/governingDocument.ts`, `review/reviewModel.ts`. | `rule.ts` imports nothing that others need. |
| 1.2 | Add `src/schema/types.ts` from the scratch `schema.ts` (every section). | Types compile under the app's strict tsconfig (with `exactOptionalPropertyTypes` if enabled). |
| 1.3 | Add `src/schema/zod.ts` from `schema.zod.ts`: validators, `rulesFile`, `ruleDraft`, `RuleDraft`, the agreement checks. | `agree<Same<…>>` checks compile. |
| 1.4 | Add term and question draft schemas (`termDraft`, `questionDraft`) and `EncodingDraft` (encoding.md, Encode). | Zod output equals the stored types minus bookkeeping, checked like `ruleDraft`. |
| 1.5 | Add `src/schema/coreTerms.ts`: the core vocabulary (parties, request types with request data, `approval`, `work`, `compliance-period`, units) from `examples.ts`, as data. | Every core term validates with `term`. |
| 1.6 | Add `src/schema/examples.test-data.ts` (the 57 examples) and `examples.test.ts`: every example validates; every term and rule they reference resolves. | Tests pass. |
| 1.7 | Add `src/schema/validate.ts`: `validateRulebook(input): Issue[]` with the checks from `check.ts` and `check-ccrs.ts` (references, invariants, coverage, clause `except` lists, approvals name parties). Each issue carries its record key and JSON path. | Unit tests per invariant, positive and negative. |
| 1.8 | Add typing checks to `validateRulebook`: path steps resolve, comparisons and arithmetic type-check, values belong to complete sets (`type-mismatch`, `invalid-value`). | Tests per typing rule. |
| 1.9 | Add `src/schema/describe.ts`: `describeRule`, `describeCondition`, `describeCheck`, rendering sentences with term labels, for the UX and prompts. | Snapshot tests over the examples. |
| 1.10 | Add `src/schema/statement.ts`: parse and render `{{term-key}}` and `{{term:plural}}` links. | Tests. |
| 1.12 | Test that `apps/hoa/samples/declaration/rules.json` validates with `rulesFile` and `validateRulebook`. | Test passes; fails on a broken reference. |
| 1.13 | ~~**Guard test** for organization term keys in code.~~ Removed 2026-10-09: a check against each organization's terms grows with every customer and flags ordinary words (`person`). Organization knowledge stays out of code and prompts by design, and held-out evaluation catches fitting (implementation-log.md). | Removed. |
| 1.11 | Move the schema doc generator into `apps/hoa/scripts/build-schema-doc.ts` (from `build-doc.py` and `render.ts`), reading `src/schema/types.ts` and the examples. `pnpm docs:schema` regenerates `schema.md` and `schema-examples.md`. | Output matches the committed docs. |

## Phase 2: Engine

Exit: `src/engine/` evaluates the schema's application-relevant semantics, and the sample's expected findings come out
of a fixture built from the examples. Depends on phase 1.

| Id | Task | Done when |
| --- | --- | --- |
| 2.1 | `engine/decimal.ts`: exact decimals (scaled bigint) and fractions; parse `perBase`. | Tests incl. 72 in = 6 ft, percent, rounding half up to the cent. |
| 2.2 | `engine/vocabulary.ts`: index core and organization terms; refinements; category membership; broader values; unit conversion by dimension. | Tests over the examples' vocabulary. |
| 2.3 | `engine/values.ts`: three-valued booleans; ranges for unknown quantities, counts and dates; absent semantics. | Truth-table tests from schema.md, Expressions 2–6. |
| 2.4 | `engine/paths.ts`: resolve paths from `subject`, `request`, `lot`, `community`; references; many-valued steps; `ifUnstated`. | Tests: gate to fence run, unknown versus absent. |
| 2.5 | `engine/operands.ts`: `ref`, constants, `sum`, `difference`, `product`, `quotient`, `greatest`, `least`, `count`, `sum-of`, `greatest-of`, `least-of`, `shift`, `governing-date`, schedules. | Tests incl. ranges through arithmetic. |
| 2.6 | `engine/conditions.ts`: `all`, `any`, `not`, `compare`, `in` (with broader), `between`, `exists`, `is-a`, `every`/`some`/`none`, `during`, `approved`, `text` (from condition answers). | Tests per condition and per three-valued case. |
| 2.7 | `engine/derived.ts`: derived properties (first matching derivation). | Tests. |
| 2.8 | `engine/checks.ts`: `test`, `table` (unknown rows with equal results), `document` (missing, unconfirmed, contradicted), `judgment` (threshold), `approval` (`needs` all/any, prior, written, application flow), no check. | Tests per check per outcome. |
| 2.9 | `engine/deadlines.ts`: windows, business days, roll-forward, `pending`, `onMiss` effects. | Tests from the examples (committee decides within 30 days, meeting notice). |
| 2.10 | `engine/overrides.ts`: selector resolution (documents, provisions, `adoptedAfter`, `except`), precedence validity, displaced, exempt, decided-by; discretion in application flow only. | Tests: other manufacturers case by case, existing fences grandfathered, a variance. |
| 2.11 | `engine/evaluate.ts`: rules × subjects to `Finding[]` per schema.md, Evaluating a request 1–7; remedies; inputs recorded. | Tests per outcome. |
| 2.12 | `engine/decide.ts`: recommendation order; action items grouped by rule with entities; advisory as suggestions; committee-borne findings and approvals by the request type's decider (`deciders`) shown but not counted. | Tests per recommendation, incl. a compliant application recommended for approval despite the prior-approval rule. |
| 2.13 | `src/tests/fenceSchemaFixture.ts`: the sample's fence rules (guidelines 5.2 to 5.9 and Declaration 4.1 from the examples, completed where the examples are partial), the five entities and the facts and documents from the expected result, with no packet text. | Fixture validates with `rulesFile`. |
| 2.14 | `engine/sample.test.ts`: the expected result for the sample application (application-review.md) from the fixture: every outcome per rule and entity, the recommendation and the action items. | Test passes. |
| 2.16 | `engine/garage.test.ts`: the garage enclosure expected result (application-review.md) from the committed sample rulebook and the synthetic packet's facts, with its three variants. | Test passes. |
| 2.15 | `engine/sanctions.ts` (violations, later): cure, preconditions with `except`, liability with `appliesWhen`/`until`/`except`, amounts, repeats, caps, limits. | Deferred to the violations work; listed so the module boundary is kept. |

## Phase 3: Storage

Exit: the new tables and R2 layout exist with repositories and tests; the old rule tables are gone. Depends on phase 1.

| Id | Task | Done when |
| --- | --- | --- |
| 3.1 | `governing_documents`, additively: add `key` (unique per organization) and allow `referenced` documents with no file; the schema's `DocumentKind` values in the existing `kind` column. Old columns stay until 9.6 (previews share one D1 database, so migrations stay backward compatible). | Migration generated with `pnpm db:generate`. |
| 3.2 | Add `provisions` (encoding.md, Storage); `sections` stays until 9.6. | Migration; `documentRepository` gains `saveProvisions`, `listProvisions`, `getProvision`. |
| 3.3 | `rulebooks`, additively: add nullable `settings_json`, `file_key`, `file_sha256`, `coverage_json`; the partial unique indexes stay. | Migration; repository tests for one building and one draft. |
| 3.4 | Add `rulebook_rules` (`rulebook_id`, `rule_key`, `kind`, `request_types`, `applies_to`, `review_status`, `content_hash`, `rule_json` with the schema's `Rule`). The old `rules` table stays until 9.6, so previews of other branches keep reading it. | Repository parses with the new Zod `rule`. |
| 3.5 | Add `rulebook_terms` and `rulebook_questions` tables and repositories. | Tests. |
| 3.6 | `src/storage/keys.ts`: `rulebookKeys(hoaId, rulebookId).file`; job output keys for the new stages. | Tests. |
| 3.7 | `src/rulebook/assemble.ts`: build a `RulesFile` from D1 records (approved only), validate with `rulesFile` and `validateRulebook`, serialize canonically (sorted keys) and hash. | Same records give the same hash. |
| 3.8 | `src/rulebook/carryForward.ts`: content hashes for rules and terms; keep approvals whose key and hash match the last published rulebook. | Tests. |
| 3.9 | `reviews` table: add `rules_file_sha256`, keep `rulebook_id`. | Migration. |
| 3.11 | Seed script: publish `samples/declaration/rules.json` (and the guidelines once committed) as an organization's rulebook. | `pnpm db:seed:sample` gives a published rulebook locally. |
| 3.10 | Update `seed/hoa.sql` for the new tables; reset local and preview data (0.4). | `pnpm dev` starts with an empty rulebook. |

## Phase 4: Encoding pipeline

Exit: building the sample Declaration (and the Design Guidelines) produces a valid draft rulebook with coverage and
issues, traced in Langfuse. Depends on phases 1 and 3; 4.12 onward also on 0.1.

| Id | Task | Done when |
| --- | --- | --- |
| 4.1 | `src/text/normalize.ts`: reuse `normalizeForMatching`; add plural handling from labels. | Tests. |
| 4.2 | `src/text/match.ts`: normalized exact matching, then similarity with RapidFuzz's ratios in TypeScript (no service), returning the match kind and score. | Tests incl. "Restnctions", "Winchester Gray", short labels never fuzzy. |
| 4.3 | `src/pipeline/structure/clean.ts`: drop Azure Layout's `pageHeader`, `pageFooter` and `pageNumber` paragraphs, then repeated lines; hyphenation; offset map to pages. | Tests on the sample Declaration's redacted page text (8.10), incl. recording stamps. |
| 4.4 | `src/pipeline/structure/numbering.ts`: the marker grammar and sequence stack (articles, sections, letters, roman numerals, numbers, exhibits; letter-versus-numeral disambiguation; inferred repairs). | Table tests, incl. `(h)`,`(i)`,`(j)` letters and `(i)`,`(ii)` numerals. |
| 4.5 | `src/pipeline/structure/provisions.ts`: split into provisions, counted paragraphs, intro and wrap-up detection, keys and labels per schema.md, anchors. | The sample Declaration's redacted page text (8.10) gives the provisions in `samples/declaration/rules.json`: keys, labels, intros and wrap-ups. |
| 4.6 | `src/pipeline/structure/check.ts`: coverage of text, sequences, unique keys; the repair trigger. | Tests. |
| 4.7 | `src/pipeline/references.ts`: reference grammar and resolution (absolute, relative, documents); referenced documents. | Table tests from the sample's phrasing. |
| 4.7a | ~~Service route `/analyze`~~ **Replaced** by the audit (4.21, 4.22). | |
| 4.7b | ~~The `analyze` stage's text analysis~~ **Replaced** by the audit (4.21, 4.22); `analyze` keeps the references. | |
| 4.8 | `src/pipeline/definedTerms.ts`: quoted and capitalized definitions plus capitalized-phrase candidates with counts and samples, found by code (no LexNLP). | Tests. |
| 4.9 | `src/pipeline/plan.ts`: encoding units within the token budget, with ancestors' intros, references, vocabulary slice (via 4.2) and request types. | Tests: the sample's articles split as expected. |
| 4.10 | `src/pipeline/encodingPrompt.ts`: serialize provisions, context, references, terms and core terms for the prompt variables (compact, stable order for caching). | Snapshot tests. |
| 4.11 | Register the build prompts in `src/ai/pipelinePrompts.ts`: `structureRepair`, `termExtraction`, `provisionEncoding`, `encodingRepair`, `rulebookConsolidation` with their variables. | Contract tests. |
| 4.12 | **Write the prompts in Langfuse** (development label): `hoa-provision-encoding` from `BRIEF.md` (conventions and the revised-schema sections) plus schema.md sections 2 to 5; `hoa-encoding-repair`; `hoa-term-extraction`; `hoa-rulebook-consolidation`; `hoa-structure-repair`. `config.model` set. | Each resolves through the loader with matching variables. |
| 4.13 | `src/pipeline/merge.ts`: merge unit drafts (terms, rules, clauses, referenced documents), coverage report. Port of `build-rules-file.ts`'s merge. | Tests incl. conflicting terms and duplicate keys. |
| 4.14 | `src/pipeline/consolidate.ts`: candidate pairs from the service's embedding route; summaries for the prompt; apply `Consolidation` (duplicates, overrides, term merges with reference rewriting, conflict questions). | Tests. |
| 4.14a | ~~Cross-checks from the stored analysis~~ **Replaced** by the audit's checks (4.22). | |
| 4.15 | `src/pipeline/repair.ts`: group problems by unit with JSON paths; decide repair versus re-verify after merge. | Tests. |
| 4.16 | Rewrite `RulebookBuild` (`src/workflows/rulebookBuild.server.ts`) with the stages, step names, fan-out with concurrency 8, failures recorded per unit (`completed-with-errors`), caching per stage, progress per stage. | Runs locally on the sample Declaration end to end. |
| 4.17 | `save-draft`: write provisions, terms, rules, questions, settings and coverage; carry forward approvals. | Repository-level test with a small fixture. |
| 4.18 | Build scores to Langfuse on the build's root span: valid units, problems before and after repair, coverage, rules per kind, text conditions, gap notes. | Visible in Langfuse for a local build. |
| 4.19 | `JobProgress.utils.ts`: labels for the new stages. | Component test. |
| 4.20 | Update `startRulebookBuild`, `getRulebookView` and `publishRulebook` in `rulebook.functions.ts` for the new model; publish assembles and writes the file (3.7). | Server-function tests where testable; manual run. |
| 4.21 | **Audit prompt** `hoa-provision-audit` in Langfuse (development label, Haiku by `config.model`, generic: no organization, project or product in its text), registered in `pipelinePrompts.ts` with `document`, `provisions`; its output schema (items per provision: kind, quote, value in schema terms). After evaluation round 1. | Contract test; resolves through the loader. |
| 4.22 | **Audit step and checks:** `audit:{unitId}` in the verify stage; the review's generic verifier (`valueCheck.ts`) on each item's quote and numerals; `unencoded-value`, `unencoded-party` and `unencoded-condition` in verify, sent to repair (encoding.md, Recognition). | Tests: a deadline missing its 30 days, a dropped approver and a dropped "unless" are caught; an item whose quote isn't in the provision is dropped and recorded. |
| 4.23 | **Audit corrections:** rejected audit items and how each audit problem was resolved (repair, no-rule note, dismissed by the administrator) recorded on the build, exportable as `provision-encoding` items like the review's. | Tests; the export runs on an evaluation build. |

## Evaluation round 1: encoding quality

Exit: the pipeline's encoding of the sample Declaration matches the golden sample (`samples/declaration/rules.json`) in
quality, on articles it wasn't tuned on. Runs after phase 4, before the sample rulebook is published (5.14).

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
| E1.1 | OCR the sample Declaration once into page records, cached in the git-ignored `.fixtures/` (its cover and signature pages name individuals). | Page records load from the cache in scripts. |
| E1.2 | `scripts/eval-encoding.ts`: run the encoding stages in process on a split (no Workflow), save the draft, and score it against the golden; results to a Langfuse experiment and a Markdown report. | One command gives the table above for a split. |
| E1.3 | Scorers in code: key and text matching, coverage and reasons, rule pairing by key and from the coding agent's `pairs.json`, modality, check agreement via the engine on facts generated from each rule's paths and values, term recall; comparison files per provision and for unmatched terms, from which the coding agent judges rule recall, precision and pairwise quality. | Unit tests for the scorers and comparison files; no judge prompts. |
| E1.4 | Baseline run on dev and test; record scores and the failure categories in the implementation log. | Logged. |
| E1.5 | **Iterate on dev** until it clears every bar, then measure test once. Each round changes one thing and is logged with its scores: prompt text (development label), context assembly (vocabulary slice, references, intros), unit size, repair instructions, consolidation, and agentic patterns (a critic pass that checks a unit's rules against its provisions before verify; two encodings of a unit reconciled; a dedicated pass for checks the engine disagrees on). If test misses a bar, return to dev with the failure categories. | Test clears every bar; the winning prompt versions labeled `preview`. |
| E1.6 | ~~Text-analysis service~~ **Replaced** by the audit (4.21 to 4.23), built after this round's baseline. | |

## Phase 5: Rules UX

Exit: an administrator can review, edit, answer questions and publish the sample rulebook in the browser. Depends on
phase 4 (4.20) and 1.9.

| Id | Task | Done when |
| --- | --- | --- |
| 5.0 | `RuleReference`: a rule's title and main citation label; activating opens `DocumentViewer` at the provision with the highlight or plat region; hover and focus show the provision text; "and N more" for further citations. Used everywhere a rule is named. | Component test; browser check, keyboard included. |
| 5.1 | `TermChip` (replaces `AttributeChip`): popover with labels, definition and kind. | Component test; browser check. |
| 5.2 | `Statement`: renders `{{term}}` links as `TermChip`s. | Component test. |
| 5.3 | `RuleTable`: domain filter, kind and request-type filters, status toggles; rows show title and rendered statement. | Component test; browser check. |
| 5.4 | `RuleCard` read view: modality, bearer, subject, request types, applicability and check via `describeRule`; overrides and enforcement listed with links. | Component test; browser check. |
| 5.5 | Citations: `DocumentViewer` opens at a provision and highlights its anchors; "View in document" from a rule. | Browser check on the sample. |
| 5.6 | Issues from `validateRulebook` and the build on the card, with resolve-and-note. | Component test. |
| 5.7 | Rule form: title, statement, modality, bearer, remedy, request types, with live validation. | Component test; browser check. |
| 5.8 | Check and condition editor for compare, in, between, all/any, table rows, approval and document checks, over term pickers. | Component tests per check type. |
| 5.9 | JSON editor fallback for any rule, validated live by Zod and `validateRulebook`. | Component test. |
| 5.10 | Vocabulary tab: terms list, filters by kind and status, approve/reject, where used. Rule approval blocked while a term it reads is proposed. | Component test; browser check. |
| 5.11 | Coverage tab: provisions in order with citing records or no-rule reasons; uncovered first; set a reason. | Component test; browser check. |
| 5.12 | Questions tab: options, answering rejects the dropped candidate rules. | Component test; browser check. |
| 5.13 | Settings tab: clauses with citations, read and edit. | Component test. |
| 5.14 | Publish: blockers (unreviewed records, blocking issues, uncovered provisions) and the published tab's hash and download. | Browser check: publish the sample. |
| 5.15 | Rule preview: evaluate a rule against facts typed in the card, with the engine (2.11). | Component test. |
| 5.16 | Coverage report in the Coverage tab, like a test coverage report: the share of each document's characters covered by rules, term definitions, settings clauses and approved no-rule reasons, per document and article as stacked bars; each document's text passage by passage, marked by what covers it (color, icon and label), with uncovered provisions and page text outside any provision striped and listed as gaps, and the values the citing rules encode underlined; choosing a passage lists everything that covers or cites it in a side panel (a sheet on narrow screens). | Pure computation tested (`src/rulebook/coverage.ts`); component tests; browser check at desktop and phone widths, light and dark, keyboard. |

## Phase 6: Fence review pipeline

Exit: reviewing the sample packet against the published sample rulebook gives the expected result in the browser.
Depends on phases 2, 3 and 5.14.

| Id | Task | Done when |
| --- | --- | --- |
| 6.1 | Application model: `projectType` becomes `projectKind: TermKey`; `requestType` fixed to `architectural-application`; drop the catalog enums from `application.ts` and `reviewModel.ts`. | Migration; tests. |
| 6.2 | `src/review/reviewModel.ts`: the new `Review`, `ActionItem`, `DocumentResult` schemas (application-review.md, Save). | Zod tests. |
| 6.3 | `src/review/load.ts`: read and hash-check the rules file; build the `EvaluationRequest` skeleton (dates, provisional). | Tests. |
| 6.4 | `src/review/documentTypes.ts`: document types from the rulebook plus generic kinds, for classification. | Tests. |
| 6.5 | `src/review/candidates.ts`: candidate entity types for a request type (subjects of its rules and what they reference). | Tests on the fixture. |
| 6.6 | `src/review/select.ts`: rule selection steps 1 to 4, selectors resolved. | Tests: the fixture selects the expected rules. |
| 6.7 | `src/review/factPlan.ts`: walk selected rules to the fact plan; split into entity groups; text conditions. | Tests: properties per type for the fence fixture. |
| 6.8 | `src/review/factSchema.ts`: build the dynamic Zod schema from a fact plan group. | Tests: rejects an unplanned property. |
| 6.9 | `src/text/quantity.ts`: the quantity grammar. | Table tests: `6'`, `6 ft`, `72"`, `6'-0"`, `six (6) feet`, `4 to 6 feet`, failures. |
| 6.10 | ~~Service route `/dates`~~ **Replaced:** dates are the model's reading, verified (6.22), with `src/text/date.ts` as a fast check. | |
| 6.11 | `src/review/normalize.ts`: stated values to `FactValue` (quantities, choices via 4.2, dates via 6.10, references) in one service batch per review, conflicts, confidence threshold. | Tests incl. "River Birch" to the Frame It All value, "Winchester Gray". |
| 6.12 | `src/review/verifyEvidence.ts`: `matchQuote` per evidence; downgrade unmatched facts. | Tests. |
| 6.13 | `src/review/promptInputs.ts`: serializers for every review prompt (pages with markers as today, candidate types, plan slices, requirements, judgment context, findings for the writer). | Snapshot tests. |
| 6.13a | `src/review/ruleMarkers.ts`: parse and validate `{{rule:KEY}}` markers in the writer's output against the findings; an unknown marker fails the step. | Tests. |
| 6.14 | Register the review prompts: `pageClassification`, `subjectIdentification`, `entityFacts`, `documentReview`, `judgmentCheck`, `reviewSummary`. | Contract tests. |
| 6.15 | **Write the review prompts in Langfuse** (development label), starting from the first build's prompts where they apply (`hoa-fact-extraction`'s evidence rules, `hoa-document-check`'s checklist handling, `hoa-review-writer`'s tone). | Each resolves through the loader. |
| 6.16 | Rewrite `ApplicationReview` (`src/workflows/applicationReview.server.ts`) with the stages and step names; OCR and visuals unchanged; per-group fact calls and per-judgment calls fan out with failures recorded. | Runs locally on the sample packet. |
| 6.17 | `save-review`: R2 record and D1 summary with `rules_file_sha256`; application to `reviewed`. | Repository test. |
| 6.18 | `runReview` and `getApplicationView`: require a published rulebook; load `ReviewRule`s and cited provisions from the review's rules file. | Manual run; unit tests for the selection of cited rules. |
| 6.19 | `JobProgress` labels for the review stages. | Component test. |
| 6.20 | Write and commit the synthetic garage enclosure packet and its variants under `samples/garage-enclosure/` (form, description, floor plan, elevation; no personal data). | The review pipeline gives the expected result on each. |
| 6.21 | **Numerals** (`src/text/numerals.ts`): digits, decimals, fractions, mixed numbers and a fixed list of number and fraction words, read exactly; the quantity grammar reads its numbers through it. | Table tests. Done. |
| 6.22 | **Model-first normalization** (application-review.md, Recognition): quantities, counts and dates from the model's reading, checked by the generic verifier (`src/review/valueCheck.ts`: numerals agree after unit conversion, compounds, the unit's dimension), the grammars as fast checks feeding it; the reading may give an exact fraction. | Tests: forms no grammar reads verify; a wrong numeral is rejected and the grammar's value stands; 6 ft read as 6 inches is held. Done. |
| 6.23 | **Second readings decide disputes:** the verification pass reads every fact that alone decides a finding (any outcome), and escalates a reading that doesn't confirm it once to `config.escalationModel`; still disputed stays conflicting or uncertain. | Tests: escalation settles a dispute; without an escalation model it stays conflicting. Done. |
| 6.24 | **Corrections recorded and exported:** `corrections` on the review record; `pnpm review:corrections` exports them to the Langfuse dataset `entity-facts`. | Tests; the export runs on an evaluation run. Done. |
| 6.25 | **People's corrections** (later): a committee member or homeowner corrects a fact on the review, recorded as `person-corrected` with the reading it replaces; the export already carries them. | Component test; browser check. |

## Evaluation round 2: review quality

Exit: reviews of the fence packet, the garage enclosure packet and their variants match their expected results. Runs
after phase 6, before the review UX is finished (phase 7).

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
| E2.1 | Expected facts, documents and findings for every case, as data next to the cases (the fence packet's stay in `.fixtures/` until 8.12 redacts it). | Data files load in scripts. |
| E2.2 | `scripts/eval-review.ts`: run the review stages in process on a case and score it; Langfuse experiment and Markdown report. | One command scores all cases. |
| E2.3 | Baseline on every case; failure categories in the implementation log. | Logged. |
| E2.4 | **Iterate** until every bar clears, one change per round, logged: prompts, entity grouping, the fact plan's wording, normalization thresholds, and agentic patterns (a verification pass on each fact that alone decides a not-met finding; two readings of low-confidence facts reconciled; a page-targeted second look when evidence doesn't verify). Tuning and measurement are separate ([evaluation.md](evaluation.md#tuning-and-measurement)): tune on the garage enclosure cases; the fence project type is held out and measured, never tuned on. | Every bar clears on the held-out slices; prompt versions labeled `preview`. |

## Phase 7: Review UX

Exit: the homeowner and committee views show the new review in the browser. Depends on phase 6.

| Id | Task | Done when |
| --- | --- | --- |
| 7.1 | ~~Project kind picker from the rulebook's `work` categories~~ **Replaced by 7.12:** the picker lists the organization's project types, with "Something else". | Component test; browser check. |
| 7.2 | `recommendationLabels` and variants: add "Refer to the committee", rename "Reject" to "Deny". | Component test. |
| 7.3 | `ReviewReport` action lists with entities, plus "Suggestions"; every rule named through `RuleReference`, and the written summary's markers rendered as `RuleReference`s. | Component test; browser check. |
| 7.4 | Findings grouped by the new outcomes, each with statement, entity, reason and cited provision text, "View in document". | Component test; browser check. |
| 7.5 | "What we read from your packet": facts per entity with evidence (page and quote). | Component test; browser check. |
| 7.6 | Provisional review notice before submission. | Component test. |
| 7.7 | `ApplicationPage` test fixture rebuilt on the new `Review`. | Tests pass. |
| 7.8 | `src/review/matrix.ts`: build the matrix model from a review (rule rows grouped by provision, entity columns plus the application, one cell per finding, n/a cells for rules that don't apply to an entity). | Tests on the sample fixture: the expected result's grid. |
| 7.9 | `ReviewMatrix` component: chips per outcome, fixed rule column with scrolling entity columns, "Only what needs attention" and outcome filters, card layout below 480 pixels. | Component test; browser check at desktop and phone widths, light and dark. |
| 7.10 | Finding sheet from a cell: statement, provision text, reason, every input marked read from the packet (page, quote, thumbnail, confidence), matched (with fuzzy score), computed or not provided; judgment and document results. | Component test; browser check on the sample. |
| 7.11 | Entity header detail (type, label, identifying evidence) and the homeowner and committee variations (action item links; discretion rule and judgment rationale). | Component test; browser check in both roles. |
| 7.12 | **Project types as organization data** (application-review.md, Project types): D1 `project_types` (migration 0004, additive), definitions built from the rules, model suggestions checked by code, the requirements list, the administrator's `/project-types` pages (add, edit questions, archive, delete), the homeowner's form rendered from the definition, and the answers in the review. | Done: unit and component tests; browser check of adding a type and the homeowner's form. |

## Phase 8: Datasets and evaluation

Exit: every model stage has a Langfuse dataset and a regression bar; the tuning loop in [evaluation.md](evaluation.md)
runs on the new prompts. Can start alongside phases 4 and 6.

| Id | Task | Done when |
| --- | --- | --- |
| 8.1 | Rewrite [evaluation.md](evaluation.md) for the new stages, datasets and scores (from encoding.md and application-review.md). | Merged. |
| 8.2 | `provision-encoding` dataset, loaded from `samples/declaration/` after review: one item per unit (input: the unit's prompt variables; expected: its draft). | Dataset in Langfuse; the loader script is committed. |
| 8.3 | Fence gold encoding: guidelines Article 5 and its exhibits and Declaration Article 4, encoded by the pipeline and corrected by hand. | Dataset items; the fixture in 2.13 agrees. |
| 8.4 | `term-extraction` dataset from the sample's Article 2 and the guidelines' definitions. | Dataset in Langfuse. |
| 8.5 | Encoding experiment scorer: modality agreement, engine-based check agreement on generated facts and term recall in code; rule recall and precision by provision judged by the coding agent from comparison files. | Experiment runs from a script. |
| 8.6 | Redacted packet variants (evaluation.md's table) as `entity-facts`, `subject-identification`, `document-review` and `review-decision` items. | Datasets in Langfuse. |
| 8.7 | Review scorers: entity accuracy, fact accuracy per property, normalization accuracy, evidence verification rate, finding accuracy, recommendation accuracy. | Experiment runs from a script. |
| 8.8 | **Deferred until after the demo** (the person's decision, 2026-10-10): production evaluators on root observations for `review-summary` (faithfulness, clarity) and `provision-encoding` (gap notes, problems). They'd bill OpenRouter on every sampled trace, indefinitely. | Not started. |
| 8.10 | Commit the sample Declaration's page text and PDF with the recording cover sheet and the signature and notary pages removed, reviewed by a person for names. | Under `samples/declaration/`; the review recorded in the samples README. |
| 8.11 | Commit the Residential Design Guidelines (after the same review) and their pipeline encoding, corrected by hand. | Under `samples/design-guidelines/`. |
| 8.12 | Commit a redacted copy of the sample fence application (homeowners' names, addresses, signatures and lot numbers replaced), reviewed by a person, and the packet variants built from it. | Under `samples/fence-application/`; the review recorded. |
| 8.13 | Garage enclosure items in `subject-identification`, `entity-facts`, `document-review` and `review-decision`, from the synthetic packet and its variants. | Datasets in Langfuse. |
| 8.9 | Move prompts from `development` to `preview` and `production` labels once each clears its bar. | Labels moved; recorded in evaluation.md. |

## Phase 9: Cutover and cleanup

Exit: no code or doc refers to the first build's rule model. Depends on phases 5 and 7.

| Id | Task | Done when |
| --- | --- | --- |
| 9.1 | Done: `src/rules/catalog.ts`, `src/rules/ruleKey.ts`, the first build's `Rule` schemas and repository functions, `fenceRulebook.ts` and their tests are deleted, and the first build's pipeline files were already gone; `src/rules/rule.ts` keeps only the rulebook record's schema, which moves with the `rulebooks` columns at 9.6. | knip clean. |
| 9.2 | Remove the retired prompts from the registry; archive them in Langfuse. | Registry lists only new prompts. |
| 9.3 | Update [README.md](README.md) (status banner, architecture diagram, decisions) and [platform.md](platform.md) (workflow step names, storage) for the built pipelines. | Links checked. |
| 9.4 | `Dashboard.tsx` and `ApplicationsPage`: project type labels from the organization's project types. | `ApplicationsPage` done; the dashboard is being redesigned separately. |
| 9.5 | Reset preview and demo data, run the build on the sample documents, publish, and run the sample review. | The demo shows the expected result. |
| 9.6 | Migration dropping `sections`, `rules` and the old `governing_documents` columns, once main no longer reads them. | Migration applied to preview after merge. |

## After the proof of concept

Deferred until the demo works end to end on the fence and garage enclosure:

| Item | What it is |
| --- | --- |
| More sample documents | Governing documents from other organizations (other states, condos, older scans, fine schedules), some held out from all tuning, to measure whether the schema, prompts and parser generalize beyond the sample Declaration |
| A general encoding prompt | Rewrite the encoding prompt's examples from several documents, so it doesn't teach through the sample Declaration's clauses |
| Amendments | Consolidate an amended document's current text from the original and its separately recorded amendments before structure |
| Large allowed-value lists | Above about 50 allowed values (paint palettes), ask the model for the stated value and match in code instead of listing them |
| State law | Load a state's HOA statute as documents so statutory overrides (solar, flags, EV chargers, fine caps) are exercised |

## Order and critical path

```text
0 spikes ─┬─> 1 schema ─┬─> 2 engine ───────────────────────────────────┐
          │             └─> 3 storage ─> 4 encoding ─> E1 ─> 5 rules UX ┴─> 6 review ─> E2 ─> 7 review UX ─> 9 cutover
          └────────────────────────────── 8 datasets (alongside 4 and 6) ───────────────────────────────────┘
```

The critical path is 1, 3, 4, 5.14 (a published rulebook), 6, 7. The engine (2) runs beside storage and encoding and
is needed before review. A fence review can be tested end to end before the rules UX is complete by publishing the
committed sample rulebook directly (3.11), which de-risks phase 6 early.
