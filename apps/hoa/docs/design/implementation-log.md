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
| 4 Encoding pipeline | Done except the deferred text-analysis tasks (4.7a, 4.7b, 4.14a) and a full Workflow build, which evaluation round 1 replaces with in-process runs |
| E1 Evaluation round: encoding | E1.3 scorers built (`src/evaluation/encoding/`, `pnpm eval:encoding:score`) and checked on the cached Article 4 and use-restrictions slice; E1.4 blocked: the OpenRouter balance ($12.63) doesn't cover a dev run (below) |
| 5 Rules UX | Done: `RuleReference`, `TermChip`, `Statement`, `RuleTable`, `RuleCard` with citations, issues, the rule form, check and condition editors, the JSON editor and the preview; the Vocabulary, Coverage, Questions and Settings tabs; publish blockers, the published tab's hash and download; review server functions. Browser-checked on the sample draft |
| 6 Review pipeline | Built except 6.10's dates service (a TypeScript grammar for now) and 6.15 (prompts already in Langfuse): `reviewApplication` (`src/review/run.ts`) runs stages 4 to 14, the `ApplicationReview` Workflow wraps it with resolve-prompts, load, OCR and save; the application page shows the new review until phase 7 |
| E2 Evaluation round: review | E2.1 to E2.3 done; E2.4 tuned through 23 rounds (below): the attic variant clears every bar, the other two variants every bar on two of three samples, the fence not facts, findings or action items; stopped at $4.86 of the $8 cap with what's left and what to try next recorded |
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
| 2026-10-09 | An upload's structure (document key, kind, the names its text uses for itself, exhibits that are documents of their own) is stored in a new nullable `governing_documents.structure_json` (migration 0002); `document_json` stays the schema's `GoverningDocument`, which the build writes at save-draft. Without a structure, the upload's kind gives one (`declaration`, `guidelines`, `by-laws`, `rules`). `pnpm db:structure:sample` sets the sample's (Exhibit C as `use-restrictions`) on local uploads; the rules UX sets it per upload in phase 5. The module is `src/documents/documentStructure.ts`. | `document_json` holds one document; an exhibit split is a second one plus the exhibit letter, which doesn't fit it. |
| 2026-10-09 | The kind defaults and the default settings live outside the guarded folders (`src/documents/`, `src/schema/defaultSettings.ts`): the guard test matches literals, and the document key `declaration` and kind `supplemental-declaration` are also organization term keys in the sample. | The guard stays strict. |
| 2026-10-09 | `runCheckedObjectPrompt` returns an answer that fails Zod with its issues (and caches it); `runObjectPrompt` still throws. Both share one implementation, and both take `codeFields`: fields hidden from the model's schema and filled in before Zod (a rule's `effectiveFrom`, from its main citation's document edition; a term's `organizationId`). | The model can't know either; asking for them invites wrong values and Zod failures. |
| 2026-10-09 | The build is one module with an injected step runner `step(name, schema, run, kind)`. The Workflow writes every step's output to R2 (`rulebookBuildKeys(...).step(name)`: `{stage}/{item}.json`, `{stage}/result.json`) and reads it back through the schema, on replay too; tests and the evaluation runner run steps in process through JSON. | Step outputs (plan, merge) pass Workflows' 1 MiB limit, and a schema checks what comes back. |
| 2026-10-09 | Repair: round 1 for problems a draft shows alone; then `verify:merged` merges the valid drafts and puts the merged set's problems back on units; round 2 for those and for drafts still failing Zod. A unit whose problems are all references to terms or rules other units define skips round 1 (`UnitProblem.reference`, `keysDefinedElsewhere`). A draft still failing Zod is left out and recorded as a job failure; other problems left become issues on their records. | encoding.md, Repair, with cross-unit rule references (overrides) treated like terms. |
| 2026-10-09 | The schema's `IssueCode` gains the validator's `duplicate-key`, `invalid-key`, `undefined-rule`, `invariant` and `coverage`, so every problem the build leaves can be stored on its record. | Issues on records could hold only the older codes. |
| 2026-10-09 | Structure repair applies the model's outline by starting a paragraph at each proposed marker and parsing again; the repaired structure is kept only when its check is better. Levels aren't used: the parser's grammar decides them. | The model never rewrites text, and a worse outline can't make things worse. |
| 2026-10-09 | Vocabulary calls only for documents with `definition` provisions (the Declaration; not the Design Guidelines, whose terms come from their units). | encoding.md, Vocabulary. |
| 2026-10-09 | Default settings where the documents say nothing: the usual precedence of document kinds, calendar days, `us-federal` holidays, `America/Los_Angeles` (organizations don't record a time zone yet), the decision policy and 0.8 thresholds of the sample. Publishing needs the settings reviewed, like every record. | A rules file needs whole settings. |
| 2026-10-09 | Build scores go on a `rulebook-build` span (one per build, `recordScores`, step `save-draft:scores`) under the job's session: units, valid after encode and after repair, repaired units, problems before and after repair, coverage, rules per kind, requirements, approvals, terms, text conditions, SCHEMA GAP notes. | Each model call is its own trace; the build needs one observation to hold its scores. |
| 2026-10-09 | Save draft keys each upload (`key`, `document_json`), writes exhibits and named documents as file-less rows with id `{hoaId}:{key}`, releases the keys (and provisions) other rows held, replaces the provisions, saves the records and makes the rulebook the draft, deleting the previous draft with its records. | One draft per organization; a rebuild replaces it. |
| 2026-10-09 | The first build's rule editor (`RuleTable`, `RuleCard`, `RuleSchema`, `CheckEditor`, `rulebookEditing`), its editing server functions, its build modules (`pipeline/structure`, `consolidate`, `carryForward`, `verify`) and its three build prompts are deleted. Until phase 5 the rules page shows the build card, counts, publish blockers and a plain rule list; nothing can be approved in the UI, so publishing from it waits for phase 5 (`db:seed:sample` still publishes the sample). | They read and wrote the old `rules` table the new build no longer fills. |
| 2026-10-09 | `pnpm eval:encoding` runs the build in process on `.fixtures/ocr/` with the real models, traced like the app (session id = run id), caching model results in `.fixtures/eval/encoding/cache/`, and writes `draft.json`, `issues.json`, `report.md` and every step's output to `.fixtures/eval/encoding/<run id>/`. `--split dev` is the Declaration's Articles 1 to 8 and the use restrictions, `test` Articles 9 to 21, by provision key; `--units` takes provision or document keys. | E1.2; scoring against the golden is E1.3. |
| 2026-10-09 | Build model steps time out after 15 minutes, not 5: the smoke run's encoding calls wrote 39,000 to 49,000 tokens and took 5 to 6.5 minutes each; repairs about 3. | Measured (below). |
| 2026-10-09 | Under a unit filter, every provision still resolves citations (the vocabulary cites Article 2's definitions), and coverage counts only the encoded units' provisions. | The first smoke run reported 65 citations of Article 2 as missing provisions. |
| 2026-10-09 | `seedRulebook.test.ts` runs the seed SQL in batches of 250 statements. | One batch of every statement reset the local runtime's connection when the new repository tests ran beside it. |
| 2026-10-09 | The review after OCR is one module, `reviewApplication` (`src/review/run.ts`), with the build's injected step runner and the models, cache and prompt versions as `ReviewAi`. The Workflow runs resolve-prompts, load and OCR, then it, then save-review; each step's output goes to R2 (`jobStepKey`). `pnpm eval:review` runs the same module in process. | The Workflow and evaluation can't drift. |
| 2026-10-09 | Applications store `projectKind` (a term key, or null for "Something else") in a new nullable `project_kind` column (migration 0003); `project_type` stays NOT NULL until 9.6 and new rows write its one old value, `fence`. The request type is the constant `architectural-application`; a file's `kind` is now a page classification type. Until 7.1, the picker lists the published rules file's categories of `work`. | Additive migrations; other previews still parse the column. |
| 2026-10-09 | The review record adds `conditionAnswers` (the text conditions' answers the engine read) to the spec's `Review`, and normalizations a kind `reading`. Recommendations `refer-to-committee` and `deny` replace `reject` in the D1 summary too. | A review must be reproducible from its record. |
| 2026-10-09 | Candidate types are things; a category the rules name is listed with its thing (entities are always typed by a thing; membership is decided in evaluation). Parties whose signature a document check needs (owners) are candidates too, so signers are entities. | Document checks count signatures per party entity. |
| 2026-10-09 | The facts answer has one branch per planned property, keyed by the property, with a reading of its type (a value key, a quantity with a unit of the same dimension, an entity id). Several answers for one entity's single-valued property merge when they agree and become `conflicting` when they don't. | The schema refuses an unplanned property; conflicts are code's call. |
| 2026-10-09 | A stated choice is matched to labels first (verbatim, normalized, fuzzy); when no label matches, the model's reading names the value (kind `reading`); with neither, an open set keeps the text and a complete one is uncertain. Quantities must parse with a unit of the property's dimension; a range is uncertain. | The sample's value labels are phrases packets never use ("enclosing a garage as living space"); the reading is the prompt's own output. |
| 2026-10-09 | Evidence is verified against what the models read for a page: its text, the text near its picture and its images' descriptions; a file may be cited by its id or its name. `matchQuote` (deleted with the first build's `verify.ts`) is back as `src/text/quote.ts`. | Image-only facts verify when the quote is the description's words; the first run cited files by name. |
| 2026-10-09 | Document review gets one requirement per document check and subject entity, and the pages classified as a required type or a generic kind (drawing, photo, other); signers come back as party entity ids. Each present result becomes a request document of the check's type. | The first garage run classified the floor plan as a drawing, and filtering on rulebook types alone hid it. |
| 2026-10-09 | Judgments are asked for every judgment finding a first evaluation (without judgments) leaves to the committee or waiting on information, with the facts its evidence terms name and the pages those facts cite, of its evidence document types, or generic drawings and photos. | Only calls that can change a finding; missing information on an override may still resolve. |
| 2026-10-09 | The writer's action items have ids `change-N`, `provide-N`, `committee-N`, `suggestion-N` and code's wording until phrased; a rule marker outside the findings fails the step. The application page shows markers as rule titles until 7.3. | application-review.md, Write. |
| 2026-10-09 | `getApplicationView` reads the review's own rules file (`rulebookKeys(...).file`, checked against the review's `rulesFileSha256`) for the selected rules and their provisions (`reviewRules`); an unreadable file is logged and the page shows the review without rule titles. | Locally the published rulebook's file isn't in the dev bucket unless seeded with `--dev-bucket`. |
| 2026-10-09 | Generic page kinds live in `src/documents/applicationDocumentKinds.ts`; `mergeWordPages` moved to `src/ocr/buildPages.ts` and the visual description schema to `src/ocr/visualDescription.ts`. The first build's review modules (`src/pipeline/`) and prompts' registry entries are deleted. | `photo` is a sample term key (the guard test); scripts can't import Workflow modules. |
| 2026-10-09 | Evaluation round 2 reviews every case against one rules file: the committed sample merged with the fence fixture's rules (`mergeRulesFiles`; records the sample has keep the sample's version, the Design Guidelines document comes from the fixture). The synthetic garage packets therefore also carry the guidelines' packet items (signed checklist, site plan, photo, product sheet) and say who does the work. The fence case's expected data is `.fixtures/eval/review/fence-application/case.json`, its packet `.fixtures/ocr/fence-application/` (`pnpm ocr:fixture --packet`). Scores go on an `application-review` span per case (`recordScores`); a Langfuse dataset waits for phase 8. | The guidelines' encoding isn't committed yet (8.11). |
| 2026-10-09 | E1.3's scorers live in `src/evaluation/encoding/` (guarded against organization term keys like the other folders); the split selectors live in `scripts/encodingSplits.ts`, since the use restrictions' document key is also a sample term key. `pnpm eval:encoding` now also writes `run.json` (units, calls, prompt versions) and calls its own summary `build.md`; `pnpm eval:encoding:score <run>` writes `report.md` (the bar table, then every miss by key) and `scores.json`. A `--units` run is scored only on its units. | One canonical split for the runner, the scorer and `structure:compare`. |
| 2026-10-09 | The judge (`hoa-eval-encoding-judge` v1, development, `anthropic/claude-opus-5.5`; registered as `pipelinePrompts.encodingJudge`) runs once per provision that is the main citation of a rule on either side, through `runObjectPrompt` with the file cache and trace name `encoding-judge`. Recall: golden rules it pairs. Precision: pipeline rules it finds faithful, leaving out any it skipped (listed in the report). Pairwise: judged provisions not worse. | Grouping by main citation keeps one call per provision; rule keys start with it on both sides. |
| 2026-10-09 | Term alignment: the same key and kind, else the best label match (`matchLabel`) of the same kind whose parent (a property's thing, a value's set) is the golden parent's match, one to one; core keys align with themselves. Term recall counts golden terms cited by the split's provisions or used by its golden rules, core keys left out. | "Matched by key or label", per the plan. |
| 2026-10-09 | Check agreement generates facts from what both rules read (boundary values around compared constants, listed and other set values, absent, unstated; approvals, documents, judgments and text conditions), at most 48 sampled combinations plus each probe unstated and all unstated, seeded per pair; evaluates each rule alone (overrides cleared) with the engine; and compares outcomes by what they ask (met, exempt, not applicable and no finding are one class). Only pairs whose reads all translate into the other vocabulary are scored; the others are listed. | Facts on a property the other rule's vocabulary lacks are invisible to it, so those cases would measure vocabulary (term recall's job), not checks. |
| 2026-10-09 | The scores go to the Langfuse dataset `encoding-evaluation` (items `encoding-dev`, `encoding-test`) through the SDK's experiment runner: one dataset run per evaluation run, named by its run id, with a score per measure. | The dataset-run-items endpoint is deprecated and goes away on November 16, 2026. |
| 2026-10-09 | Answered questions (the open question below): the question stays with its options and answer as the record of why, in D1 and in the rules file; the file drops from `about.rules` and each option's `keeps` the rules it doesn't hold (`questionsIn`, used by `assemble` and by the draft's validation). Answering approves the chosen reading's rules where nothing else blocks them, rejects the other candidates, and resolves a conflict's open issues on the rules it's about. A candidate of an unanswered question can't be approved on its own. | Option labels and the chosen index keep their meaning, the file validates, and the dropped reading stays visible in the draft. |
| 2026-10-09 | Rules UX review rules live in `src/rulebook/review.ts`, shared by the screens and the server functions (`rulebookReview.functions.ts`): approval is blocked by open blocking issues, blocking problems `validateRulebook` finds on the draft as reviewed (every record not rejected), terms the rule reads that are still proposed, and open questions; a bulk approval skips what's blocked and says why. Edits are saved even with problems (they block approval), keep the key, go back to proposed and become the administrator's (`provenance: person`). | What a screen offers is what the server allows; an administrator can save an edit in steps. |
| 2026-10-09 | Publishing also waits for every no-rule reason to be approved, and, once everything is reviewed, for the approved records to make a valid rules file. Coverage is computed from the records whenever it's shown or checked (`coverageOf`); the build's stored coverage report stays the build's. A reason an administrator gives is approved as given. | schema.md: a reason counts once an administrator approved it; edits and rejections change coverage after the build. |
| 2026-10-09 | `RuleReference` (5.0) takes a resolved `ReferencedRule { key, title, citations: CitedProvision[] }`, each citation with its label, document title, heading, ancestors' intros and wrap-ups, text, highlight and anchors, so the review UX can build it from its `ReviewRule`. Its label shows the provision on hover and focus (shadcn `hover-card`) and opens it in a dialog with `DocumentViewer` at the first anchor's page, the anchors highlighted; a provision without anchors, or whose file has no pages, shows its stored text. A plat region isn't drawn: the viewer shows page text. `getDocumentPage` is back for it. | One component for every rule reference (encoding.md, UX). |
| 2026-10-09 | Term chips render `describeRule`/`describeCondition` with term links: the describers take `{ linkTerms: true }` and write `{{key}}` for every term but units, which `Statement` renders as chips. Term pickers are shadcn's `combobox` (added with `input-group`); its clear control isn't exported, so the picker has its own labelled clear button, and Enter in a picker never submits a form. | One rendering path for statements and descriptions. |
| 2026-10-09 | No-rule reasons live on the organization's provisions, which the draft and the published rulebook share, so a reason changed in the draft also shows in the published view; the published rules file in R2 doesn't change. | Provisions are stored per organization (encoding.md, Storage). |
| 2026-10-09 | Local review data for phase 5 (not committed): a scratchpad script wrote the sample rules file as the draft `sample-draft` (every record proposed, as a build leaves it), gave the Declaration's provisions the anchors the structure stage produced on `.fixtures/ocr/declaration` (eval run `2026-10-09T16-29-44-dev`, 541 provisions) pointing to an upload row `sample-declaration-upload`, and put that fixture's 80 page records in the `hoa-dev` bucket. | The committed sample has no anchors, and citations need pages to show. |
| 2026-10-09 | Answering the towing question rejects `declaration:7.4(a)/p2(i)#towing-emergency-only`, which the sanction preconditions' `except` names; validation reports it on the settings, and the administrator edits the clause. Answers don't rewrite settings. | Found reviewing the sample in the browser; the settings are reviewed like any record. |
| 2026-10-09 | `StepRunner`, `StepKind`, `modelCall` and a shared `modelCallOf` live in `src/jobs/steps.ts`, used by the rulebook build, the review and their runners. The guard test no longer lists the deleted `src/pipeline` files or folder. | The review imported them from the encoding modules, and both built model calls the same way. |
| 2026-10-09 | Subject identification also gives each entity's references (`refersTo`) and kinds (`kinds`), each with a confidence. A reference, and a kind whose criteria fix one of the entity's own properties, become readings of those properties; one at or above the fact threshold stands for its entity and property, one below it is weighed with the facts stage's. Candidate types list every category of their thing as kinds. | application-review.md, Subjects: what an entity is and how it relates are part of naming it; the facts call couldn't place the gate or the return run on its own. |
| 2026-10-09 | The facts stage: a call lists the entities its reference properties can point to (`onlyToReferTo`); a value every entity of a type shares may be answered once for `all`; a second, focused reading (`facts:{group}:second`) reads again what was read below the fact threshold, and any entity skipped while others of its type were answered, reconciled with the first (agreeing readings keep the more confident; a skipped entity's second reading is its only one). | Evaluation round 2, rounds 8, 12, 17 and 20. |
| 2026-10-09 | Normalization: a party is read from the model's role first, and a role no party term names stands as `{ term: null }`; an `absent` answer needs evidence found where it says, or it's dropped. A category with no definition is described to the models by its text criteria. A document statement may be `not-applicable` (a qualified statement the project has nothing for), which holds like a confirmed one. | Evaluation round 2, rounds 3, 4, 6 and 21. |
| 2026-10-09 | `hoa-document-review` runs on `anthropic/claude-sonnet-5.5` (`config.model`), about $0.02 per garage packet and $0.055 per fence packet; subjects and facts stay on Haiku, since Sonnet and Opus gained nothing there at 10 to 15 times the cost. | Evaluation round 2, rounds 2, 7, 9, 10 and 14. |
| 2026-10-09 | The writer's faithfulness and clarity are judged by `hoa-eval-review-judge` (registered as `pipelinePrompts.reviewJudge`, Sonnet by `config.model`), one call per review in `pnpm eval:review`, cached like the review's calls; the score is the share of the assessment, feedback and action items judged both faithful and clear, and the report lists the faulted parts without the judge's reasons, which may quote the packet. `pnpm eval:review --sample N` measures the same configuration on fresh model answers. | The round's eighth bar had no measure; single runs swing by 0.05 on the fence, so decisions need samples. |

## Smoke run (phase 4)

2026-10-09, `pnpm eval:encoding --split dev --documents declaration --units declaration:article-4,use-restrictions`
(Declaration Article 4, one unit of 40 provisions, and the use restrictions, one unit of 26), prompts version 1
(development), `anthropic/claude-opus-5.5` for every call:

| Measure | Result |
| --- | --- |
| Vocabulary | 66 terms from the Declaration's 39 definitions; 47,000 tokens in, 14,600 out, 114 s, $0.48 |
| Units Zod-valid after encode | 0 of 2: Article 4 had 34 Zod problems (15 sanctions without `appliesTo`, 15 rules with a null `appliesTo` and no selector, 4 judgment checks without `decidedBy`), the use restrictions 7 of the same kinds |
| Repair | Article 4 valid after round 1 with no problems left; the use restrictions valid after round 2 |
| Rules | 86: 69 norms (7 requirements, 15 approval checks), 1 discretion, 16 sanctions; 204 terms; 13 text conditions; 6 SCHEMA GAP notes |
| Left for review | 3 issues: a provision cited and also given a no-rule reason, a term (`reviewer`) defined twice, and an override consolidation proposed on a rule whose overrides are a selector |
| Coverage | 66 of 66 provisions |
| Cost and time | 8 model calls, $6.21, 436,000 tokens in and 223,000 out, 16 minutes (calls in sequence after the vocabulary: 2 encodes in parallel, then repairs) |

The rerun after the citation-scope fix reused every cached call ($0, 1 s) and gave the numbers above. Encoding cost is
dominated by output: about $1 per unit and as much again per repair round, so the encoding guide's handling of
sanctions' `appliesTo` and judgments' `decidedBy` is the first thing evaluation round 1 should tune.
| 2026-10-09 | Evaluation round 1 is capped at $250 of model spend or 8 dev rounds, whichever comes first; the log then records where it stands. | A full Declaration encode costs about $1 per unit plus repairs; iteration needs a ceiling while nobody is watching. |
| 2026-10-09 | Evaluation round 1, the rules UX and the review pipeline run in parallel, each in its own folders, with focused checks; the full `pnpm verify` and commits happen between them. | Independent work; one verify gate. |
| 2026-10-09 | Staged, not yet measured: `hoa-rules-encoding-guide` version 2 and versions 2 of `hoa-provision-encoding`, `hoa-encoding-repair` and `hoa-term-extraction` that include it (no `development` label). It targets the slice's failure categories: `appliesTo` on every rule but selectors and on sanctions, `decidedBy` with every judgment check, reserved powers and carved-out exceptions as permissions with overrides, conditions and caps in the structure rather than the statement, consequences ("deemed withdrawn", fee before review) as requirements, permissions within a limit as permission plus obligation, listed kinds as value sets. | Round 1's first tuning change once the baseline (version 1) is measured; it moves to `development` only if it scores better. |

## Questions

| Date | Question | Meanwhile |
| --- | --- | --- |
| 2026-10-09 | **Blocking evaluation runs:** the OpenRouter account has about $12.60 of credit. Evaluation round 1's baseline needs about $50 (dev and test splits on Opus 5.5) and its tuning rounds about $25 each; round 2 is cheaper (Haiku). Please top up the balance (a person must; it's a payment). | Code, tests and UX keep going; model runs are limited to what the balance covers, and round 1's baseline and tuning wait. |
| 2026-10-09 | LexNLP is AGPL-3.0, with a commercial license available. Take the license, accept AGPL, or replace its extractors with our own? | Not used until E1.6; own grammars first. |
| 2026-10-09 | Numbering test matrix (plan item 3 in the generalization review): write a few common numbering styles as parser tests now, or defer with the other generalization work? | Deferred with the corpus work. |
| 2026-10-09 | `tiny-invariant` is recommended by docs/typescript.md but isn't a dependency of the app, so the engine throws `Error` where it would use `invariant`. Add it to the app, or drop it from the conventions? | Throwing `Error`. |
| 2026-10-09 | The portal has nowhere to keep an organization's review fee, so Declaration 4.2(d) comes out `not-applicable` on the fence packet (which states no fee) where the expected result says missing information, and a packet's own wording of the fee ("to be paid when the application is reviewed") is read against a property meant for the Reviewer's requirement. Where should the fee live (organization settings, a portal-supplied request fact)? | The fence case keeps its expected missing information and counts the miss; the fixture supplies the fee as the portal would. |
| 2026-10-09 | `garage-replacement-plans`: is building the replacement garage a second item of Work (the term's scope note says one item per change), so the case should expect two? Identification names it so on one sample in three. | The case expects one item of Work and an exterior item for the replacement garage. |

## Evaluation rounds

### Round 1 (encoding): status

Stopped before the baseline (E1.4). The OpenRouter account had $14.08 of credit when the round started and $12.63 now;
a dev run plans 10 units (Articles 1 to 8, with Article 7 in two, and the use restrictions), 8 of them not cached,
which at the smoke run's rate (about $1 per encode and $1 per repair round, every unit repaired) costs about $20, plus
about $1 for consolidation and $3 to $5 for judging. A test run (13 units) costs about the same. Nothing was started
that the balance couldn't finish. To continue: top up the balance, then `pnpm eval:encoding --split dev`,
`pnpm eval:encoding --split test` and `pnpm eval:encoding:score <run>` for each.

Spend this round: $1.46 (judging $1.42, one consolidation call $0.04).

### Scorer check on the cached slice (not the baseline)

2026-10-09, run `2026-10-09T16-49-15-dev`: the smoke run's slice (Declaration Article 4 and the use restrictions, 2 of
the dev split's 10 units), prompts version 1, every encoding call cached; scored against the golden rules whose main
citation is in those units.

| Measure | Value | Bar |
| --- | --- | --- |
| Provision keys | 1.000 | at least 0.98 |
| Provision text similarity | 0.966 | at least 0.97 |
| Coverage | 1.000 | 1 |
| No-rule reasons agreeing | 0.800 | at least 0.85 |
| Rule recall | 0.882 (60 of 68) | at least 0.90 |
| Rule precision | 0.930 (80 of 86) | at least 0.90 |
| Modality agreement | 0.917 | at least 0.95 |
| Check agreement | 0.941 (15 of 41 pairs comparable) | at least 0.85 |
| Term recall | 0.473 (61 of 129) | at least 0.85 |
| Pairwise better or equal | 0.814 (35 of 43 provisions) | at least 0.80 |
| Units valid after repair | 1.000 | 1 |
| Units needing repair | 1.000 (2 of 2) | at most 0.15 |

Failure categories (keys only; the reasons are in the run's `report.md`):

| Category | Count | Keys |
| --- | --- | --- |
| Powers and permissions not encoded (Declarant or Association rights, permitted antennas) | 5 | `declaration:4.3(a)/p2#declarant-amends`, `declaration:4.3(a)/p2#board-consent`, `use-restrictions:a(x)(1)#permitted-antenna`, `use-restrictions:a(x)(2)#permitted-antenna`, `use-restrictions:a(x)/p2#master-antenna` |
| Other missing rules | 3 | `declaration:4.7#certificate-30-days`, `declaration:4.8/p4#declarant-enforcement`, `use-restrictions:b(iii)#declarant-designee` |
| A condition or cap only in the statement, not the structure | 3 | `declaration:4.1/p2#interior-without-approval`, `declaration:4.8/p1#interest-association`, `declaration:4.8/p1#interest-declarant` |
| Other unfaithful rules (a qualifier's scope, a consequence as an owner duty, an override dropping an approver) | 3 | `declaration:4.3(b)#plans-required`, `declaration:4.3(b)/p7#commence-within-year`, `use-restrictions:a(vii)#garage-enclosure-reviewer` |
| Requirement encoded as an obligation | 2 | `declaration:4.2(d)#fee-before-review`, `declaration:4.3(b)/p7#approval-lapses` |
| The permission encoded, its limit not | 3 | `use-restrictions:a(v)#reasonable-number`, `use-restrictions:a(xii)#neatly-maintained`, `use-restrictions:a(xii)#neatly-maintained-and-approved` |
| Checks deciding differently | 4 | `declaration:4.1/p1#approval-required`, `declaration:4.3(b)/p7#approval-lapses`, `use-restrictions:a(vii)#reviewer-garage-enclosure`, `use-restrictions:a(vii)#no-conversion` |
| Vocabulary: golden terms with no pipeline term (value sets such as vehicle classes and exterior item types; properties split or named differently) | 68 | listed in the report; 26 paired rules not comparable for the same reason |
| No-rule reasons | 3 | `declaration:4.1/p3`, `declaration:4.2(b)/p2`, `declaration:4.6/p1` |
| Repair | 2 | both units, all first-pass Zod failures (the smoke run: `appliesTo` and `decidedBy`) |
| Structure | 2 | `use-restrictions:a(x)` and `use-restrictions:a(x)(3)` texts swapped by the parser; the dev split as a whole scores 0.9895 (`pnpm structure:compare`) |

The judge doubted one golden rule, `use-restrictions:b(iii)#declarant-designee` ("the text never requires" the
Declarant's approval). Reviewed against the provision: the text gives the right to the Declarant "and its designees",
and being designated reads as the Declarant's approval, so the golden stays as it is.

What I'd try first, one change per round, once dev has a baseline: (1) the guide's `appliesTo` and `decidedBy`
instructions, to bring repairs under 15%; (2) the guide on powers and permissions granted to the Declarant and the
Association, conditions and caps in the structure rather than the statement, and requirement versus obligation for
consequences ("deemed withdrawn"); (3) context assembly: the vocabulary slice's value sets and their values for every
property it includes, for term recall; (4) a critic pass over each unit's draft before verify if prompts plateau.

### Round 2 (review): baseline

2026-10-09, `pnpm eval:review`, run `2026-10-09T17-24-17`, prompts version 1 (development), `anthropic/claude-haiku-5.5`
for every call (no prompt names a model). Rules file: the sample merged with the fence fixture's rules (decision above).
Bars from implementation-plan.md, Evaluation round 2. Every call in this run came from the cache the runs before it
filled with the same code.

| Case | Entities | Facts | Documents | Normalization | Evidence | Findings | Recommendation | Action items |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| bar | 1.00 | 0.90 | 0.90 | 0.98 | 0.95 | 0.95 | 1.00 | 0.95 |
| fence-application | 0.75 | 0.60 | 0.88 | 0.81 | 0.73 | 0.39 | 1.00 | 0.41 |
| garage-baseline | 0.75 | 0.80 | 0.75 | 1.00 | 1.00 | 0.87 | 1.00 | 0.67 |
| garage-replacement-plans | 0.75 | 0.80 | 0.88 | 1.00 | 1.00 | 0.87 | 0.00 | 0.50 |
| garage-attic | 0.50 | 0.60 | 1.00 | 1.00 | 0.92 | 0.87 | 0.00 | 0.57 |
| garage-fee-not-paid | 0.75 | 0.80 | 0.86 | 1.00 | 1.00 | 0.87 | 1.00 | 0.75 |

Cost: a whole uncached pass over the five cases is about $0.05 (fence $0.027 for 22 calls, each garage case about
$0.009 for 13 to 15 calls); round 2's spend so far, the fence packet's image descriptions and four runs included, is
about $0.11. The earlier runs found code issues fixed before this one: files cited by name, the model's reading for
phrase labels, generic drawings hidden from the document review, judgments skipped when an override's applicability
was unknown, and the writer marking a rule a finding's reason names (now allowed, and checked inside the answer's schema
so a refused answer is retried rather than cached).

Failure categories (E2.3):

- **Entities:** the fence packet gives three runs, not four (the return run holding the gate is missed); the garage
  packets add an `exterior-item` (the new wall), and the attic case a second space.
- **Fence facts:** run locations swapped between side and rear; material read as uncertain at confidence 0.4; board
  orientation from the photo uncertain at 0.5; evidence cited on the Word file's page 4 instead of its fourth picture
  (a file of its own), so a quarter of the quotes don't verify. Nearly every fence finding is missing information.
- **Documents:** the plot plan and the Declaration's plans aren't recognized (drawings classified `drawing`, and the
  nine "as applicable" statements of 4.3(b) not all confirmed), so 4.3(b) and the guidelines' plot plan are missing
  information in every garage case; with the replacement plans present, that keeps the recommendation at request
  information instead of the committee.
- **Confidence:** the model rates facts it reads plainly below the 0.8 fact threshold (the garage's review fee at 0.6,
  the attic's work kind), so they're held uncertain; in the attic case Declaration 4.1 then isn't exempt.
- **Not a model failure:** 4.2(d) is `not-applicable` on the fence packet because nothing supplies the Reviewer's fee
  (the fixture had the portal supply it), where the expected result says missing information. The portal needs a place
  for the organization's review fee.

### Round 2 (review): tuning (E2.4)

One change per round, tuned on `fence-application` and `garage-baseline`; the three garage variants are held out and
only measured. Every round runs all five cases (`pnpm eval:review`, model results cached), so a variant's score can move
with a change to a stage its packet shares. Scores per case are entities / facts / normalization / evidence / findings /
recommendation / action items. The OpenRouter balance was $12.51 when tuning started; the cap was $8 of spend.

| # | Run | Change | fence | garage-baseline | Variants (attic; fee not paid; replacement plans) | Kept | Run cost |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | `17-30-08` | Scorer: expected entities align to the review's by label, ids only breaking ties (the model's `run-1` was the rear run, so the baseline's "swapped side and rear" was the scorer's) | .75 .60 1.00 .73 .39 1 .41 | .75 .80 1.00 1.00 .87 1 .67 | unchanged | yes | $0 |
| 1 | `17-30-46` | `hoa-subject-identification` v3: follow a marked route stretch by stretch; parts, materials and products of a named thing aren't entities (v2 was never run: it had a line drawn from a held-out case) | .75 .56 .94 .78 .40 1 .41 | 1.00 .80 1.00 1.00 .87 1 .67 | .67 .40 .75 1.00 .60 0 .25; 1.00 .80 1.00 1.00 .87 1 .75; .75 1.00 1.00 .42 .93 0 .67 | yes | $0.057 |
| 2 | `17-36-18` | Subjects on `anthropic/claude-sonnet-5.5` (v4) | still three runs; .75 .49 1.00 1.00 .39 1 .41 | 1.00 .80 1.00 1.00 .93 1 .80 | no gain on entities | no: back to v3 | $0.139 |
| 3 | `17-41-10` | Code: a category's text criteria are its definition for classification, subjects and document review (`definitionOf`): a plot plan is "a drawing of the Unit showing its boundaries and where the proposed Work goes" | .75 .56 .94 .78 .40 1 .41 | 1.00 .80 1.00 1.00 .93 1 .80 | the plot plan found in every garage case | yes | $0.042 |
| 4 | `17-45-38` | Code and `hoa-document-review` v2: a statement the requirement qualifies (as applicable, if any) that the project has nothing for is `not-applicable`, which holds like a confirmed one | .75 .56 .94 .78 .39 1 .41 | unchanged (Haiku still finds no structural design) | unchanged | yes (semantics) | $0.023 |
| 5 | `17-49-02` | `hoa-entity-facts` v2: confidence by how the packet gives a value; one stated value holds for every thing it describes; a product that's only made one way settles the material; a photo named as the proposed work shows it; cite a Word file's picture by its own marker | .75 .76 1.00 1.00 .67 1 .65 | 1.00 1.00 1.00 1.00 .93 1 .80 | facts unchanged | yes | $0.030 |
| 6 | `17-52-20` | Code: a party is read from the model's role (its reading) rather than the stated sentence, and a role no party term names stands as written (`term: null`), so "a contractor" is known and isn't the Declarant | .75 .76 1.00 1.00 .69 1 .68 | unchanged | unchanged | yes | $0.003 |
| 7 | `17-52-54` | Document review on `anthropic/claude-sonnet-5.5` (v3) | .75 .76 1.00 1.00 .70 1 .69 | 1.00 1.00 1.00 1.00 1.00 1 1.00 | replacement plans 1.00 except entities; fee not paid findings 1.00 | yes | $0.170 |
| 8 | `17-55-52`, `17-56-39` | Code and `hoa-entity-facts` v3: a facts call also lists the entities its reference properties can point to (`onlyToReferTo`), so a gate's run can be named | unchanged (Haiku still leaves the gate's run out) | unchanged | unchanged | yes (presentation) | $0.035 |
| 9 | `17-58-32` | Facts on `anthropic/claude-sonnet-5.5` (v4) | .75 .78 1.00 .96 .69 1 .75 | unchanged | unchanged | no: $0.19 more per fence review for no finding gained | $0.433 |
| 10 | `18-00-17` | Subjects on `anthropic/claude-opus-5.5` (v5), fence only | still three runs | | | no | $0.292 |
| 11 | `18-03-02` | `hoa-subject-identification` v6: a gate that closes the gap between a lot line and the house stands on a stretch of its own (a return); name it and put the gate on it | 1.00 .78 1.00 .97 .85 1 .76 | unchanged | | yes | $0.110 |
| 12 | `18-06-09` | Agentic: a second, focused reading of every fact read below the fact threshold (`facts:{group}:second`), reconciled with the first (agreeing readings keep the more confident; disagreeing ones leave the first as it was) | unchanged (the second reading is as unsure) | unchanged | fee not paid 1.00 throughout | yes, provisionally: about $0.006 per review | $0.098 |
| 13 | `18-08-53` | `hoa-entity-facts` v5: a photo offered as a copy or example of the new work reads as the work itself | 1.00 .85 1.00 .97 .88 1 .84 | unchanged | unchanged | yes | $0.041 |
| 14 | `18-11-45` | Facts on `anthropic/claude-sonnet-5.5` again (v6) | 1.00 .87 .96 1.00 .88 1 .85 | unchanged | attic facts 1.00, fee not paid .80 | no: $0.30 per fence review against $0.02 | $0.535 |
| 15 | `18-15-35` | `hoa-entity-facts` v7: what a stretch along a lot line borders is what the plan shows across it (another lot when nothing else is shown); a stretch that follows no lot line borders nothing | 1.00 .93 1.00 .98 .91 1 .88 | 1.00 1.00 1.00 1.00 1.00 1 1.00 | unchanged | yes | $0.041 |
| 16 | `18-19-41` | Code and `hoa-subject-identification` v7: identification gives each entity's references (`refersTo`, with a confidence), which become readings of those properties (the gate's run) | 1.00 .82 1.00 .97 .82 1 .75 (the facts call left the return run out entirely) | findings .93 | fee not paid: deny (a statement read as contradicted) | yes | $0.205 |
| (scorer) | `18-24-45` | Scorer: an expected reference value (`gate.fence-run`) is compared through the entity alignment | | | | measurement | $0.022 |
| 17 | `18-26-57` | Code: the second reading also asks again for an entity skipped while others of its type were answered, and that reading is its only one | 1.00 .91 .96 .95 .94 1 .91 | unchanged | unchanged | yes | $0 (cached) |
| 18 | `18-27-31` | `hoa-document-review` v4: contradicted only by the opposite (a document about something else leaves a statement not found); a qualified statement holds at the level the project needs; photos and product sheets of the work count among plans | 1.00 .91 .96 .95 .94 1 .91 | 1.00 throughout | fee not paid findings back to 1.00 | yes | $0.160 |
| (cases) | `18-29-47`, `18-31-03` | Held-out case fixes (below): the attic packet's copied site plan and product sheet, the replacement-plans case's replacement garage | | | attic 1.00 throughout; replacement plans 1.00 throughout | expected data | $0.071 |
| 19 | `18-33-27` | Code and `hoa-subject-identification` v8: every category of a candidate type is listed as one of its kinds, and identification names the kinds an entity is (`kinds`); a kind whose criteria fix one property is a reading of it (a return fence's location). An identification reading at or above the fact threshold stands for its entity and property | 1.00 .84 1.00 .93 .81 1 .74 | unchanged | replacement plans names a second item of work | yes (structure; see the samples below) | $0.209 |
| 20 | `18-39-32` | Code and `hoa-entity-facts` v8: a value every entity of a type shares is answered once, for `all`, and code gives it to each entity without its own answer | 1.00 .89 .96 .73 .91 1 .87 | unchanged | unchanged | yes | $0.041 |
| 21 | `18-45-29` | Code: an `absent` answer stands only on evidence found where it says (the facts call had begun answering absent, with no quote, every application property it had no evidence for) | 1.00 .87 .96 .97 .89 1 .85 | unchanged | unchanged | yes | $0.004 |
| (samples) | `18-46-23-sample-1`, `18-51-13-sample-2`; `18-56-30-sample-3`, `18-59-32-sample-4` on the v7 prompts | Measurement: `pnpm eval:review --sample N` runs the same configuration on fresh model answers (cached per sample). Fence findings .89, .87, .91 on v8 against .89, .88 on v7: no difference beyond noise, so v8 stays (fewer tokens, one shared answer per value) | | | | measurement | $0.650 |
| (judge) | `19-04-44`, `19-08-26` and their samples | The writer's judge, the round's eighth measure (`hoa-eval-review-judge` v1 on Sonnet, one call per review); v2 tells it the page lists the action items under the feedback and that the portal's own next steps aren't additions | writer .95, 1.00 | .75 to 1.00 | .33 to 1.00 | measurement | $0.64 (judging) |
| 22 | `19-10-43` and samples | `hoa-review-summary` v2: never sum up the rest as met while a finding is open; say which thing lacks which detail | writer 1.00 | .75 to 1.00 | attic .75; replacement plans .33 to 1.00 | no gain: superseded by v3 | $0.35 |
| 23 | `19-16-13` and samples | `hoa-review-summary` v3: the feedback speaks only to what the homeowner does (the Reviewer's and the Board's own duties stay out of it); each finding in its own terms ("or" stays "or") | writer 1.00 on three samples | 1.00 on three samples | 1.00 on three samples | yes | $0.34 |

Costs per review on the final configuration: fence about $0.09 uncached (document review on Sonnet $0.055 of it, the
second reading about $0.006), a garage packet about $0.03; the writer's judge adds about $0.02 per review to an
evaluation run.

**Expected data and case fixes.** Each was wrong against its own packet or the rules, not against a model's answer:

- `garage-attic` (held out): the packet's site plan was copied from the garage case and still said "attached garage (to
  be converted)" (text and image description), and its product sheet was the garage's window and lap siding, while the
  description says nothing outside changes and the garage stays a garage. The site plan now shows the garage as it is,
  and the product sheet lists the attic's insulation, drywall and flooring.
- `garage-replacement-plans` (held out): the application proposes building a detached replacement garage, which is
  "anything constructed ... on the outside portions of a Unit" (`exterior-item`); the expected entities now include it.
- The scorer, not the data: expected entities align to the review's by label with ids only breaking ties, and an
  expected reference value is compared through that alignment (round 0 and the row after round 16).

### Round 2 (review): where it stands

Final configuration (development label): `hoa-page-classification` v1, `hoa-subject-identification` v8,
`hoa-entity-facts` v8, `hoa-document-review` v4 (Sonnet), `hoa-judgment-check` v1, `hoa-review-summary` v3; judge
`hoa-eval-review-judge` v2 (Sonnet). Three samples (`19-16-13`, `19-17-46-sample-1`, `19-19-32-sample-2`), as
entities / facts / normalization / evidence / findings / recommendation / action items / writer:

| Case | Sample 0 | Sample 1 | Sample 2 | Bars cleared |
| --- | --- | --- | --- | --- |
| bar | 1.00 .90 .98 .95 .95 1 .95 .90 | | | |
| fence-application (tuned) | 1.00 .87 .96 .97 .89 1 .85 1.00 | 1.00 .87 1.00 .97 .87 1 .83 1.00 | 1.00 .91 1.00 .98 .91 1 .88 1.00 | entities, evidence, recommendation, writer; normalization on two of three; not facts, findings, action items |
| garage-baseline (tuned) | all 1.00 | all 1.00 | entities .75 (an extra exterior item), else 1.00 | all on two of three |
| garage-attic (held out) | all 1.00 | all 1.00 | all 1.00 | all |
| garage-fee-not-paid (held out) | all 1.00 | facts .80, else 1.00 | facts .80, else 1.00 | all but facts on two of three |
| garage-replacement-plans (held out) | entities .75, facts .80, normalization .80, action items .67 (a second item of work for the replacement garage) | all 1.00 | all 1.00 | all on two of three |

So not every bar clears yet. What's left, by cause:

- **Fence findings (.87 to .91) and action items:** about eight findings a sample. Persistent: the gate's run is read
  at 0.5 to 0.75 by both identification and the facts call (the plat's swing mark is genuinely hard to place), so the
  gate's material and boards can't be compared with its run (2); the side runs' border with another lot is an
  inference the model holds under 0.8, which leaves the golf course rule open (2 to 3); Declaration 4.2(d) can't be
  decided without the Reviewer's fee (1, the question below); Declaration 4.3(b), because the document review won't
  confirm a fence's "structural design" from photos and a product sheet (1). The rest moves between samples (the
  return run's location and board orientation).
- **Fee not paid, facts:** "Review fee: $50, to be paid when the application is reviewed", against a property defined
  as the fee "when it requires the fee paid in full before review", reads as uncertain or absent on two of three
  samples. The finding is right either way; the fee belongs in the portal (question below).
- **Replacement plans, entities:** on one sample identification names building the replacement garage as a second item
  of Work, which the term's scope note ("one item of Work per proposed or existing change") supports; the case's
  expected data has one (question below).

What I'd try next, one at a time: (1) an engine reading of an uncertain reference whose candidates all agree on the
compared value (every run is composite with horizontal boards, so the gate's comparison doesn't need its run), an
engine change; (2) the Reviewer's fee from the portal (question below), which settles 4.2(d); (3) `hoa-visual-description`
asked to trace a marked route stretch by stretch, so the plat's description carries the return run and the gate's
place (an OCR-stage prompt: the fence fixture's descriptions would be regenerated); (4) the verification pass on each
fact that alone decides a not-met finding, which guards precision rather than these scores; (5) the `preview` label
once the variants clear on every sample.

Spend on evaluation round 2's tuning (rounds, samples and judging): $4.86 of the $8 cap; the OpenRouter balance is now
about $7.65.
