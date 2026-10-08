# MCP servers

The repository configures three MCP servers for coding agents, so an agent can read prompts, traces and model data, and
add UI components, while building features. Claude Code reads [`.mcp.json`](../.mcp.json); VS Code (Copilot) reads
[`.vscode/mcp.json`](../.vscode/mcp.json). Neither file holds a secret.

| Server       | Endpoint                                         | Auth                                          |
| ------------ | ------------------------------------------------ | --------------------------------------------- |
| `langfuse`   | `https://us.cloud.langfuse.com/api/public/mcp`   | Basic auth with the `arc-review` project's API keys |
| `openrouter` | `https://mcp.openrouter.ai/mcp`                  | Browser OAuth on first use                    |
| `shadcn`     | `npx shadcn@latest mcp` (local)                  | None                                          |

The shadcn server browses and installs components from the shadcn registry into an app with a `components.json`
(`apps/hoa`), so agents add real shadcn components instead of hand-building them.

## Langfuse

Langfuse API keys are scoped to one project, so the MCP server only sees the `arc-review` project in the `hoa`
organization. Create the project and its API
keys in Langfuse first, put them in `apps/hoa/.env`, then produce the auth token:

```sh
pnpm --filter hoa auth:langfuse
```

- **Claude Code:** set the output as the `LANGFUSE_MCP_BASIC_AUTH` environment variable before starting `claude`. The
  `.mcp.json` header expands it.
- **VS Code:** start the server and paste the output when prompted for `langfuse-basic-auth`.

Both read and write tools are enabled, including prompt management. See the
[Langfuse MCP docs](https://langfuse.com/docs/api-and-data-platform/features/mcp-server).

## OpenRouter

The first connection opens an OAuth consent screen that mints a dedicated key (7-day expiry and a $10 spend cap by
default, editable on that screen). Approve it only when you started the connection yourself. In Claude Code, run
`/mcp`, select **openrouter** and choose **Authenticate**.

Most tools are read-only lookups: models, pricing, credit balance and usage. A few, such as sending a message or
generating an image, make billable calls. The server is for building; the app calls the OpenRouter API directly. See the
[OpenRouter MCP docs](https://openrouter.ai/docs/guides/overview/mcp-server).

## Cost tracking

OpenRouter Broadcast sends every request, with OpenRouter's billed cost, to the `arc-review` Langfuse project. Turn it on in
OpenRouter under **Settings > Observability** after connecting the Langfuse project's keys. See
[Broadcast to Langfuse](https://openrouter.ai/docs/guides/features/broadcast/langfuse).
