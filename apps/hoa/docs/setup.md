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

Before the demo is hosted (phase 3), create a second workspace for the demo and previews, with its own key and the same
Broadcast destination with **privacy mode** on: Langfuse then receives cost, usage and timing but no prompt or
completion text, because hosted environments can hold real application packets
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
| `OPENROUTER_API_KEY` (secret) | Model calls. Without it, AI features report that it's missing. | Development workspace key | Demo workspace key | Demo workspace key |
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

```sh
pnpm --filter hoa dev
```

Open <http://localhost:3000> and select **Run model check**. It reports the response, prompt version, latency, tokens,
cost and Langfuse trace ID, which confirms each connection.

## Cloudflare (from phase 1)

One-time setup when the app moves onto Workers ([design/platform.md](design/platform.md)):

1. Put the Cloudflare account on the **Workers Paid** plan.
2. Sign in: `pnpm --filter hoa exec wrangler login`.
3. Create the R2 buckets `hoa-dev`, `hoa-preview` and `hoa-files`. Give each a CORS rule allowing `PUT` from its
   environment's origins (`http://localhost:3000` for `hoa-dev`), and create an R2 API token with object read and write
   access scoped to each bucket.
4. Create the D1 databases `hoa` and `hoa-preview`, and put their ids in `wrangler.jsonc`.
5. Prepare the local database and types:
   `pnpm --filter hoa db:migrate:local`, `pnpm --filter hoa db:seed:local` and `pnpm --filter hoa cf-typegen`.
