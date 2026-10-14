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

Everything else goes through the app, as it would for an association: upload the governing documents on the Rulebook
page, let the build draft the rulebook, review the draft and publish it; applications are reviewed against what's
published. Development uses Sudden Valley's Restrictive Covenants (`.fixtures/peers/sudden-valley/SV-Cov.pdf`): six
pages, and a build costs about $4.

To start the rules over, empty the local rulebooks, rules, sections, provisions and reviews with their stored objects
in the `hoa-dev` bucket:

```sh
pnpm --filter hoa db:reset:rules
```

Uploaded documents and applications stay; applications go back to drafts. It never touches the preview or demo
environments.

Components can be worked on alone in Storybook, at <http://localhost:6006>:

```sh
pnpm --filter hoa storybook
```

A component's stories sit next to it (`DocumentEncodingSteps.stories.tsx`) and give it the data it would get on the page, so
every state can be seen without running a build. Storybook builds with `.storybook/vite.config.ts`, the app's styles
and React without the Worker.

To run the rulebook build or one encoding step against the cached fixtures, see
[design/evaluation.md](design/evaluation.md).

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

## 7. MCP servers for coding agents

The repository configures MCP servers so a coding agent can read prompts, traces and model data, and add UI
components, while building features. Claude Code reads [`.mcp.json`](../../../.mcp.json); VS Code (Copilot) reads
[`.vscode/mcp.json`](../../../.vscode/mcp.json). Neither file holds a secret.

| Server       | Endpoint                                       | Auth                                               | Configured in    |
| ------------ | ---------------------------------------------- | -------------------------------------------------- | ---------------- |
| `langfuse`   | `https://us.cloud.langfuse.com/api/public/mcp` | Basic auth with the `arc-review` project's API keys | Both             |
| `openrouter` | `https://mcp.openrouter.ai/mcp`                | Browser OAuth on first use                         | Both             |
| `shadcn`     | `npx shadcn@latest mcp` (local)                | None                                               | Both             |
| `github`     | `https://api.githubcopilot.com/mcp/`           | Your GitHub Copilot sign-in                        | VS Code only     |

**Langfuse.** API keys are scoped to one project, so the server only sees `arc-review`. With the keys in
`apps/hoa/.env`, produce the auth token with `pnpm --filter hoa auth:langfuse`. For Claude Code, set the output as the
`LANGFUSE_MCP_BASIC_AUTH` environment variable before starting `claude`. For VS Code, start the server and paste the
output when prompted for `langfuse-basic-auth`. Read and write tools are enabled, including prompt management. See the
[Langfuse MCP docs](https://langfuse.com/docs/api-and-data-platform/features/mcp-server).

**OpenRouter.** The first connection opens an OAuth consent screen that mints a dedicated key (7-day expiry and a $10
spend cap by default, editable on that screen). Approve it only when you started the connection yourself. In Claude
Code, run `/mcp`, select **openrouter** and choose **Authenticate**. Most tools are read-only lookups of models,
pricing, credit balance and usage; a few, such as sending a message or generating an image, make billable calls. The
app calls the OpenRouter API directly, not through this server. See the
[OpenRouter MCP docs](https://openrouter.ai/docs/guides/overview/mcp-server).

**shadcn.** Browses and installs components from the shadcn registry into `apps/hoa`, so agents add real shadcn
components instead of hand-building them.

## Schema and binding changes

After changing `src/db/schema.ts`, run `pnpm --filter hoa db:generate` and commit the new migration. Migrations must
stay backward compatible, since every pull request preview shares one preview database: add tables and nullable
columns, and read the generated SQL (Drizzle Kit's table rebuilds can copy columns the old table doesn't have). Then
look at the change in the [diagram](erd.md).

After changing `wrangler.jsonc`, regenerate the binding types with `pnpm --filter hoa cf-typegen` and commit
`worker-configuration.d.ts`.

## Settings

Every setting, where it's set, and its value per environment. Development reads `.env`. Preview and demo non-secret
values are in `wrangler.jsonc` `vars` (preview values in its `previews` block), and their secrets are set with
`wrangler secret put` ([design/platform.md](design/platform.md#app-wiring)).

| Variable | Purpose | Development (`.env`) | Preview | Demo |
| --- | --- | --- | --- | --- |
| `OPENROUTER_API_KEY` (secret) | Model calls. Without it, AI features report that it's missing. | hoa key | Same | Same |
| `OPENROUTER_MODEL` | Main model; defaults to `anthropic/claude-haiku-5.5` | Default | Default | Default |
| `OPENROUTER_SMALL_MODEL` | Routing, structure and classification; defaults to the main model | Default | Default | Default |
| `ENCODING_CONCURRENCY` | Model calls a rulebook build stage runs at once; defaults to 16 ([design/encoding.md](design/encoding.md#cost-and-scale)) | Default | Default | Default |
| `LANGFUSE_PUBLIC_KEY` (secret) | Tracing and prompt management | `arc-review` key | `arc-review` key | `arc-review` key |
| `LANGFUSE_SECRET_KEY` (secret) | Tracing and prompt management | `arc-review` key | `arc-review` key | `arc-review` key |
| `LANGFUSE_BASE_URL` | Defaults to the US cloud region | Default | Default | Default |
| `LANGFUSE_PROMPT_LABEL` | Prompt label to fetch; defaults to `production` | `development` | `preview` | `production` |
| `LANGFUSE_TRACING_ENVIRONMENT` | Langfuse environment; defaults to `development` | `development` | `preview` | `production` |
| `AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT` | OCR | The resource's endpoint | Same | Same |
| `AZURE_DOCUMENT_INTELLIGENCE_KEY` (secret) | OCR | The resource's key | Same | Same |
| `R2_ACCOUNT_ID` | Presigned R2 URLs | Cloudflare account id | Same | Same |
| `R2_BUCKET` | The environment's bucket | `hoa-dev` | `hoa-preview` | `hoa-files` |
| `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` (secrets) | Presigned R2 URLs | Token scoped to `hoa-dev` | Token scoped to `hoa-preview` | Token scoped to `hoa-files` |
| `BETTER_AUTH_SECRET` (secret) | Signs sessions; required outside local development | Empty (a fixed local one) | Its own | Its own |
| `BETTER_AUTH_URL` | Where the app is served, for links in emails and Google's redirect; taken from the request when unset | Empty | Empty | The demo's address |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (secret) | "Continue with Google"; off unless both are set | Empty | Not set yet | Not set yet |
| `RESEND_API_KEY` (secret), `EMAIL_FROM` | Sign-in codes and invitations; without them, development prints each email to the log | Empty | Not set yet | Not set yet |
| `BETTER_AUTH_API_KEY` (secret) | Better Auth Infrastructure's dashboard of users and sign-ins; off when unset | The project's key | Not set | The project's key |
| `GOOGLE_MAPS_API_KEY` (secret) | The address search on units (Places API, New); off when unset | A key for the Places API (New) | Not set yet | Not set yet |
| `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` (secret) | Cloudflare Turnstile's bot check on signing in and sending codes; off unless both are set | Empty, or Cloudflare's test keys | Not set yet | Not set yet |
