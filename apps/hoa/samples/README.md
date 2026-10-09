# Sample data

Committed sample data for development, tests and evaluation datasets. Nothing here contains a homeowner's personal
details or an individual's name: application packets stay in the git-ignored repository-root `.fixtures/` folder until a
reviewed, redacted copy is added here.

| Folder                       | What it holds                                                                                                                                                          |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [declaration/](declaration/) | The sample community's recorded Declaration (CC&Rs, recorded 2001-12-04) and its Use Restrictions (Exhibit C), encoded in the [rules schema](../docs/design/schema.md) |

## declaration/

| File                                               | What it is                                                                                                                                                                                                                                                                                                |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [rules.json](declaration/rules.json)               | The rules file: 5 documents (2 loaded, 3 referenced), 537 provisions, 559 organization terms, 18 proposed core terms, 307 rules, 7 interpretation questions and the settings clauses. Valid against the schema's Zod `rulesFile`. Every record's review status is `proposed`: nobody has reviewed it yet. |
| [notes.md](declaration/notes.md)                   | The encoders' judgment calls and the 17 remaining `SCHEMA GAP` notes, by article                                                                                                                                                                                                                          |
| [encoding-brief.md](declaration/encoding-brief.md) | The instructions the encoders followed: conventions for keys, labels, modality, approvals, requirements, selectors, sanctions and coverage. The starting point for the `hoa-provision-encoding` prompt                                                                                                    |

It was produced by hand-run model encoders, one per group of articles, each checked by the type checker and the schema's
validators, then merged and validated as one file. Provision text is the recorded wording with OCR noise and page stamps
removed; the signature and notary pages aren't included.

**Uses** ([implementation-plan.md](../docs/design/implementation-plan.md)):

- the gold set for the `provision-encoding` and `term-extraction` datasets, once reviewed;
- the expected output for structure tests (provision keys, labels, intros and wrap-ups);
- a seed rulebook, so the review pipeline can run before the rules UX is finished (`pnpm db:seed:sample`).

**Not here yet:** the Declaration's page text and PDF, the Residential Design Guidelines, and the sample fence
application. Each needs a reviewed redaction first (the Declaration's cover sheet and signature pages name individuals;
the application names the homeowners).
