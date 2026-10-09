# Platform: Cloudflare

How the design maps onto Cloudflare, and how local development and deployment work. Research for this page was done on
2026-10-08 against Cloudflare's documentation; limits and configuration keys change, so re-check them when implementing.

## Services

| Need | Service | Why |
| --- | --- | --- |
| Web app and API | **Workers**, running TanStack Start | Officially supported through Cloudflare's Vite plugin |
| Files: originals, OCR output, page records, reviews | **R2** | Large objects, free egress, private by default, presigned URLs for browser uploads |
| Metadata: HOAs, documents, section metadata, jobs, rulebooks, rules, applications | **D1** (SQLite), one shared database with an `hoa_id` column | Small relational data; Drizzle support; 10 GB per database is far more than rules and metadata need |
| OCR, rulebook builds and application reviews | **Workflows** | Durable steps with retries, results checkpointed, survives the user closing the tab |
| Retention | **Cron Trigger** | A daily sweep deletes application data past `deleteAfter` ([documents.md](documents.md#privacy-and-retention)) |

What lives in each store is listed in [documents.md](documents.md#what-lives-where).

Not used: **Workers AI `toMarkdown`** (doesn't OCR), **Vectorize** (a few hundred rules per HOA are filtered in SQL, no
semantic search needed), **Queues** (Workflows already cover our multi-step jobs; a Queue consumer's 15-minute cap and
lack of checkpoints suit independent tasks, not pipelines), and **one D1 database per HOA** (database bindings are
fixed at deploy time, so per-tenant databases can't be chosen at runtime; a shared database with `hoa_id` is simpler and
ample).

Requires the **Workers Paid** plan ($5 a month minimum): the free plan's 10 ms of CPU per request and 50 subrequests rule
this workload out.

## Limits that shape the design

| Limit (Workers Paid) | Design response |
| --- | --- |
| 128 MB memory per Worker | Never load a whole PDF: browsers upload straight to R2, and Layout reads files through presigned URLs. Layout responses are analyzed in 50-page ranges, streamed to R2, and parsed one range at a time. Peak memory is measured on the 81-page CC&Rs before the 300-page limit is fixed. |
| 30 s CPU per request by default (configurable to 5 min) | Waiting on model calls uses almost no CPU; heavy work runs in Workflow steps |
| A request's work may be canceled when the client disconnects; `waitUntil` adds only 30 s | Anything longer than a quick call runs in a Workflow |
| Workflow step results up to 1 MiB; instance state up to 1 GB | Steps return R2 keys, not page text |
| Workflow step timeout defaults to 10 min per attempt | Every step sets its timeout and retries explicitly (see [Errors and retries](#errors-and-retries)) |
| 100 MB request body on Free and Pro zones | Uploads go directly to R2 with presigned `PUT` URLs, never through the Worker |
| D1: 2 MB per row, 100 KB per statement, 1,000 queries per invocation, no interactive transactions | Page and section text lives in R2; changes that must land together use `batch()` |
| R2: one write per second to the same key | Every write targets a new key |

## Workflows

Three workflows. Each takes ids, never content, and every step updates the job row (`stage`, `done`, `total`) so the UI
can show progress. Every step name starts with its stage id, then the item id, so names are deterministic.

```text
DocumentIngest(documentId)                        started by completeUpload for a governing document
  resolve-prompts
  ocr:hash ─> per 50-page range: ocr:submit:{range} ─> ocr:poll:{range} ─> ocr:pages:{range} ─> ocr:labels
  visuals:{figureId}
  sets the document ready, or failed with its error

RulebookBuild(rulebookId)                         started by startRulebookBuild; documents must be ready
  resolve-prompts
  structure:{documentId} ─> analyze:{documentId} ─> vocabulary:{documentId} ─> plan
  encode:{unitId}                                  8 at a time, settled; failures recorded on the job
  verify ─> repair:{unitId}:1 ─> verify:merged ─> repair:{unitId}:2 ─> merge ─> consolidate
  save-draft ─> save-draft:scores ─> save-draft:finish
  ends; review and publishing are server functions

ApplicationReview(applicationId)                  started by runReview
  resolve-prompts
  per file, in parallel: ocr:hash:{fileId} ─> ocr:media:{fileId} ─> ocr:submit / ocr:poll / ocr:pages per range
  visuals:{fileId}:{figureId}
  classify:{fileId} ─> facts ─> documents
  evaluate ─> evaluate:{ruleId}:{componentId} for qualitative checks
  decide ─> write ─> save-review
```

Stage ids are defined in [ocr.md](ocr.md#where-it-runs), [encoding.md](encoding.md#stages) and
[application-review.md](application-review.md#stages). Each workflow instance is one Langfuse session: the job id is the session id. A workflow
reads `hoaId` from its job row, not from its parameters.

Publishing isn't a workflow step. `publishRulebook` checks the publish gate ([encoding.md](encoding.md#12-review-and-13-publish))
and runs one D1 batch, so an administrator can take as long as they like to review a draft.

### Idempotency

- **Starting a job.** A server function first moves its subject with a guarded update, for example
  `UPDATE applications SET status = 'reviewing' WHERE id = ? AND status IN ('draft', 'reviewed', 'information-requested')`,
  batched with inserting the job row under a new `crypto.randomUUID()` id. It continues only if the update changed one
  row, so a double-click or a client retry can't start a second workflow. It then calls
  `env.X.create({ id: jobId, params })`; if that throws, it marks the job failed and restores the subject's status.
- **Step writes.** Every D1 write in a step is an upsert, or a delete-then-insert, keyed by deterministic ids, so a
  retried step after a partial write doesn't hit unique constraints.
- **Progress.** `done` is set from a count of finished items, never incremented.

## Caching

Two separate mechanisms:

1. **Within one instance**, Workflows checkpoint completed steps by name, so a retried or resumed instance skips them.
2. **Across instances**, model steps check a content cache in R2 before calling the model. The key is the SHA-256 of
   the stage, the model id, the fully compiled prompt text and the hashes of any attachments, so a change to a prompt
   version, the model or the input misses the cache, and nothing else does.
   Governing-document stages use `hoas/{hoaId}/cache/{stage}/{key}.json`. Application stages use
   `hoas/{hoaId}/applications/{applicationId}/cache/{stage}/{key}.json`, so the retention sweep removes them with the
   application.

The first step of every workflow, `resolve-prompts`, resolves each prompt label to a version and stores the versions on
the job; later steps load prompts by those versions. Prompts exist only in Langfuse: a prompt it can't serve fails the
step with a retryable error. Per-job outputs are written to
`hoas/{hoaId}/jobs/{jobId}/{stage}/{itemId}.json`.

## Errors and retries

| Step kind | Retries | Backoff | Timeout |
| --- | --- | --- | --- |
| Model call | 3 | Exponential from 10 s | 5 min |
| Layout submit | 3 | Exponential from 5 s | 1 min |
| Layout poll | 180, by throwing "not ready" (15 min) | Constant 5 s | 30 s per check |
| R2 and D1 work | 2 | 1 s | 1 min |

- **Permanent errors fail fast.** Steps throw `NonRetryableError` for file validation failures, Azure 4xx responses
  other than 429, and unsupported content.
- **Fan-outs don't fail the whole job.** Per-file OCR in a review, per-unit encoding, per-group fact reading and
  per-rule judgment checks run under `Promise.allSettled`; a failed item is recorded in the job's `failures` and handled as
  [encoding.md](encoding.md#8-repair) and [application-review.md](application-review.md#stages) describe. A job with failures ends as
  `completed-with-errors`.
- **Everything else fails the job.** The workflow body catches the error and, in a final step, sets the job to `failed`
  with `error: { stage, message, isRetryable }`, and updates its subject: a document or rulebook becomes `failed`, an
  application goes back to the status it had before the review. The UI shows the message and a way to run it again;
  the content cache makes that cheap.

## Server functions

The UI talks to the pipeline only through these. None of them take `hoaId` or the user as input: both come from
`getRequestContext()` ([documents.md](documents.md#phase-1-assumptions)). Each checks the role and access rules.

| Function | Role | Input | Output |
| --- | --- | --- | --- |
| `createUpload` | Administrator (governing), homeowner (application) | Target, file name, type, size; for governing documents kind, title, effective date, and optionally the `lineageId` it's a new version of or the lineage it amends; for application files the application id | Record id, presigned `PUT` URL |
| `completeUpload` | Same | Record id | Job id, for governing documents |
| `getJob` | Any | Job id | `Job` |
| `getActiveJob` | Any | Subject id | The running job for a document, rulebook or application, if any, so a reloaded page finds it |
| `listDocuments` | Any | | `GoverningDocument[]` |
| `startRulebookBuild` | Administrator | Document ids | Job id, rulebook id |
| `getRulebook` | Administrator for drafts, any for published | `draft` or `published` | Rulebook, rules, and for a draft the removed rules (`ruleKey`, title, citations) |
| `saveRule` | Administrator | Rule id (or none, to add), edited fields | `Rule`, re-verified |
| `reviewRule` | Administrator | Rule id, approve or reject, note | `Rule` |
| `resolveIssue` | Administrator | Rule id, issue code, note | `Rule` |
| `publishRulebook` | Administrator | Rulebook id | `Rulebook`, or the reasons it's blocked |
| `getPage` | Per access rules | Document or file id, page index | `Page`, with its descriptions, kind and presigned figure URLs |
| `getFileUrl` | Per access rules | Document or file id | Presigned `GET` URL |
| `createApplication` | Homeowner | Project type, description | `Application` |
| `updateApplication` | Owner | Application id, description; files to remove | `Application` |
| `runReview` | Owner | Application id | Job id; allowed in `draft`, `reviewed` and `information-requested` |
| `submitApplication` | Owner | Application id, confirmation when the latest review requests information | `Application` (`submitted`) |
| `listApplications` | Homeowner (their own), administrator (all, filterable by status) | Status filter | Applications with their latest recommendation |
| `getApplication` | Owner or administrator | Application id | Application, files, latest review and earlier reviews |
| `recordDecision` | Administrator | Application id, outcome, note | `Application` |

The UI polls `getJob` every 2 seconds with TanStack Query's `refetchInterval` until the job ends, and shows progress in
the units the job reports ("Extracting rules: 12 of 40 sections").

## App wiring

`apps/hoa/wrangler.jsonc` is the source of truth; today it holds the prototype's settings and R2 bucket. Phase 1 adds
D1, Workflows, the cron trigger and the R2 signing settings, sketched below. Nothing at the top level reaches `previews`
or an `env` block: each repeats every var and binding it needs.

```jsonc
{
  "name": "hoa",
  "main": "src/server.ts",
  "compatibility_date": "2026-10-01",
  "compatibility_flags": ["nodejs_compat"],
  "d1_databases": [{ "binding": "DB", "database_name": "hoa", "database_id": "…", "migrations_dir": "migrations" }],
  "r2_buckets": [{ "binding": "FILES", "bucket_name": "hoa-files" }],
  "workflows": [
    { "name": "hoa-document-ingest", "binding": "DOCUMENT_INGEST", "class_name": "DocumentIngest" },
    { "name": "hoa-rulebook-build", "binding": "RULEBOOK_BUILD", "class_name": "RulebookBuild" },
    { "name": "hoa-application-review", "binding": "APPLICATION_REVIEW", "class_name": "ApplicationReview" }
  ],
  "triggers": { "crons": ["0 9 * * *"] }, // retention sweep
  "vars": { /* every non-secret setting, with LANGFUSE_TRACING_ENVIRONMENT "production" and R2_BUCKET "hoa-files" */ },
  "previews": {
    "vars": { /* every setting again, with LANGFUSE_TRACING_ENVIRONMENT "preview" and R2_BUCKET "hoa-preview" */ },
    "d1_databases": [{ "binding": "DB", "database_name": "hoa-preview", "database_id": "…" }],
    "r2_buckets": [{ "binding": "FILES", "bucket_name": "hoa-preview" }],
    "workflows": [
      { "name": "hoa-preview-document-ingest", "binding": "DOCUMENT_INGEST", "class_name": "DocumentIngest", "script_name": "hoa-preview" },
      { "name": "hoa-preview-rulebook-build", "binding": "RULEBOOK_BUILD", "class_name": "RulebookBuild", "script_name": "hoa-preview" },
      { "name": "hoa-preview-application-review", "binding": "APPLICATION_REVIEW", "class_name": "ApplicationReview", "script_name": "hoa-preview" }
    ]
  },
  "env": {
    // A second Worker that hosts the Workflows previews use. Workflow names are unique per account, hence the prefix.
    "preview-workflows": {
      "name": "hoa-preview",
      "vars": { /* the preview values */ },
      "d1_databases": [{ "binding": "DB", "database_name": "hoa-preview", "database_id": "…", "migrations_dir": "migrations" }],
      "r2_buckets": [{ "binding": "FILES", "bucket_name": "hoa-preview" }],
      "workflows": [ /* the three hoa-preview-* Workflows, defined here */ ]
    },
    // Local development: the hoa-dev bucket through a remote binding; D1 and Workflows stay local.
    "dev": {
      "vars": { /* development values */ },
      "d1_databases": [{ "binding": "DB", "database_name": "hoa-dev", "database_id": "…", "migrations_dir": "migrations" }],
      "r2_buckets": [{ "binding": "FILES", "bucket_name": "hoa-dev", "remote": true }],
      "workflows": [ /* the three Workflows, as at the top level */ ]
    }
  }
}
```

- `src/server.ts` exports TanStack Start's handler as `fetch`, the retention sweep as `scheduled`, and the three
  Workflow classes.
- Server code reads bindings with `import { env } from "cloudflare:workers"`. `src/env.server.ts` keeps t3-env
  validation for vars and secrets and gains the phase 1 settings (`OPENROUTER_SMALL_MODEL`, the Azure and `R2_*`
  values). `wrangler types` generates `worker-configuration.d.ts`, which is committed so `check:types` works in CI.
- Secrets (`OPENROUTER_API_KEY`, `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `AZURE_DOCUMENT_INTELLIGENCE_KEY`,
  `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`) are set with `wrangler secret put` for the demo,
  `wrangler preview base-config secret put` for previews, and `wrangler secret put --env preview-workflows` for the
  preview Workflows Worker. Locally they stay in `apps/hoa/.env`; there's no `.dev.vars`, because Wrangler ignores `.env`
  when one exists. Every setting is listed in [setup.md](../setup.md).
- Presigned URLs are signed with `aws4fetch` using an R2 API token per environment, scoped to that environment's bucket.
  Each bucket has a CORS rule allowing `PUT` with the `Content-Type` header from its environment's origins.

## Local development

`pnpm dev` runs the app inside workerd, Cloudflare's runtime, through the Vite plugin. Model calls, OCR and Langfuse go
to the real services. Until phase 1 adds the `dev` environment, local runs use the top-level bindings with R2 simulated
on disk.

From phase 1, `vite.config.ts` sets `process.env.CLOUDFLARE_ENV ??= "dev"` when serving, so development selects the
`dev` environment on every platform (a `CLOUDFLARE_ENV=dev` prefix in a pnpm script doesn't work in Windows' shell). R2
is then the real `hoa-dev` bucket through a remote binding, because presigned browser uploads and Layout's `urlSource`
both need a real S3 endpoint; D1 and Workflows stay simulated on disk. Scripts in `apps/hoa`: `db:migrate:local`
(`wrangler d1 migrations apply hoa-dev --local --env dev`), `db:seed:local` (the one HOA), `db:seed:sample`,
`db:reset:rules` and `cf-typegen` (`wrangler types`).

- **`db:seed:sample`** publishes `samples/declaration/rules.json` as the seeded HOA's rulebook, every record approved,
  so reviews can run before the rules UX exists. `src/rulebook/seedRulebook.ts` writes the D1 rows as SQL, which
  `wrangler d1 execute --local` runs, and assembles the rules file from the same records, which
  `wrangler r2 object put --local` stores. Running it again replaces the same rulebook.
- **`db:reset:rules`** empties rulebooks, their records, sections, provisions, referenced documents, rulebook-build
  and review jobs and reviews, with their R2 objects, through `getPlatformProxy` (`src/db/resetRules.ts`). Uploaded
  documents, applications (back to `draft`), model caches and settings stay.
- Both use Wrangler's local R2 by default. `pnpm dev` binds the real `hoa-dev` bucket instead, so add `--dev-bucket`
  to write or delete the objects there. Neither script ever reaches the preview or demo databases or buckets.

## Tracing on Workers

Proven on workerd (2026-10-08): a prompt call's span arrived in Langfuse with its trace name, and
OpenRouter's generation and cost nested under it. `telemetry.server.ts` uses a `BasicTracerProvider` with
`LangfuseSpanProcessor` in immediate export mode, registered with `trace.setGlobalTracerProvider` and an
`AsyncLocalStorageContextManager` (which needs `nodejs_compat`). Without the context manager, `propagateAttributes`
silently stops putting the trace name and session id on spans.

Server functions await `flush()` before returning, as today. Workflow steps await it at the end of each step.
`runPrompt.test.ts` checks that exported spans carry the trace name and session id, using the same registration.

## Code layout and tests

```text
src/db/          Drizzle schema and repositories (*.server.ts)
src/storage/     R2 keys and presigning
src/rulebook/    assembling, hashing and reading the published rules file; carrying approvals forward; the sample seed
src/ocr/         Layout client (fetch) and the page builder
src/pipeline/    stage logic as pure functions: structure, verify, consolidation, evaluate, decide
src/workflows/   the three Workflow classes: thin wiring of steps to stage logic
src/server.ts    the Worker entry
migrations/      D1 migrations
```

- Stage logic and the page builder are pure and unit-tested with co-located tests, the page builder against trimmed
  Layout responses from the governing documents (never application data). The decision engine's tests include the
  arborless gate, the arbor without lattice, and a conflicting fact.
- Repository tests run in the normal Vitest run, with v8 coverage: `src/tests/testDatabase.ts` starts an in-memory D1
  through Wrangler's `getPlatformProxy` and applies every migration, so the real SQL, unique and partial indexes
  included, is exercised. (Cloudflare's Vitest plugin still requires Vitest 4.)
- `src/server.ts` and `src/workflows/**` are added to the coverage exclusions, alongside `*.server.ts`.
- `wrangler` is an `apps/hoa` dev dependency. `cloudflare:workers` resolves to a stub in unit tests
  (`vitest.config.ts`), and knip ignores it as a dependency.

## Dependencies

Already added: `wrangler`, `@cloudflare/vite-plugin` and `drizzle-kit` (dev), `drizzle-orm`,
`@opentelemetry/sdk-trace-base` and `@opentelemetry/context-async-hooks`; `@opentelemetry/sdk-trace-node` is removed.
Phase 1 adds:

| Package | For |
| --- | --- |
| `aws4fetch` | Presigned R2 URLs |
| `@tanstack/react-query` | Polling jobs |
| `@tanstack/react-form` | Forms, replacing react-hook-form |
| `fflate` | Reading pictures out of Word files |

Phase 1 removes `mammoth` (Layout reads Word text). Azure is called with `fetch`, and ids come from
`crypto.randomUUID()`. [docs/tech-stack.md](../../../../docs/tech-stack.md) lists these.
## CI/CD

Hosted on GitHub as a private repository, `AndrewCraswell/hoa`. Everything runs in GitHub Actions, and a deploy only
happens after `pnpm verify` passes. Both pipelines call the same verification (`verify.yml`).

| Workflow | Trigger | Jobs |
| --- | --- | --- |
| `pull-request.yml` | Pull request opened or pushed | `verify`, then `preview`: builds the app, runs `wrangler preview --name pr-<number>` and comments the preview URL on the pull request, updating the comment on every push. A new push cancels the previous run. |
| `deploy.yml` | Merge to `main` | `verify`, then `deploy`: builds the app and runs `wrangler deploy`. Deploys run one at a time in merge order and are never cancelled. |
| `preview-cleanup.yml` | Pull request closed | Deletes the pull request's preview |

- **Credentials.** The jobs read the repository secret `CLOUDFLARE_API_TOKEN` and the variable `CLOUDFLARE_ACCOUNT_ID`.
  Until the variable is set, the Cloudflare jobs are skipped and only `verify` runs.
- **Migrations and the preview Workflows.** Once D1 arrives, `deploy` runs
  `wrangler d1 migrations apply hoa --remote`, `wrangler deploy`, then `wrangler deploy --env preview-workflows` (so
  previews' Workflows follow `main`). `preview` runs `wrangler d1 migrations apply hoa-preview --remote --env preview-workflows`
  before `wrangler preview`. Databases are named explicitly so a pull request can never migrate the demo's database.
- **Previews are isolated from the demo's data.** The `previews` block in `wrangler.jsonc` binds the `hoa-preview` bucket
  (and later a preview D1 database). Previews share those with each other, so **migrations must stay backward
  compatible**: a preview may run old code against a newer schema. Worker secrets for previews are set once with
  `wrangler preview base-config secret put`.
- **Workflows are the exception.** A preview binds to an already deployed Workflow rather than getting its own, so a
  second Worker, `hoa-preview`, deploys preview copies of the Workflows from `main`, and previews bind to those. Workflow
  code changed in a pull request isn't exercised by that pull request's preview; it's covered by tests and checked on
  the demo after merging.
- **Access.** Cloudflare Access can protect the demo's `workers.dev` hostname and preview URLs. Without it they're
  public, and anyone with a link can run model calls on the project's keys.
- **Why not Workers Builds.** Cloudflare's GitHub integration needs no API token, but it deploys whether or not CI
  passes, and it's configured only in the dashboard, which is awkward for a pnpm monorepo.