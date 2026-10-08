# Design: rulebooks and reviews

> **Target design, not yet built.** The app today is the prototype described in [../ai.md](../ai.md) and
> [../setup.md](../setup.md). Update those pages as each phase lands.

The design for turning an HOA's governing documents into a reviewed, versioned rulebook, and for reviewing homeowners'
applications against it. It's written for a product that many HOAs onboard to, so nothing in it is specific to one HOA.

| Page | What it covers |
| --- | --- |
| [rules.md](rules.md) | The rule model: project-type catalog, components, typed checks, citations, rule keys, versioning |
| [documents.md](documents.md) | What lives where, the records and D1 tables, storage layout, uploads, access, privacy and retention |
| [ocr.md](ocr.md) | Turning every uploaded file into stored page records with Azure Document Intelligence Layout |
| [extraction.md](extraction.md) | The rulebook build pipeline, from page records to a published rulebook |
| [review.md](review.md) | The application review pipeline: facts, documents, evaluation, decision policy, feedback |
| [evaluation.md](evaluation.md) | Datasets, scores, production evaluators and the prompt tuning loop in Langfuse |
| [platform.md](platform.md) | Cloudflare services, limits, workflows, caching, errors, server functions, local development, CI/CD |

## The problem with one big prompt

The first prototype sent every document to one model call and asked for rules, or for a review, in one step. That
approach can't cite pages reliably, re-reads every page on every call, breaks past a context window, has one failure
point for a multi-minute job, and mixes reading, comparing and deciding so that nothing can be tested on its own. It's
also where the sample review went wrong: flattening the approved colors into one list made "Trex in River Birch" look
acceptable.

## Principles

1. **Prompts are generic; HOA rules are data.** Every HOA uses the same prompts, rule schema and project-type catalog.
   Onboarding an HOA means extracting its rules, not writing prompts.
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
   │ uploads governing documents                        │ submits an application packet
   ▼                                                    ▼
 DocumentIngest workflow                              ApplicationReview workflow
   hash ─> ocr ─> pages ─> figures                      resolve-prompts ─> ocr ─> visuals ─> classify
   │ documents ready                                    ─> facts ─> documents ─> evaluate ─> decide
   ▼                                                    ─> write ─> save-review
 RulebookBuild workflow                                   ▲
   resolve-prompts ─> structure ─> route ─> extract       │ reviews against
   ─> verify ─> consolidate ─> save-draft                 │
   │ administrator reviews, then publishRulebook          │
   ▼                                                      │
 published rulebook ──────────────────────────────────────┘

 R2: files, OCR output, page records, section text, reviews
 D1: HOAs, document records, sections, jobs, rulebooks, rules, applications
 Langfuse: traces, prompts, datasets, scores
