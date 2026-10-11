# Sample data

Committed sample data for development, tests and evaluation datasets. Nothing here contains a homeowner's personal
details or an individual's name: application packets stay in the git-ignored repository-root `.fixtures/` folder until a
reviewed, redacted copy is added here.

| Folder                                 | What it holds                                                                                                                                                                                                                                                         |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [declaration/](declaration/)           | The sample community's golden rulebook: its recorded Declaration (CC&Rs, recorded 2001-12-04), its Use Restrictions (Exhibit C) and a slice of its Residential Design Guidelines (Board approved 2025-11-12), encoded in the [rules schema](../docs/design/schema.md) |
| [garage-enclosure/](garage-enclosure/) | The synthetic garage enclosure application and its three variants, as evaluation round 2's cases (made-up text and image descriptions; no personal data)                                                                                                              |

## declaration/

| File                                 | What it is                                                                                                                                                                                                                                                                                                  |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [rules.json](declaration/rules.json) | The rules file: 6 documents (3 loaded, 3 referenced), 680 provisions, 1018 organization terms, 18 proposed core terms, 679 rules, 15 interpretation questions and the settings clauses. Valid against the schema's Zod `rulesFile`. Every record's review status is `proposed`: nobody has reviewed it yet. |
| [notes.md](declaration/notes.md)     | The encoders' judgment calls and the remaining `SCHEMA GAP` notes, by article, and the Design Guidelines slice's parser fixes and judgment calls                                                                                                                                                            |

The Declaration and Use Restrictions (537 provisions, 522 rules, 7 questions) were produced by hand-run model encoders,
one per group of articles, each checked by the type checker and the schema's validators, then merged and validated as
one file. Provision text is the recorded wording with OCR noise and page stamps removed; the signature and notary pages
aren't included.

**The Design Guidelines slice** (document key `guidelines`, 143 provisions, 262 terms, 157 rules, 8 questions) was
hand-encoded by a coding agent with the same conventions as the Declaration, without a model call. It covers Article 3
(review and approval procedures), all of Article 5 (fences, gates and screens), Sections 7.13 (detached structures) and
7.14 (patios, porches and decks), and Exhibits K to O (the fence and lattice drawings they cite): the clauses the
Declaration mostly lacks, such as numeric limits, tables keyed by another value (impervious coverage by Unit type, stain
and composite colors by manufacturer), figures, "should" recommendations, required documents, approvals and case-by-case
discretion. Its provisions are the structure parser's output on the Guidelines' page records, with the parser's genuine
mistakes fixed by hand and listed in the notes; the rest of the Guidelines isn't encoded yet. Every provision in the
slice is cited by a rule, a term, a settings clause or a question, or has a reason for having no rule. It was checked
with the Zod schema, `validateRulebook`, and the tests that load the sample (`src/schema/sampleRulesFile.test.ts` and
the tests built on `sampleRulesFile()`), then audited provision by provision against the text.

The fence fixture (`src/tests/fenceSchemaFixture.ts`) still carries its own one-line summaries of the guidelines' fence
provisions and its own fence rules; it and the review rules built on it (`scripts/reviewRulesFile.ts`) use the sample
without the Design Guidelines slice (`sampleDeclarationRulesFile()`).

**Uses:**

- the golden that `pnpm eval:datasets` builds the per-step datasets from, and that `pnpm eval:step` scores a step
  against ([evaluation.md](../docs/design/evaluation.md#encoding-step-datasets));
- the golden `pnpm eval:encoding:score` scores a full encoding run against;
- the seeded rulebook (`pnpm db:seed:sample`), so applications can be reviewed locally against approved rules.

## garage-enclosure/

One folder per case (`baseline`, `replacement-plans`, `attic`, `fee-not-paid`; application-review.md, "Expected result
for a garage enclosure"), each a `case.json` read by `pnpm eval:review`: the application (description, submission date),
the packet as OCR would leave it (each file's page text and image descriptions, written for the purpose), and the
expected entities, facts, documents, findings, recommendation and action items. Besides the form, description, floor
plan and elevation the spec names, each packet carries the Design Guidelines' packet items (a signed checklist, a site
plan, a photo and a product sheet), because evaluation's rules file includes the guidelines' packet rules.

**Not here yet:** the Declaration's page text and PDF, the Residential Design Guidelines' page text and PDF (only the
encoded slice's provision text is here), and the sample fence application. Each needs a reviewed redaction first (the
Declaration's cover sheet and signature pages name individuals; the application names the homeowners).
