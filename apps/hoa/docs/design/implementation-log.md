# Implementation log

The running record of building [implementation-plan.md](implementation-plan.md): where each phase stands, the
decisions made along the way, questions waiting for a person, and every evaluation round's scores.

## Goal

Implement the rules schema, the encoding pipeline and the application review for the proof of concept (fence and
garage enclosure), with both evaluation rounds clearing their bars, following the plan's phases. Questions don't block
the work: each is recorded below with the decision taken in the meantime.

Work happens on the `feat/rules-schema` branch, committed locally at each milestone and not pushed.

## Status

| Phase | Status |
| --- | --- |
| 0 Spikes and decisions | Partly done: decisions recorded; 0.1 and 0.2 run with phase 4; 0.3 moved to E1 |
| 1 Schema in the app | Done: `src/schema/` (types, Zod, drafts, core terms, validator, describe, statement links), 57 examples tested, the sample validates, guard test, `pnpm docs:schema` |
| 2 Engine | Done: `src/engine/` (exact numbers, vocabulary, values, calendar, paths, operands, conditions, derived properties, checks, deadlines, overrides, evaluate, decide), the fence fixture and the sample's expected result, the garage enclosure and its variants; 2.15 sanctions deferred to violations |
| 3 Storage | Done: additive migration 0001, provisions and rulebook content repositories, assemble and canonical hash, carry forward, `pnpm db:seed:sample`, `pnpm db:reset:rules` |
| 4 Encoding pipeline | In progress: pure modules done (`src/encoding`, `src/text`: structure, references, term candidates, plan, prompt variables, merge, consolidation, repair grouping); registry, model stages and Workflow next |
| E1 Evaluation round: encoding | Not started |
| 5 Rules UX | Not started |
| 6 Review pipeline | Not started |
| E2 Evaluation round: review | Not started |
| 7 Review UX | Not started |
| 8 Datasets and evaluation | Not started |
| 9 Cutover and cleanup | Not started |

## Decisions

