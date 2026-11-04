# Platform: Cloudflare

How the design maps onto Cloudflare, and how local development and deployment work. Research for this page was done on
2026-10-08 against Cloudflare's documentation; limits and configuration keys change, so re-check them when implementing.

## Services

| Need | Service | Why |
| --- | --- | --- |
| Web app and API | **Workers**, running TanStack Start | Officially supported through Cloudflare's Vite plugin |
| Files: originals, OCR output, page records, reviews | **R2** | Large objects, free egress, private by default, presigned URLs for browser uploads |
| Metadata: HOAs, documents, provisions, jobs, rulebooks and their records, project types, applications | **D1** (SQLite), one shared database with an `organization_id` column | Small relational data; Drizzle support; 10 GB per database is far more than rules and metadata need |
| OCR, rulebook builds and application reviews | **Workflows** | Durable steps with retries, results checkpointed, survives the user closing the tab |
| Retention | **Cron Trigger** | A daily sweep deletes application data past `deleteAfter` ([documents.md](documents.md#privacy-and-retention)). Not built yet |

What lives in each store is listed in [documents.md](documents.md#what-lives-where).

Not used: **Workers AI `toMarkdown`** (doesn't OCR), **Vectorize** (a few hundred rules per HOA are filtered in SQL, no
semantic search needed), **Queues** (Workflows already cover our multi-step jobs; a Queue consumer's 15-minute cap and
lack of checkpoints suit independent tasks, not pipelines), and **one D1 database per HOA** (database bindings are
fixed at deploy time, so per-tenant databases can't be chosen at runtime; a shared database with `organization_id` is simpler and
ample).

Requires the **Workers Paid** plan ($5 a month minimum): the free plan's 10 ms of CPU per request and 50 subrequests rule
this workload out.

## Limits that shape the design

| Limit (Workers Paid) | Design response |
| --- | --- |
| 128 MB memory per Worker | Never load a whole PDF: browsers upload straight to R2, and Layout reads files through presigned URLs. Layout responses are analyzed in 50-page ranges, streamed to R2, and parsed one range at a time. Documents are limited to 300 pages. |
| 30 s CPU per request by default (configurable to 5 min) | Waiting on model calls uses almost no CPU; heavy work runs in Workflow steps |
| A request's work may be canceled when the client disconnects; `waitUntil` adds only 30 s | Anything longer than a quick call runs in a Workflow |
| Workflow step results up to 1 MiB; instance state up to 1 GB | Steps return R2 keys, not page text |
| Workflow step timeout defaults to 10 min per attempt | Every step sets its timeout and retries explicitly (see [Errors and retries](#errors-and-retries)) |
| 100 MB request body on Free and Pro zones | Uploads go directly to R2 with presigned `PUT` URLs, never through the Worker |
| D1: 2 MB per row, 100 KB per statement, 1,000 queries per invocation, no interactive transactions | Page text and step outputs live in R2; changes that must land together use `batch()` |
| R2: one write per second to the same key | Every write targets a new key |

## Workflows

Three workflows. Each takes ids, never content, and reports progress on its job row (`stage`, `done`, `total`) so the
UI can show it; a rulebook build also writes its whole step list to `progress_json` when it starts and moves it forward
as it goes. A stage's step names start with its stage id, then the item id, so names are deterministic.

```text
DocumentIngest(documentId)                        started by completeDocumentUpload
  load ─> resolve-prompts
  ocr:hash ─> per 50-page range: ocr:submit:{range} ─> ocr:poll:{range} ─> ocr:pages:{range} ─> ocr:labels
  visuals:{figureId}
  finish: the document ready, or failed with its error (a duplicate of an earlier upload fails)
  build-rulebook: requests a rulebook build once the document is ready

RulebookBuild(rulebookId)                         started by an upload's build-rulebook step, or startRulebookBuild
  load:sources ─> load ─> progress:start ─> resolve-prompts
  check                                            problems with the uploads' own records stop the build here
  structure:{documentId} ─> analyze:{documentId} ─> defined-terms:{documentKey} ─> plan
  find-rules:{unitId} ─> find-rules:check ─> find-rules:{unitId}:rerun ─> find-rules:resolve
  vocabulary:{groupId} ─> vocabulary:check ─> vocabulary:{groupId}:rerun ─> vocabulary-merge
  structure-rules:{batchId} ─> structure-rules:check:{round} ─> structure-rules:{batchId}:retry-{round}
                                                   ENCODING_CONCURRENCY model calls at a time (default 16)
  merge ─> consolidate
  save-draft ─> save-draft:scores ─> save-draft:finish
  follow-up:check ─> follow-up:ids ─> follow-up    another build, when the documents changed while this one ran
  ends; review and publishing are server functions

ApplicationReview(applicationId)                  started by runReview
  resolve-prompts ─> load
  ocr:list ─> ocr:media:{fileId} for Word files ─> ocr:pending
  per file, in parallel: ocr:hash:{fileId} ─> ocr:submit / ocr:poll / ocr:pages per range ─> visuals:{figureId}:{fileId}
  ocr:files
  classify:{fileId} ─> subjects ─> select ─> plan ─> facts:{group} ─> normalize ─> documents
  judgment:{ruleKey}:{entityId} ─> evaluate ─> decide ─> write ─> save-review
```

Stage ids are defined in [ocr.md](ocr.md#where-it-runs), [encoding.md](encoding.md#stages) and
[application-review.md](application-review.md#stages). Each workflow instance is one Langfuse session: the job id is the session id. A workflow
reads `organizationId` from its job row, not from its parameters.

An administrator can stop a running build (`stopRulebookBuild`): its job becomes `cancelled`, nothing is saved, and
the follow-up build isn't requested.

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
   Governing-document stages use `hoas/{organizationId}/cache/{stage}/{key}.json`. Application stages use
   `hoas/{organizationId}/applications/{applicationId}/cache/{stage}/{key}.json`, so the retention sweep removes them with the
   application.

The first step of every workflow, `resolve-prompts`, resolves each prompt label to a version and stores the versions on
the job; later steps load prompts by those versions. Prompts exist only in Langfuse: a prompt it can't serve fails the
step with a retryable error. Per-job outputs are written to
`hoas/{organizationId}/jobs/{jobId}/{stage}/{itemId}.json`.

## Errors and retries

| Step kind | Retries | Backoff | Timeout |
| --- | --- | --- | --- |
| Model call | 3 | Exponential from 10 s | 5 min; 15 min in a rulebook build |
| Layout submit | 3 | Exponential from 5 s | 1 min |
| Layout poll | 180, by throwing "not ready" (15 min) | Constant 5 s | 30 s per check |
| R2 and D1 work | 2 | 1 s | 1 min |

- **Permanent errors fail fast.** Steps throw `NonRetryableError` for file validation failures, Azure 4xx responses
  other than 429, and unsupported content.
- **Fan-outs don't fail the whole job.** Per-file OCR in a review, the build's per-section and per-batch calls, per-group fact reading and
  per-rule judgment checks run under `Promise.allSettled`; a failed item is recorded in the job's `failures` and handled as
  [encoding.md](encoding.md#8-structure-the-rules) and [application-review.md](application-review.md#stages) describe. A job with failures ends as
  `completed-with-errors`.
- **Everything else fails the job.** The workflow body catches the error and, in a final step, sets the job to `failed`
  with `error: { stage, message, isRetryable }`, and updates its subject: a document or rulebook becomes `failed`, an
  application goes back to the status it had before the review. A build an administrator stopped stays `cancelled`. The UI shows the message and a way to run it again;
  the content cache makes that cheap.

## Server functions

The UI talks to the pipeline only through these, defined in `src/features/**/*.functions.ts`. None of them take
`organizationId` or the user as input: both come from `getRequestContext()` ([documents.md](documents.md#demo-assumptions)).
Each checks the role and access rules.

| Function | Role | Input | Output |
| --- | --- | --- | --- |
| `createDocumentUpload` | Administrator | File name, type, size; kind, title, effective date, and optionally the `lineageId` it's a new version of or the lineage it amends | Document id, presigned `PUT` URL (or none, see `uploadDocumentFile`) |
| `uploadDocumentFile` | Administrator | Document id, the file as form data | Stores the file through the Worker, where the environment has no R2 token |
| `completeDocumentUpload` | Administrator | Document id | Job id; starts DocumentIngest |
| `removeGoverningDocument` | Administrator | Document id | Removes every version from builds and the documents list |
| `listDocuments` | Any | | `GoverningDocument[]` |
| `getDocumentPage` | Any | Document id, page index | One page's text and label, for the citation viewer |
| `getDocumentReading` | Any | Document id | The document's provisions in reading order with the text outside them |
| `getPageGeometry` | Any | Document id, page range (up to 25) | Page sizes and word boxes, for highlights on the original |
| `locateProvisions` | Any | Provision keys | The upload each is read in, and its heading |
| `getJobStatus` | Any | Job id | `Job` |
| `getActiveJob` | Any | Subject id | The latest job for a document, rulebook or application, so a reloaded page finds work in progress |
| `startRulebookBuild` | Administrator | | Job id, rulebook id; refused while a document is being read or another build runs |
| `stopRulebookBuild` | Administrator | | Whether the build was stopped or had already ended |
| `getBuildResults` | Administrator | Job id, cursor | What the running build has produced since the cursor |
| `getBuildDocuments` | Administrator | Job id | The documents the running build reads, with their provisions, once structured |
| `getRulebookView` | Administrator for the draft, any for the published | `draft` or `published` | The rulebook and its records |
| `getRulebookSources`, `getSourceText` | Any | | The documents and provisions the rules cite; page text no provision holds |
| `reviewRulebookRecords` | Administrator | Rulebook id, record refs, `proposed`, `approved` or `rejected` | Records updated, and those skipped with why |
| `resolveRulebookIssue` | Administrator | Rulebook id, issue ref, note | |
| `saveRulebookRule` | Administrator | Rulebook id, edited rule | The rule's remaining problems |
| `answerRulebookQuestion` | Administrator | Rulebook id, question id, chosen option, note | |
| `setProvisionNoRule` | Administrator | Rulebook id, provision key, reason or none | |
| `saveRulebookSettings` | Administrator | Rulebook id, settings clauses, policy | The settings' remaining problems |
| `discardRulebookDraft` | Administrator | Rulebook id | |
| `publishRulebook` | Administrator | Rulebook id | The new version, or the reasons it's blocked |
| `getPublishedRulesFileJson` | Any | | The published rules file, for download |
| `listActiveProjectTypes` | Any | | The project types homeowners can choose |
| `getProjectTypesOverview`, `getProjectTypeView`, `listCitableProvisions` | Administrator | Project type id for the view | Project types with their use, one type with its rules, passages to cite |
| `suggestProjectTypes` | Administrator | | Project types the published rulebook suggests (a model call) |
| `createProjectType`, `updateProjectType`, `applyProjectTypeUpdates` | Administrator | The type's details and form | `ProjectType`; the form is checked against the rules |
| `setProjectTypeStatus`, `deleteProjectType` | Administrator | Project type id, status | Archives, unarchives or deletes a type no application uses |
| `countOutdatedProjectTypes` | Any (0 for homeowners) | | Active types out of date with the published rulebook |
| `createApplication` | Any | Project type id or none | `Application` (`draft`, its form blank) |
| `saveApplication` | Owner | Application id, description, answers | Keeps the draft as it's edited, finished or not |
| `createApplicationUpload` | Owner | Application id, file name, type, size, what it is | File id, presigned `PUT` URL (or none) |
| `uploadApplicationFile`, `completeApplicationUpload`, `removeApplicationFile` | Owner | File id (and the file as form data) | Stores, confirms or removes a file |
| `setApplicationFileUploadedAs` | Owner | File id, what it is | Says which of the type's documents a file is, or other |
| `runReview` | Owner | Application id | Job id; allowed in `draft`, `reviewed` and `information-requested` once the required questions are answered |
| `submitApplication` | Owner | Application id, confirmation when the latest review requests information | `Application` (`submitted`); refused when it changed after the review |
| `deleteApplicationDraft` | Owner | Application id | Deletes a draft never submitted, with everything stored for it |
| `listApplications`, `listDashboardApplications` | Homeowner (their own), administrator (submitted ones, and their own) | | Applications with their latest recommendation |
| `getApplicationView` | Owner, or administrator once submitted | Application id | Application, its project type's form, files, latest review and earlier reviews, and what the viewer can do |
| `getPacketImage` | Owner, or administrator once submitted | Application id, file id | A presigned `GET` URL for a photo, or the image inline |
| `recordDecision` | Administrator | Application id, outcome, note | `Application` |
| `getDashboardSummary`, `getNextRulebook` | Any | | The dashboard's numbers; the coming rulebook, for administrators |
| `listRecentActivity` | Any | | What happened lately, newest first, with who did it: across the HOA's areas for administrators; a homeowner's applications and the rules for a homeowner ([dashboard.md](../dashboard.md)) |
| `getSession`, `setDemoRole` | Any | Role, to switch | The user, role and HOA |

Job progress polls `getJobStatus` every 2 seconds with TanStack Query's `refetchInterval` until the job ends. A
rulebook build shows its step list from `progress_json`: each step done, current, upcoming or skipped, with counts, one
bar for the whole build and an estimate of the time left.

## App wiring

`apps/hoa/wrangler.jsonc` is the source of truth; its shape is sketched below. Nothing at the top level reaches
`previews` or an `env` block: each repeats every var and binding it needs.

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
      "workflows": [ /* the three hoa-dev-* Workflows */ ]
    }
  }
}
```

- `src/server.ts` exports TanStack Start's handler as `fetch` and the three Workflow classes.
- Server code reads bindings with `import { env } from "cloudflare:workers"`. `src/env.server.ts` validates vars
  and secrets with t3-env, including `OPENROUTER_SMALL_MODEL`, `ENCODING_CONCURRENCY`, and the Azure and `R2_*`
  values. `wrangler types` generates `worker-configuration.d.ts`, which is committed so `check:types` works in CI.
- Secrets (`OPENROUTER_API_KEY`, `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `AZURE_DOCUMENT_INTELLIGENCE_KEY`,
  `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`) are set with `wrangler secret put` for the demo,
  `wrangler preview base-config secret put` for previews, and `wrangler secret put --env preview-workflows` for the
  preview Workflows Worker. Locally they stay in `apps/hoa/.env`; there's no `.dev.vars`, because Wrangler ignores `.env`
  when one exists. Every setting is listed in [setup.md](../setup.md).
- Presigned URLs are signed with `aws4fetch` using an R2 API token per environment, scoped to that environment's bucket.
  Each bucket has a CORS rule allowing `PUT` with the `Content-Type` header from its environment's origins.

## Local development

`pnpm dev` runs the app inside workerd, Cloudflare's runtime, through the Vite plugin. Model calls, OCR and Langfuse go
to the real services. `vite.config.ts` sets `process.env.CLOUDFLARE_ENV ??= "dev"` when serving, so development selects the
`dev` environment on every platform (a `CLOUDFLARE_ENV=dev` prefix in a pnpm script doesn't work in Windows' shell). R2
is then the real `hoa-dev` bucket through a remote binding, because presigned browser uploads and Layout's `urlSource`
both need a real S3 endpoint; D1 and Workflows stay simulated on disk. Scripts in `apps/hoa`: `db:migrate:local`
(`wrangler d1 migrations apply hoa-dev --local --env dev`), `db:seed:local` (the one HOA, the only seeded data),
`db:reset:rules` and `cf-typegen` (`wrangler types`). Documents, rulebooks and applications are made through the app,
never seeded: a seed writes states the app can't, which then pass for the app's own.

- **`db:reset:rules`** empties rulebooks, their records, provisions, referenced documents, rulebook-build
  and review jobs and reviews, with their objects in the `hoa-dev` bucket `pnpm dev` binds, through
  `getPlatformProxy` (`src/db/resetRules.ts`). Uploaded documents, applications (back to `draft`), model caches and
  settings stay. It never reaches the preview or demo databases or buckets.

## Tracing on Workers

Proven on workerd (2026-10-08): a prompt call's span arrived in Langfuse with its trace name, and
OpenRouter's generation and cost nested under it. `telemetry.server.ts` uses a `BasicTracerProvider` with
`LangfuseSpanProcessor` in immediate export mode, registered with `trace.setGlobalTracerProvider` and an
`AsyncLocalStorageContextManager` (which needs `nodejs_compat`). Without the context manager, `propagateAttributes`
silently stops putting the trace name and session id on spans.

Server functions await `flush()` before returning. Workflow steps await it at the end of each step.
`runPrompt.test.ts` checks that exported spans carry the trace name and session id, using the same registration.

## Code layout and tests

```text
src/db/             Drizzle schema and repositories
src/storage/        R2 keys, objects, page records, presigning and upload rules
src/ocr/            Layout client (fetch), the page builder and Word pictures
src/schema/         the rules schema: Zod types, core terms, validation
src/encoding/       the rulebook build's stages (buildRulebook); steps/ holds the step-by-step pipeline pnpm eval:step runs
src/rulebook/       saving drafts, carrying approvals forward, assembling and publishing the rules file, the sample seed
src/engine/         the decision engine: applicability, checks, evaluate, decide
src/review/         the application review's stages (reviewApplication)
src/projectTypes/   project types: forms built from the rules, binding, suggestions, updates
src/ai/             prompts, model calls, scores and tracing
src/jobs/           job records and their progress
src/text/           text normalization and matching: numerals, quantities, dates, quotes
src/evaluation/     scoring encoding and review runs against goldens
src/features/       UI features and their server functions (*.functions.ts)
src/routes/         TanStack Start routes
src/workflows/      the three Workflow classes: thin wiring of steps to stage logic
src/server.ts       the Worker entry
migrations/         D1 migrations
```

- Stage logic and the page builder are pure and unit-tested with co-located tests, the page builder against trimmed
  Layout responses from the governing documents (never application data). The decision engine's tests include the
  arborless gate, the arbor without lattice, and a conflicting fact.
- Repository tests run in the normal Vitest run, with v8 coverage: `src/tests/testDatabase.ts` starts an in-memory D1
  through Wrangler's `getPlatformProxy` and applies every migration. They cover only the rules the database itself
  enforces: unique and partial indexes, guarded updates, cascades, organization isolation, D1's statement limits and
  destructive resets. A test that saves records and reads them back would test Drizzle and SQLite, not our code, so
  there are none. A feature's decisions are pure functions tested without a database (such as `buildDecision`), and a
  permission check made before any query is tested against `src/tests/untouchedDatabase.ts`, whose every query throws.
  (Cloudflare's Vitest plugin still requires Vitest 4.)
- `src/server.ts`, `src/workflows/**` and `*.functions.ts` are excluded from coverage, alongside `*.server.ts`.
- `wrangler` is an `apps/hoa` dev dependency. `cloudflare:workers` resolves to a stub in unit tests
  (`vitest.config.ts`), and knip ignores it as a dependency.

## Dependencies

Cloudflare and storage: `wrangler`, `@cloudflare/vite-plugin` and `drizzle-kit` (dev), `drizzle-orm`, and `aws4fetch`
for presigned R2 URLs. Tracing: `@opentelemetry/sdk-trace-base` and `@opentelemetry/context-async-hooks`. UI:
`@tanstack/react-query` for polling jobs and `@tanstack/react-form` for forms. `fflate` reads pictures out of Word files;
Layout reads Word text. Azure is called with `fetch`, and ids come from `crypto.randomUUID()`.
[docs/tech-stack.md](../../../../docs/tech-stack.md) lists these.

## CI/CD

Hosted on GitHub as a public repository, `betterapps-hq/hoa`. Everything runs in GitHub Actions, and a deploy only
happens after `pnpm verify` passes. Both pipelines run it through the shared `ci-verify` template from
[`betterapps-hq/pipelines`](https://github.com/betterapps-hq/pipelines), at `main`, so HOA gets each change as it merges,
and set up their other jobs with its `setup` action.

| Workflow | Trigger | Jobs |
| --- | --- | --- |
| `pull-request.yml` | Pull request opened or pushed | `verify`, then `preview`: builds the app, runs `wrangler preview --name pr-<number>` and comments the preview URL on the pull request, updating the comment on every push. A new push cancels the previous run. Dependabot's and forks' pull requests get no preview. |
| `deploy.yml` | Merge to `main` | `verify`, then `deploy`: builds the app and runs `wrangler deploy`. Deploys run one at a time in merge order and are never cancelled. |
| `preview-cleanup.yml` | Pull request closed | Deletes the pull request's preview |
| `terraform.yml` | Pull request or merge to `main` that changes `infra/**` | `plan` on pull requests, `apply` on `main`, for `infra/web`, through the shared `terraform-plan` and `terraform-apply` templates |

- **Credentials.** The jobs read the repository secret `CLOUDFLARE_API_TOKEN` and the variable `CLOUDFLARE_ACCOUNT_ID`.
  Until the variable is set, the Cloudflare jobs are skipped and only `verify` runs. Dependabot's runs get only
  Dependabot secrets, so its pull requests, like forks', get no preview.
- **Turborepo's remote cache.** `verify` points Turbo at the cache every monorepo shares, `https://turbo.copacker.ai`,
  as team `hoa`, with the `TURBO_TOKEN` and `TURBO_REMOTE_CACHE_SIGNATURE_KEY` secrets. Until the repository has those,
  Turbo uses only its local cache.
- **Migrations and the preview Workflows.** `deploy` runs
  `wrangler d1 migrations apply hoa --remote`, `wrangler deploy`, then `wrangler deploy --env preview-workflows` (so
  previews' Workflows follow `main`). `preview` runs `wrangler d1 migrations apply hoa-preview --remote --env preview-workflows`
  before `wrangler preview`. Databases are named explicitly so a pull request can never migrate the demo's database.
- **Previews are isolated from the demo's data.** The `previews` block in `wrangler.jsonc` binds the `hoa-preview` bucket
  and D1 database. Previews share those with each other, so **migrations must stay additive**: a preview may run old
  code against a newer schema. Worker secrets for previews are set once with
  `wrangler preview base-config secret put`.
- **Workflows are the exception.** A preview binds to an already deployed Workflow rather than getting its own, so a
  second Worker, `hoa-preview`, deploys preview copies of the Workflows from `main`, and previews bind to those. Workflow
  code changed in a pull request isn't exercised by that pull request's preview; it's covered by tests and checked on
  the demo after merging.
- **Access.** Cloudflare Access can protect the demo's `workers.dev` hostname and preview URLs. Without it they're
  public, and anyone with a link can run model calls on the project's keys.
- **Infrastructure as code.** [`infra/web`](../../../../infra/web/main.tf) describes where the app deploys with the
  shared `cloudflare-web` Terraform module, at the commit of a `betterapps-hq/pipelines` release, as the first step of
  moving the previews and the demo's deploy onto the shared web templates. It manages:
  - **The `hoa` Worker:** that it exists, on `workers.dev` with preview URLs, as `wrangler.jsonc` has it. It's imported,
    not made again. Deploys still own its code, bindings, triggers and observability.
  - **The demo's settings in GitHub:** `CLOUDFLARE_ACCOUNT_ID`, `WEB_WORKER` (`hoa`), `WEB_URL` (its `workers.dev`
    address, the one `DEMO_URL` holds) and the secret `WEB_CLOUDFLARE_API_TOKEN`, written into the existing `demo`
    environment, which the module doesn't own.
  - **The `hoa-preview` Worker:** that it exists, off `workers.dev` with preview URLs, as `wrangler.jsonc`'s
    `preview-workflows` environment has it, with no custom domain and nothing in GitHub. It's imported too, and
    `deploy.yml` still deploys it.
  - **A `preview` environment** the module owns, naming `hoa` as the Worker previews are made of, with the same
    variables and token.
  - **One account-owned Cloudflare API token,** `hoa web deploys`, with Workers Scripts Write and D1 Write.

  Nothing reads these yet: `pull-request.yml`, `deploy.yml` and `preview-cleanup.yml` keep using the repository's
  `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` until they move onto the templates.
- **Plans and applies.** A pull request that changes `infra/` is planned with read-only credentials and gets the plan
  as a comment; once it merges, `main` plans again and applies in the `infrastructure` environment. The workflow forwards
  write credentials by name from organization or repository secrets; matching environment secrets override them.
  Manual runs also apply only from `main`. The state is in R2, at `hoa/web/terraform.tfstate` in the bucket the `TF_STATE_BUCKET` and
  `TF_STATE_ENDPOINT` repository variables name. It holds the deploy token's value, so the bucket stays private.
- **What Terraform is waiting on.** Until the credentials exist, the plan only checks formatting and validates, and the
  apply skips, each with a notice. Plans need the repository secrets `TF_STATE_READ_ACCESS_KEY_ID` and
  `TF_STATE_READ_SECRET_ACCESS_KEY` (R2 Object Read on the state bucket), `CLOUDFLARE_READ_API_TOKEN` (Workers Scripts
  Read and Account API Tokens Read) and `TF_GITHUB_READ_TOKEN` (read access to the repository's environments and their
  variables and secrets). Applies need `TF_STATE_ACCESS_KEY_ID` and
  `TF_STATE_SECRET_ACCESS_KEY` (R2 Object Read & Write), `CLOUDFLARE_API_TOKEN` (Workers Scripts Edit and Account API
  Tokens Edit) and `TF_GITHUB_TOKEN` (Environments and Administration write, Actions read), with its deployment
  branches kept to `main` where the plan supports environment protection. These names follow the shared pipelines'
  Terraform guide. HOA uses repository secrets and variables. It lives in the `betterapps-hq` organization as a public
  repository, so organization secrets can be shared with it too; a private repository in a GitHub Free organization
  can't receive them. Organization write secrets are available to selected repositories' workflows outside
  environments too, so only trusted repositories should be selected.
- **Enabling applies.** Configure `infrastructure` to deploy only from `main`, then set its environment variable
  `TF_APPLY_ENABLED` to `true`. The shared apply skips if that setting is absent, even when forwarded state keys exist.
  Do not set the marker at repository or organization level.
- **Why not Workers Builds.** Cloudflare's GitHub integration needs no API token, but it deploys whether or not CI
  passes, and it's configured only in the dashboard, which is awkward for a pnpm monorepo.
