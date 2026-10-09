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
| 2 Engine | Not started |
| 3 Storage | Not started |
| 4 Encoding pipeline | Not started |
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

## Questions

| Date | Question | Meanwhile |
| --- | --- | --- |
| 2026-10-09 | LexNLP is AGPL-3.0, with a commercial license available. Take the license, accept AGPL, or replace its extractors with our own? | Not used until E1.6; own grammars first. |
| 2026-10-09 | Numbering test matrix (plan item 3 in the generalization review): write a few common numbering styles as parser tests now, or defer with the other generalization work? | Deferred with the corpus work. |

## Evaluation rounds

No rounds run yet.
