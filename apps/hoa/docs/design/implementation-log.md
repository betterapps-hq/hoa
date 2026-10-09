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
| 4 Encoding pipeline | Done except the text-analysis service (4.7a, 4.7b, 4.14a, moved to E1.6): `buildRulebook` (`src/encoding/build.ts`) runs every stage with the real prompts, the `RulebookBuild` Workflow wraps it, save-draft, scores, publish; checked once end to end on a slice with the real models (below) |
| E1 Evaluation round: encoding | E1.2's runner built (`pnpm eval:encoding`); scorers (E1.3) next |
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

## Questions

| Date | Question | Meanwhile |
| --- | --- | --- |
| 2026-10-09 | LexNLP is AGPL-3.0, with a commercial license available. Take the license, accept AGPL, or replace its extractors with our own? | Not used until E1.6; own grammars first. |
| 2026-10-09 | Numbering test matrix (plan item 3 in the generalization review): write a few common numbering styles as parser tests now, or defer with the other generalization work? | Deferred with the corpus work. |
| 2026-10-09 | When an interpretation question is answered, its rejected candidate rule leaves the rules file but the question still names it, so validation reports an undefined rule. Keep answered questions with only the kept rules, or keep rejected rules in the file marked rejected? | To decide in phase 5; leaning towards keeping the question with its answer and dropping rejected keys from its options. |
| 2026-10-09 | `tiny-invariant` is recommended by docs/typescript.md but isn't a dependency of the app, so the engine throws `Error` where it would use `invariant`. Add it to the app, or drop it from the conventions? | Throwing `Error`. |

## Evaluation rounds

No rounds run yet.