```

## Decisions

| Decision | Choice | Alternatives considered |
| --- | --- | --- |
| Rule representation | Typed checks over a global, versioned project-type catalog with components, plus `qualitative` for the rest | Free-text rules only (not checkable); HOA-specific prompts (don't scale) |
| Text from documents | OCR every file once at upload with Azure Document Intelligence Layout; store per-page records | Mistral OCR (generative, can alter text); OpenRouter's PDF parser (only inside chat requests); sending PDFs to the model on every call |
| Unit of extraction and citation | Document section | Whole document (can't cite, too long); single page (sections span pages) |
| Recommendation | Code: a decision policy over findings | The model decides (not reproducible) |
| When every unmet rule is curable | Approve with conditions by default, as CC&R 4.3(b) allows; a per-HOA setting | Reject (makes homeowners resubmit for a color change) |
| Application retention | 365 days after the committee's decision by default; a per-HOA setting | Keeping packets indefinitely |
| Long jobs | Cloudflare Workflows; publishing is a server function | One long request (canceled on disconnect); Queues (no checkpoints); waiting for approval inside a workflow (times out) |
| Storage | R2 for files and page text, one shared D1 database for metadata | A database per HOA (bindings are fixed at deploy time) |
| Hosting | Cloudflare Workers, one demo environment plus isolated pull request previews | Vercel and Neon |

## From the prototype

The prototype's data is disposable: there's no data migration. Delete `.data/rulebook.json` and rebuild rulebooks
through the pipeline.

| Today | Becomes | Specified in |
| --- | --- | --- |
| `src/rules/rules.ts` (`kind`, one source per rule, flat rulebook) | Zod schemas for the catalog, `Rule`, `Check`, `Rulebook` | [rules.md](rules.md) |
| `src/review/review.ts` | `Recommendation` kept; `Fact`, `DocumentStatus`, `Finding` (with `needs-committee` and `not-applicable`) and `Review` schemas | [review.md](review.md) |
| `src/rules/rulebookStore.server.ts`, `.data/rulebook.json` | D1 and R2 repositories in `src/db` and `src/storage` | [documents.md](documents.md) |
| `rulebook.functions.ts`: `extractRules`, `getRulebook`, `publishRulebook` | `createUpload`, `completeUpload`, `startRulebookBuild`, `getRulebook`, `saveRule`, `reviewRule`, `publishRulebook` | [platform.md](platform.md#server-functions) |
| `review.functions.ts`: `reviewProject` | `createApplication`, `createUpload`, `submitApplication`, `getApplication`, `recordDecision` | [platform.md](platform.md#server-functions) |
| `src/documents/uploads.ts` | Layout's types only (no WebP or GIF), new limits | [documents.md](documents.md#uploads) |
| `src/documents/toAttachments.server.ts` and `mammoth` | Removed: Layout reads Word text, and the app extracts Word images | [ocr.md](ocr.md#word-files) |
| `src/ai/prompts.ts`: `hoa-rule-extraction`, `hoa-application-review` | Removed; one prompt per stage. `hoa-model-check` stays | [extraction.md](extraction.md#prompts-and-models), [review.md](review.md#prompts-and-models) |
| `src/ai/telemetry.server.ts` (`NodeTracerProvider`) | `BasicTracerProvider` plus an `AsyncLocalStorage` context manager | [platform.md](platform.md#tracing-on-workers) |
| `src/ai/runPrompt.ts`, `aiContext.server.ts`, `openrouter.server.ts` | Prompts by version, `recordContent`, a small model, the prompt's `config.model`, data collection denied | [ai.md](../ai.md) |
| `RulebookPage`, `RulebookEditor`, `RuleCard`, `PublishedRulebook` | Upload with job progress; an editor over D1 rules where `RuleCard` edits each check type with its own fields and shows issues and citations with page text | [extraction.md](extraction.md#8-review) |
| `SubmitProjectPage`, `ReviewResult` | Application form with direct uploads and job progress; `ReviewResult` renders a `Review`: per-component findings, action items, committee decisions, cost and a Langfuse session link | [review.md](review.md#the-review-record) |
| `RoleProvider` (`localStorage`) | A cookie read by `getRequestContext()` | [documents.md](documents.md#phase-1-assumptions) |
| `ModelCheck`, the dashboard and layout | Unchanged | |

## Build phases

1. **Pipeline, locally.**
   1. Move the app onto Cloudflare's Vite plugin, and prove Langfuse tracing on workerd before anything else
      ([platform.md](platform.md#tracing-on-workers)).
   2. D1 schema and migrations, R2 storage with the remote `hoa-dev` bucket, presigned uploads, request context.
   3. DocumentIngest with Layout; measure memory on the full CC&Rs.
   4. RulebookBuild and the rulebook editor; ApplicationReview and the review screens.
2. **Run and tune.** Run the full flow on the sample HOA and the redacted sample application. Build the gold datasets,
   create the prompts in Langfuse, and tune until extraction recall, citation validity and the sample review match the
   expected results.
3. **Repository and CI/CD.** Create the private GitHub repository and push, including the existing CI workflow
   (`ci.yml`). Put Cloudflare Access in front of the demo and preview hostnames, then add Workers Builds deploys on
   merge to `main` and pull request previews.
4. **Host.** Deploy the demo, seed it, and build its first rulebook.

Later: real sign-in in place of the demo role switcher, more project types, multiple HOAs in the UI, and rulebook diffs
when governing documents change.