| Date | Decision | Why |
| --- | --- | --- |
| 2026-10-09 | Migrations are additive: new `provisions`, `rulebook_rules`, `rulebook_terms`, `rulebook_questions` tables and nullable columns; old tables and columns are dropped at cutover (9.6). | Pull request previews share one D1 database, so a migration must not break another branch's preview. |
| 2026-10-09 | The text-analysis service (spaCy, LexNLP, RapidFuzz, dateparser, embeddings) is built after evaluation round 1's baseline, with only the extractors its failures call for. | YAGNI: measure first. Also waits on the LexNLP license question. |
| 2026-10-09 | Local commits per milestone on `feat/rules-schema`, never pushed. | A long unattended run needs recoverable checkpoints; nothing leaves the machine. |
| 2026-10-09 | The encoding conventions live in one Langfuse prompt, `hoa-rules-encoding-guide`, included by the encoding, repair and term prompts with `@@@langfusePrompt:name=hoa-rules-encoding-guide\|version=N@@@`, pinned by version. | One text to tune (DRY); pinning keeps every label reproducible. |
| 2026-10-09 | The `{{term-key}}` statement link syntax is described on the output schema's `statement` field, not in prompt text. | The prompt loader reads any double-brace word in prompt text as a variable and would reject the prompt. |
| 2026-10-09 | Build prompts created in Langfuse (development label, version 1): `hoa-rules-encoding-guide`, `hoa-provision-encoding`, `hoa-encoding-repair`, `hoa-term-extraction`, `hoa-rulebook-consolidation`, `hoa-structure-repair`. Variables: see encoding.md, Prompts and models. | Ready for phase 4. |
| 2026-10-09 | Scripts run with `pnpm exec tsx` (already installed): the app's source uses extensionless imports and `@/` paths that plain Node can't resolve. `scripts/ocr-fixture.ts` caches OCR page records for local documents in the git-ignored `.fixtures/ocr/` (Declaration: 80 pages; Design Guidelines: 56 pages). | Evaluation scripts run pipeline stages in process on real pages without committing documents that name individuals. |
| 2026-10-09 | `tsx` is a declared dev dependency of the app (it was only installed transitively). `pnpm ocr:fixture` runs the OCR script; the evaluation scripts will run the same way. | Scripts need to import app modules, which use extensionless imports. |
| 2026-10-09 | Single-record invariants run inside the Zod schemas (shared by drafts and stored records); `validateRulebook` checks only what needs other records. Validator issues are `{ code, message, recordKey, path }`; codes added where the schema had none: `duplicate-key`, `invalid-key`, `undefined-rule`, `invariant`, `coverage`. | One validator per concern (DRY); drafts and stored records can't drift. |
| 2026-10-09 | Not yet in `validateRulebook`: `override-not-allowed`, `table-overlap`, `conflict`, the `text-condition` and `absent-in-exception` counters, label issues and highlight bounds. Added when the build or editor needs them. | YAGNI. |
| 2026-10-09 | The sample's rules name the Design Guidelines (`guidelines`), so the sample now lists it as a referenced document; it validates with no issues. | The validator found the gap. |
| 2026-10-09 | Spike 0.1: `EncodingDraft`'s JSON Schema through the `respond` tool (`outputSchema`, inline, 61,691 characters) is accepted by `anthropic/claude-opus-5.5` and by `OPENROUTER_MODEL` (`anthropic/claude-haiku-5.5`); one provision took 11 to 15 seconds. No `$defs` or prompt-text fallback needed. | Measured with a throwaway script. |
| 2026-10-09 | The encoding stage keeps a draft that fails Zod and sends its issues to repair, instead of throwing: `runObjectPrompt` gains a mode that returns the answer with its Zod issues. | In the spike, Opus (without the guide) gave a requirement a bearer; a throw would make the Workflow retry blind, at full cost, rather than repair one field. |
| 2026-10-09 | Review prompts created in Langfuse (development label, version 1), adapted from the first build's tested wording: `hoa-page-classification`, `hoa-subject-identification`, `hoa-entity-facts`, `hoa-document-review`, `hoa-judgment-check`, `hoa-review-summary`. Variables as in application-review.md, Prompts and models. The writer's `{{rule:KEY}}` marker syntax is described on its output fields, like statement links. | Ready for phase 6. |
| 2026-10-09 | `governing_documents` gains `document_json` (the schema's view: issuer, what it governs, its edition), which assembling the rules file needs; `catalog_version` stays NOT NULL and new code writes 0 so other previews still read rows. | Additive migrations. |
| 2026-10-09 | `pnpm db:seed:sample` publishes the sample to local R2 by default; `--dev-bucket` writes to the `hoa-dev` bucket that `pnpm dev` actually reads. Neither reaches preview or demo. | The dev server binds the real dev bucket, not local R2. |
| 2026-10-09 | New encoding modules live in `src/encoding/` and text helpers in `src/text/`, not `src/pipeline/structure/` as the plan says; the guard test covers both. | The first build's `src/pipeline/structure.ts` would clash, and a separate folder deletes cleanly at cutover. |
| 2026-10-09 | The engine's API is `evaluate({ rulesFile, request, answers, evaluatedAt })`, giving the schema's `Finding[]`, and `decide(findings, rulesFile, requestType)`. `answers` carries what the review pipeline found: document reviews (statements per rule and subject), judgments, and text-condition answers. Beyond the plan's modules: `calendar` (business days, US federal holidays, local time, schedules), `context` and `applicability`. | Pure functions over a parsed rules file; the pipeline and the rules editor share them. |
| 2026-10-09 | Exact numbers are reduced bigint ratios, which hold decimals (a unit's `perBase`) and fractions alike; floats only where a value leaves the engine. | One type for both; 72 inches equal 6 feet. |
| 2026-10-09 | `thingOf`, `isKindOf`, `isParty` and `requestOf` moved into `src/schema/vocabulary.ts`, shared by `validateRulebook` and the engine. A document check may name a category of a document thing (a plot plan is a kind of Plans). | One vocabulary index (DRY); the fence fixture's plot plan satisfies Declaration 4.3(b)'s Plans. |
| 2026-10-09 | Engine readings the schema leaves open: a document check's party signs as every entity of that type for a request document, and one of them for a subject's document; a missing signature is unknown, like a missing document. Knowing an overriding rule applies "changes the outcome" only between outcomes that ask something (met, exempt and not-applicable count as one). An approval awaiting its body whose applicability is unknown is missing information. A requirement that isn't met (no remedy) follows the decision policy for `none`. A requirement doesn't displace the rules it overrides. | Each needed a reading to be deterministic; recorded so review can revisit them. |
| 2026-10-09 | The sample's `architectural-application.review-fee-paid-on` is unknown when unstated, not absent. | 4.2(d) lets the Reviewer require payment before review; payment is the Association's record, so a packet's silence doesn't show the fee unpaid. The expected results (fence: missing information unless the packet shows the fee paid; garage variant: request information) need it. |
| 2026-10-09 | The fence expected result as the engine gives it, where the spec's table can't hold: 5.3 no vinyl is `not-applicable` on composite runs (the schema's example of a prohibition of the subject itself); K style, post color, gate color, gate height and the return run's setback are `missing-information` while unstated (unknown is committee only for a judgment), so the committee's list is harmony alone; a stated non-K style goes to the committee through the case-by-case clause rather than being advisory. The recommendation is unchanged. | Don't bend engine semantics to a table; application-review.md updated to match. |
| 2026-10-09 | The fence fixture (`src/tests/fenceSchemaFixture.ts`) completes the examples: fence plus lattice applies only to runs with lattice (5.5.1(ii) speaks of the lattice component); the packet's documents are rules under 3.1.5 and 3.4.1 (photos a recommendation under 3.4.2); the portal supplies the submission date and the Reviewer's fee; the work is a new structure by the owner, and the two owners are entities who sign. | Each grounded in the guidelines' text; facts the packet doesn't hold come from the portal, as the schema's evaluation boundary says. |
| 2026-10-09 | Structure on the sample Declaration: 535 of 537 golden keys (99.6%), text similarity 0.9875 (`pnpm structure:compare`). The parser was tuned looking at the whole document, so its test split isn't held out; evaluation round 1 measures it again. | Clears E1's structure bars. |
| 2026-10-09 | Text matching is implemented in TypeScript (`src/text/match.ts`: Levenshtein ratio, partial and token-set ratios, RapidFuzz's WRatio semantics); fuzzy matches in running text need labels of 8 or more characters, and a changed word under 4 characters never matches. | No dependency until the text-analysis service; looser thresholds matched "wall" to "well" and "Class A" to "Class B". |
| 2026-10-09 | Duplicate rule keys get `-2`, not `~2` (the schema's key pattern rejects `~`); encoding.md updated. | Keys must validate. |
| 2026-10-09 | Structure rules: a paragraph after a list of clauses belongs to the list's parent, otherwise to the last item; counted paragraphs number from the provision's own text; an intro is a separate paragraph ending in a colon; wrap-ups only from text starting lowercase; pages up to the table of contents are dropped; headings Azure tags as page headers or numbers at a page top are restored. | Matches the golden encoding's conventions. |
| 2026-10-09 | Consolidation candidate pairs use statement similarity, not embeddings; every term a unit returns becomes an organization term (no `proposedCore` from units yet). | YAGNI until evaluation shows a need. |

## Questions

| Date | Question | Meanwhile |
| --- | --- | --- |
| 2026-10-09 | LexNLP is AGPL-3.0, with a commercial license available. Take the license, accept AGPL, or replace its extractors with our own? | Not used until E1.6; own grammars first. |
| 2026-10-09 | Numbering test matrix (plan item 3 in the generalization review): write a few common numbering styles as parser tests now, or defer with the other generalization work? | Deferred with the corpus work. |
| 2026-10-09 | When an interpretation question is answered, its rejected candidate rule leaves the rules file but the question still names it, so validation reports an undefined rule. Keep answered questions with only the kept rules, or keep rejected rules in the file marked rejected? | To decide in phase 5; leaning towards keeping the question with its answer and dropping rejected keys from its options. |
| 2026-10-09 | `tiny-invariant` is recommended by docs/typescript.md but isn't a dependency of the app, so the engine throws `Error` where it would use `invariant`. Add it to the app, or drop it from the conventions? | Throwing `Error`. |

## Evaluation rounds

No rounds run yet.
