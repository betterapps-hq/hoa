# Design: rulebooks and reviews

> **Built:** governing documents with OCR at upload, the rulebook build and editor, and application review with the
> committee's decision. Not yet built: the retention Cron Trigger and the review's cost and Langfuse session link in the
> UI. In testing: the reordered encoding pipeline ([implementation-plan.md](implementation-plan.md)).

The design for turning an HOA's governing documents into a reviewed, versioned rulebook, and for reviewing homeowners'
applications against it. It's written for a product that many HOAs onboard to, so nothing in it is specific to one HOA.

| Page | What it covers |
| --- | --- |
| [schema.md](schema.md) | First pass, for review: the rules schema: governing documents, each organization's terms, rules, checks and evaluation |
| [schema-examples.md](schema-examples.md) | 57 checked examples of the schema, from fence colors to fine schedules and quorum |
| [encoding.md](encoding.md) | Spec: turning governing documents into a rulebook in the schema, from provisions to a published rules file |
| [taxonomy-ingestion.md](taxonomy-ingestion.md) | Experiment: discover rule kinds across organizations, then sort and extract with small models, the large model as fallback |
| [application-review.md](application-review.md) | Spec: reviewing an application against the rules file: selection, facts, the engine, the recommendation |
| [implementation-plan.md](implementation-plan.md) | The phased tasks that build the schema, both pipelines and their UX |
| [implementation-log.md](implementation-log.md) | Progress, decisions, open questions and evaluation results while the plan is built |
| [documents.md](documents.md) | What lives where, the records and D1 tables, storage layout, uploads, access, privacy and retention |
| [ocr.md](ocr.md) | Turning every uploaded file into stored page records with Azure Document Intelligence Layout |
| [evaluation.md](evaluation.md) | Datasets, scores, production evaluators and the prompt tuning loop in Langfuse |
| [platform.md](platform.md) | Cloudflare services, limits, workflows, caching, errors, server functions, local development, CI/CD |

## The problem with one big prompt

The first prototype sent every document to one model call and asked for rules, or for a review, in one step. That
approach can't cite pages reliably, re-reads every page on every call, breaks past a context window, has one failure
point for a multi-minute job, and mixes reading, comparing and deciding so that nothing can be tested on its own. It's
also where the sample review went wrong: flattening the approved colors into one list made "Trex in River Birch" look
acceptable.

## Principles

1. **Prompts are generic; HOA rules are data.** Every HOA uses the same prompts and rule schema. Its terms, rules and
   project types are its own data. Onboarding an HOA means extracting its rules and choosing its project types, not
   writing prompts or code.
2. **Read once, store everything.** Each file is OCR'd once, at upload, into page records. Every later stage works on
   stored page text, so citations are exact and model calls are cheap.
3. **The model reads; code judges.** Models turn documents into rules and applications into facts. Typed checks and the
   decision policy are code, so the same findings always give the same recommendation, and every branch is testable.
4. **Every rule is cited and verified.** Every quote is checked against the cited page before an administrator sees
   it. Unverified quotes are flagged, and a rule can't be approved until its citation verifies or the administrator
   corrects it.
5. **People approve.** No rule reaches homeowners until an HOA administrator approves it. The recommendation informs the
   committee; it doesn't decide.
6. **Versioned and explainable.** Published rulebooks are immutable, and every review records the rulebook version it
   used.
7. **Measured.** Every model stage is scored, through its own Langfuse dataset or the stage that consumes it
   ([evaluation.md](evaluation.md)), and prompts are promoted only when scores don't regress.

## Architecture

```text
 HOA administrator                                    Homeowner
   │ uploads governing documents                        │ uploads an application packet, runs the review
   ▼                                                    ▼
 DocumentIngest workflow                              ApplicationReview workflow
   resolve-prompts ─> ocr ─> visuals                    resolve-prompts ─> load ─> ocr ─> classify ─> subjects
   │ documents ready                                    ─> select ─> plan ─> facts ─> normalize ─> documents
   ▼                                                    ─> judgments ─> evaluate ─> decide ─> write ─> save-review
 RulebookBuild workflow                                   ▲
   resolve-prompts ─> check ─> structure ─> analyze       │ reviews against
   ─> defined-terms ─> plan ─> find-rules ─> vocabulary   │
   ─> vocabulary-merge ─> structure-rules ─> merge        │
   ─> consolidate ─> save-draft                           │
   │ administrator reviews, then publishRulebook          │
   ▼                                                      │
 published rules file ────────────────────────────────────┘
                                                        │ homeowner sees the review, fixes or submits anyway
                                                        ▼
                                                      committee decides, from the same review

 The build's steps (defined terms, find the rules, shared vocabulary, merge, structure each rule, consolidation)
 are in src/encoding/steps/, shared with the step evaluations

 R2: files, OCR output, page records, published rules files, job step outputs, reviews
 D1: HOAs, document records, provisions, jobs, rulebooks with their rules, terms and questions, project types,
     applications
 Langfuse: traces, prompts, datasets, scores
```

## Decisions

| Decision | Choice | Alternatives considered |
| --- | --- | --- |
| Rule representation | The rules schema: each organization's own vocabulary and typed checks ([schema.md](schema.md)); project types are each organization's data, built from its rules | Free-text rules only (not checkable); a global project-type catalog or HOA-specific prompts (don't scale) |
| Text from documents | OCR every file once at upload with Azure Document Intelligence Layout; store per-page records | Mistral OCR (generative, can alter text); OpenRouter's PDF parser (only inside chat requests); sending PDFs to the model on every call |
| Unit of encoding and citation | The provision, parsed from the document's numbering ([encoding.md](encoding.md)) | Whole document (can't cite, too long); single page (provisions span pages); headings-only sections (too coarse to cite) |
| Recommendation | Code: a decision policy over findings | The model decides (not reproducible) |
| When every unmet rule is curable | Approve with conditions by default, as CC&R 4.3(b) allows; a per-HOA setting | Reject (makes homeowners resubmit for a color change) |
| When the review runs | As soon as the homeowner uploads, before submitting; they can fix and re-run, or submit anyway | Only after submission (the homeowner learns about problems weeks later) |
| Application retention | 365 days after the committee's decision, 30 days for drafts never submitted; per-HOA settings | Keeping packets indefinitely |
| Homeowner privacy | Not applied in the demo: model inputs and outputs reach Langfuse in full | Summaries only and Broadcast privacy mode (needed before real HOAs onboard) |
| Images | JPEG and PNG only | Converting HEIF, TIFF and BMP (the model can't read them) |
| Long jobs | Cloudflare Workflows; publishing is a server function | One long request (canceled on disconnect); Queues (no checkpoints); waiting for approval inside a workflow (times out) |
| Storage | R2 for files and page text, one shared D1 database for metadata | A database per HOA (bindings are fixed at deploy time) |
| Hosting | Cloudflare Workers, one demo environment plus isolated pull request previews | Vercel and Neon |
