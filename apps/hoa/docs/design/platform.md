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
can show progress. Step names are deterministic, built from the stage id and the item id.

```text
DocumentIngest(documentId)                        started by completeUpload for a governing document
  hash ─> ocr-submit:{range} ─> ocr-poll:{range} ─> pages:{range} ─> figures:{figureId}
  sets the document ready, or failed with its error

RulebookBuild(hoaId, rulebookId, documentIds)     started by startRulebookBuild; documents must be ready
  resolve-prompts
  structure:{documentId} ─> route:{sectionId}
  extract:{sectionId}                              fan-out with Promise.allSettled; failures recorded on the job
  verify ─> consolidate:{projectType} ─> save-draft
  ends; review and publishing are server functions

ApplicationReview(applicationId)                  started by submitApplication
  resolve-prompts
  for each file: hash ─> media (Word images) ─> ocr-submit / ocr-poll / pages ─> visuals
  classify:{fileId} ─> facts ─> documents ─> qualitative:{ruleId}:{componentId} ─> evaluate ─> decide ─> write
  save-review
```

Stage ids match [extraction.md](extraction.md#stages) and [review.md](review.md#stages). Each workflow instance is one
Langfuse session: the job id is the session id.

Publishing isn't a workflow step. `publishRulebook` checks the publish gate ([extraction.md](extraction.md#9-publish))
and runs one D1 batch, so an administrator can take as long as they like to review a draft. Starting a build while a
draft exists replaces the draft.

## Caching

Two separate mechanisms:

1. **Within one instance**, Workflows checkpoint completed steps, so a retried or resumed instance skips them. This only
   works because step names are deterministic.
2. **Across instances**, model steps check a content cache in R2 before calling the model:
   `hoas/{hoaId}/cache/{stage}/{key}.json`, where `key` is the SHA-256 of the stage, the compiled input, the prompt
   name and version, the model id and `catalogVersion`. A rebuild or a **Retry** therefore pays only for calls whose
   input, prompt, model or catalog changed.

The first step of every workflow resolves each prompt label to a version and stores the versions on the job; later steps
use those versions. Per-job outputs are written to `hoas/{hoaId}/jobs/{jobId}/{stage}/{itemId}.json`.

## Errors and retries

| Step kind | Retries | Backoff | Timeout |
| --- | --- | --- | --- |
| Model call | 3 | Exponential from 10 s | 5 min |
| Layout submit | 3 | Exponential from 5 s | 1 min |
| Layout poll | Polls every 5 s with `step.sleep`, up to 15 min | | 30 s per check |
| R2 and D1 work | 2 | 1 s | 1 min |

- **Permanent errors fail fast.** Steps throw `NonRetryableError` for file validation failures, Azure 4xx responses
  other than 429, and unsupported content.
- **Fan-outs don't fail the whole job.** Per-section extraction and per-rule qualitative checks run under
  `Promise.allSettled`; a failed item is recorded in the job's `failures` and handled as
  [extraction.md](extraction.md#4-extract) and [review.md](review.md#errors) describe. A build with failures ends as
  `completed-with-errors`.
- **Everything else fails the job.** The workflow body catches the error and, in a final step, sets the job and its
  subject (document, rulebook or application) to `failed` with `error: { stage, message, isRetryable }`. The UI shows
  the message and a **Retry** action that starts a new instance; the content cache makes it cheap.

## Server functions

The UI talks to the pipeline only through these. None of them take `hoaId` or the user as input: both come from
`getRequestContext()` ([documents.md](documents.md#phase-1-assumptions)). Each checks the role and access rules.

| Function | Role | Input | Output |
| --- | --- | --- | --- |
| `createUpload` | Administrator (governing), homeowner (application) | Target, file name, type, size; document kind and title, or application id | Record id, presigned `PUT` URL |
| `completeUpload` | Same | Record id | Job id, for governing documents |
| `getJob` | Any | Job id | `Job` |
| `listDocuments` | Any | | `GoverningDocument[]` |
| `startRulebookBuild` | Administrator | Document ids | Job id, rulebook id |
| `getRulebook` | Administrator for drafts, any for published | `draft` or `published` | Rulebook and rules |
| `saveRule` | Administrator | Rule id (or none, to add), edited fields | `Rule`, re-verified |
| `reviewRule` | Administrator | Rule id, approve or reject, note | `Rule` |
| `publishRulebook` | Administrator | Rulebook id | `Rulebook`, or the reasons it's blocked |
| `getPage` | Per access rules | Document or file id, page index | `Page`, with presigned figure URLs |
| `getFileUrl` | Per access rules | Document or file id | Presigned `GET` URL |
| `createApplication` | Homeowner | Project type, description | `Application` |
| `submitApplication` | Homeowner | Application id | Job id |
| `getApplication` | Owner or administrator | Application id | Application, files and review |
| `recordDecision` | Administrator | Application id, outcome, note | `Application` |

The UI polls `getJob` every 2 seconds with TanStack Query's `refetchInterval` until the job ends, and shows progress in
the units the job reports ("Extracting rules: 12 of 40 sections").

## App wiring

A sketch of `apps/hoa/wrangler.jsonc`; names are final, keys are checked against the docs when implementing:

```jsonc
{
  "name": "hoa",
  "main": "src/server.ts",
  "compatibility_date": "2026-10-01",
  "compatibility_flags": ["nodejs_compat"], // AsyncLocalStorage for tracing context
  "d1_databases": [{ "binding": "DB", "database_name": "hoa", "database_id": "…", "migrations_dir": "migrations" }],
  "r2_buckets": [{ "binding": "FILES", "bucket_name": "hoa-files" }],
  "workflows": [
    { "name": "hoa-document-ingest", "binding": "DOCUMENT_INGEST", "class_name": "DocumentIngest" },
    { "name": "hoa-rulebook-build", "binding": "RULEBOOK_BUILD", "class_name": "RulebookBuild" },
    { "name": "hoa-application-review", "binding": "APPLICATION_REVIEW", "class_name": "ApplicationReview" }
  ],
  "triggers": { "crons": ["0 9 * * *"] }, // retention sweep
  "vars": {
    "OPENROUTER_MODEL": "anthropic/claude-haiku-5.5",
    "OPENROUTER_SMALL_MODEL": "anthropic/claude-haiku-5.5",
    "LANGFUSE_BASE_URL": "https://us.cloud.langfuse.com",
    "LANGFUSE_PROMPT_LABEL": "production",
    "LANGFUSE_TRACING_ENVIRONMENT": "production",
    "AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT": "https://hoa-document-intelligence.cognitiveservices.azure.com/",
    "R2_ACCOUNT_ID": "…",
    "R2_BUCKET": "hoa-files"
  },
  "previews": {
    // preview D1 database and hoa-preview bucket, Workflow bindings to the hoa-preview Worker,
    // LANGFUSE_TRACING_ENVIRONMENT "preview", R2_BUCKET "hoa-preview"
  },
  "env": {
    "dev": {
      // local D1 and Workflows; FILES bound to the hoa-dev bucket with "remote": true;
      // LANGFUSE_TRACING_ENVIRONMENT "development", R2_BUCKET "hoa-dev"
    }
  }
}
```

- `vite.config.ts` adds `cloudflare({ viteEnvironment: { name: "ssr" } })`. `src/server.ts` exports TanStack Start's
  handler as `fetch`, the retention sweep as `scheduled`, and the three Workflow classes.
- Server code reads bindings with `import { env } from "cloudflare:workers"`. `wrangler types` generates
  `worker-configuration.d.ts`, which is committed so `check:types` works in CI.
- Secrets (`OPENROUTER_API_KEY`, `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `AZURE_DOCUMENT_INTELLIGENCE_KEY`,
  `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`) are set with `wrangler secret put` for the demo, and once for the preview
  configuration. Locally they stay in `apps/hoa/.env`; there's no `.dev.vars`, because Wrangler ignores `.env` when one
  exists. Every setting and its value per environment is in [setup.md](../setup.md).
- Presigned URLs are signed with `aws4fetch` using an R2 API token per environment, scoped to that environment's bucket.
  Each bucket has a CORS rule allowing `PUT` from its environment's origins (`http://localhost:3000` for `hoa-dev`).

## Local development

`pnpm dev` runs the app inside workerd, Cloudflare's runtime, through the Vite plugin with `CLOUDFLARE_ENV=dev`. D1 and
Workflows are simulated on disk. R2 is the real `hoa-dev` bucket through a remote binding, because both presigned
browser uploads and Layout's `urlSource` need a real S3 endpoint, which local R2 doesn't have. Model calls, OCR and
Langfuse go to the real services. The code path is the same in every environment.

Scripts in `apps/hoa`: `db:migrate:local` (`wrangler d1 migrations apply DB --local`), `db:seed:local` (the demo HOA),
and `cf-typegen` (`wrangler types`).

## Tracing on Workers

The riskiest dependency, so it's the first thing phase 1 proves. Langfuse's OpenTelemetry processor isn't documented
for Workers, and one report of out-of-memory errors was fixed by exporting every span immediately.

`telemetry.server.ts` changes from `NodeTracerProvider` to:

- a `BasicTracerProvider` from `@opentelemetry/sdk-trace-base` with `LangfuseSpanProcessor` in immediate export mode
  (as today);
- `trace.setGlobalTracerProvider(provider)`;
- `context.setGlobalContextManager(new AsyncLocalStorageContextManager().enable())` from
  `@opentelemetry/context-async-hooks`. Without a context manager, `propagateAttributes` silently stops putting the trace
  name and session id on spans, and evaluators and dashboards filter on them;
- `ctx.waitUntil(provider.forceFlush())` at the end of each request, and a flush at the end of each Workflow step.

A test under the Workers Vitest pool checks that a span exported from `runTextPrompt` carries `langfuse.trace.name` and
`session.id`.

## Code layout and tests

```text
src/db/          Drizzle schema and repositories (*.server.ts)
src/storage/     R2 keys and presigning
src/ocr/         Layout client (fetch) and the page builder
src/pipeline/    stage logic as pure functions: structure, verify, consolidation, evaluate, decide
src/workflows/   the three Workflow classes (*.server.ts): thin wiring of steps to stage logic
src/server.ts    the Worker entry
migrations/      D1 migrations
```

- Stage logic and the page builder are pure and unit-tested with co-located tests, the page builder against trimmed
  Layout responses from the governing documents (never application data).
- Workflow classes are excluded from coverage, like other `*.server.ts` wiring.
- Repositories, migrations and the tracing test run in a second Vitest project using `@cloudflare/vitest-pool-workers`,
  which provides real D1 and R2 bindings.
- `wrangler` is an `apps/hoa` dev dependency, so knip treats `src/server.ts` as an entry. The Gotchas in
  `.github/copilot-instructions.md` gain one line: regenerate `worker-configuration.d.ts` with
  `pnpm --filter hoa cf-typegen` after changing `wrangler.jsonc`.

## Dependencies

| Added | For |
| --- | --- |
| `wrangler`, `@cloudflare/vite-plugin`, `@cloudflare/vitest-pool-workers` (dev) | Running, testing and deploying on Workers |
| `drizzle-orm`, `drizzle-kit` (dev) | D1 schema, queries and migrations |
| `aws4fetch` | Presigned R2 URLs |
| `@opentelemetry/sdk-trace-base`, `@opentelemetry/context-async-hooks` | Tracing on Workers |
| `@tanstack/react-query` | Polling jobs |
| `fflate` | Unzipping Word files' images |
| `ulid` | Rule ids |

Removed: `@opentelemetry/sdk-trace-node`, and `mammoth` (Layout reads Word text). Azure is called with `fetch`; no
Azure SDK. `docs/tech-stack.md` is updated in the same change: Cloudflare Workers, D1, R2 and Workflows replace nitro,
Neon, `@vercel/blob` and trigger.dev.

## CI/CD

Hosted on GitHub as a private repository, `AndrewCraswell/hoa`.

| Trigger | What runs |
| --- | --- |
| Pull request | GitHub Actions runs `pnpm verify` (the existing `.github/workflows/ci.yml`). Workers Builds applies migrations to the preview database, builds a **preview** and comments its URL on the pull request. |
| Merge to `main` | Workers Builds runs `pnpm exec wrangler d1 migrations apply DB --remote && pnpm exec wrangler deploy` from `apps/hoa`. |

- **Workers Builds** is Cloudflare's GitHub integration: it needs no API token in GitHub and caches the pnpm store. The
  build variable `PNPM_VERSION=12.10.1` overrides its default pnpm. The app depends on workspace packages, so the build
  command installs from the repository root.
- **Previews are isolated from the demo's data.** The `previews` block binds a preview D1 database and the `hoa-preview`
  bucket. Previews share those with each other, so **migrations must stay backward compatible**: a preview may run old
  code against a newer schema.
- **Workflows are the exception.** A preview binds to an already deployed Workflow rather than getting its own, so a
  second Worker, `hoa-preview`, deploys preview copies of the Workflows from `main`, and previews bind to those. Workflow
  code changed in a pull request isn't exercised by that pull request's preview; it's covered by tests and checked on
  the demo after merging.
- **Access first.** Cloudflare Access protects the demo hostname and preview URLs before previews are turned on.
- **Fallback.** If Workers Builds proves awkward in the monorepo, GitHub Actions with `cloudflare/wrangler-action` runs
  the same commands, using `wrangler preview` on pull requests and commenting the URL.
