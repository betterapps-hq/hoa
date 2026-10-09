# Setup

The app runs without credentials, but AI features need an OpenRouter key, tracing and prompt management need a Langfuse
project, and OCR needs Azure Document Intelligence. Each platform gets a project dedicated to hoa so costs, traces and
prompts stay separate from other apps.

## 1. Langfuse project

1. In Langfuse (US region), in the `hoa` organization, create a project named `arc-review`.
2. Under the project's **Settings > API Keys**, create a key pair.

All environments trace to this one project and are told apart by `LANGFUSE_TRACING_ENVIRONMENT`.

## 2. OpenRouter

1. Create an API key for hoa under **Settings > Keys**, in a workspace used only for development.
2. Under **Settings > Observability**, turn on **Broadcast**, edit **Langfuse**, enter the `arc-review` project's
   public and secret keys (base URL `https://us.cloud.langfuse.com`) and select **Test Connection**. The configuration
   only saves when the test passes.

Broadcast sends every OpenRouter request to Langfuse as a generation with its token usage, billed cost and timing. See
[ai.md](ai.md#tracing-and-cost) for how it nests under the app's spans.

The demo and previews use the same key and Broadcast destination as development, with full content in Langfuse. Before
real HOAs onboard, they move to their own workspace with Broadcast's **privacy mode** on
([design/documents.md](design/documents.md#privacy-and-retention)).

## 3. Azure Document Intelligence

The resource `hoa-document-intelligence` (resource group `hoa`, West US 2, Standard tier) already exists. Its endpoint
and key are under **Keys and Endpoint** in the Azure portal. See [design/ocr.md](design/ocr.md#resource).

## 4. Local credentials

Copy [`.env.example`](../.env.example) to `apps/hoa/.env` and fill in the keys. `.env` is git-ignored. Keep local
settings in `.env` only: don't create a `.dev.vars`, because Wrangler ignores `.env` when one exists.

## Settings

Every setting, where it's set, and its value per environment. Preview and demo values arrive with Cloudflare hosting:
non-secret values in `wrangler.jsonc` `vars` (preview values in its `previews` block), secrets through
`wrangler secret put` ([design/platform.md](design/platform.md#app-wiring)).

| Variable | Purpose | Development (`.env`) | Preview | Demo |
| --- | --- | --- | --- | --- |
| `OPENROUTER_API_KEY` (secret) | Model calls. Without it, AI features report that it's missing. | hoa key | Same | Same |
| `OPENROUTER_MODEL` | Main model; defaults to `anthropic/claude-haiku-5.5` | Default | Default | Default |
| `OPENROUTER_SMALL_MODEL` (phase 1) | Routing, structure and classification; defaults to the main model | Default | Default | Default |
| `LANGFUSE_PUBLIC_KEY` (secret) | Tracing and prompt management | `arc-review` key | `arc-review` key | `arc-review` key |
| `LANGFUSE_SECRET_KEY` (secret) | Tracing and prompt management | `arc-review` key | `arc-review` key | `arc-review` key |
| `LANGFUSE_BASE_URL` | Defaults to the US cloud region | Default | Default | Default |
| `LANGFUSE_PROMPT_LABEL` | Prompt label to fetch; defaults to `production` | `production`, or a test label while tuning | `production` | `production` |
| `LANGFUSE_TRACING_ENVIRONMENT` | Langfuse environment; defaults to `development` | `development` | `preview` | `production` |
| `AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT` | OCR | The resource's endpoint | Same | Same |
| `AZURE_DOCUMENT_INTELLIGENCE_KEY` (secret) | OCR | The resource's key | Same | Same |
| `R2_ACCOUNT_ID` (phase 1) | Presigned R2 URLs | Cloudflare account id | Same | Same |
| `R2_BUCKET` (phase 1) | The environment's bucket | `hoa-dev` | `hoa-preview` | `hoa-files` |
| `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` (secrets, phase 1) | Presigned R2 URLs | Token scoped to `hoa-dev` | Token scoped to `hoa-preview` | Token scoped to `hoa-files` |

The [MCP servers](../../../docs/mcp-servers.md) page covers connecting coding agents to the same Langfuse project and to
OpenRouter.

## 5. Run

Sign in to Cloudflare once (step 6), then prepare the local database:

```sh
pnpm --filter hoa db:migrate:local
pnpm --filter hoa db:seed:local
```

```sh
pnpm --filter hoa dev
```

The server runs inside workerd, Cloudflare's runtime, through its Vite plugin, using `wrangler.jsonc`'s `dev`
environment: D1 is simulated on disk under `apps/hoa/.wrangler`, and R2 is the real `hoa-dev` bucket. Open
<http://localhost:3000>.

To review applications before the rules UX exists, publish the committed sample rulebook into the local database:

```sh
pnpm --filter hoa db:seed:sample
```

It approves every record of `samples/declaration/rules.json`, publishes it as the HOA's rulebook and stores the rules
file in Wrangler's local R2. The dev server reads R2 from the `hoa-dev` bucket, so add `--dev-bucket` to put the file
there instead (`pnpm --filter hoa db:seed:sample --dev-bucket`).

To start the rules over, empty the local rulebooks, rules, sections, provisions and reviews with their stored objects:

```sh
pnpm --filter hoa db:reset:rules
```

Uploaded documents and applications stay; applications go back to drafts. Add `--dev-bucket` to delete the objects
from the `hoa-dev` bucket rather than Wrangler's local R2. Neither command touches the preview or demo environments.

Before building the rulebook from the sample documents, tell the build how they're structured (the Declaration's
Exhibit C is the use restrictions, a document of its own):

```sh
pnpm --filter hoa db:structure:sample
```

To run the build in process on the cached page records in `.fixtures/ocr/` (evaluation round 1), with the real models
and Langfuse tracing, run `pnpm eval:encoding` from `apps/hoa` with `--split dev|test|all`, `--documents` and
optionally `--units` (provision or document keys). It writes the draft, every step's output, the issues and a report
to `.fixtures/eval/encoding/<run id>/`, and caches model results in `.fixtures/eval/encoding/cache/`.

After changing `src/db/schema.ts`, run `pnpm --filter hoa db:generate` and commit the new migration. Migrations must
stay backward compatible, since pull request previews share one database: add tables and nullable columns, and read
the generated SQL (Drizzle Kit's table rebuilds can copy columns the old table doesn't have). After changing
`wrangler.jsonc`, regenerate the binding types with `pnpm --filter hoa cf-typegen` and commit
`worker-configuration.d.ts`.
## 6. Cloudflare and deployment

One-time setup for the demo and pull request previews ([design/platform.md](design/platform.md#cicd)):

1. Sign in from the app folder (`cd apps/hoa`, then `pnpm exec wrangler login`). Through `pnpm --filter`, Wrangler's
   login starts twice and fails on its callback port.
2. Create the R2 buckets `hoa-files`, `hoa-preview` and `hoa-dev` (`wrangler r2 bucket create <name>`), and the D1
   databases `hoa`, `hoa-preview` and `hoa-dev` (`wrangler d1 create <name>`); their ids go in `wrangler.jsonc`.
3. Set the demo's secrets with `wrangler secret put <name>`, and the previews' with
   `wrangler preview base-config secret put <name>`: `OPENROUTER_API_KEY`, `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`
   and `AZURE_DOCUMENT_INTELLIGENCE_KEY`.
4. In the Cloudflare dashboard, turn on Cloudflare Access for the `hoa` Worker's `workers.dev` hostname and its preview
   URLs, so only invited people can open them.
5. Create a Cloudflare API token from the **Edit Cloudflare Workers** template. In the GitHub repository, store it as
   the secret `CLOUDFLARE_API_TOKEN` (`gh secret set CLOUDFLARE_API_TOKEN`), and set the variable
   `CLOUDFLARE_ACCOUNT_ID` (`gh variable set CLOUDFLARE_ACCOUNT_ID`). Setting the variable turns on the deploy and
   preview jobs.

The deploy and pull request pipelines apply migrations and the seed before deploying.
