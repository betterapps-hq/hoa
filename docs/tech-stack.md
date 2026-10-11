# Preferred Tech Stack

The tools we reach for **first**. Prefer them before introducing an alternative for the same job.

> **Deviating from this list requires a discussion with a human.** If a task seems to need a library that isn't here (or
> a different one than what's listed), raise it — in the issue or PR — and get agreement before adding it. Don't
> silently swap in a different tool.

**Legend:** ✅ means in use in this repo. ◻️ means the preferred choice, added when the need arises.

## Developer experience

- ✅ **pnpm** — package manager (workspaces, catalog, hoisted linker).
- ✅ **Turborepo** — task runner + caching.
- ✅ **Vite** — bundler / dev server.
- ✅ **oxlint** — linter.
- ✅ **oxfmt** — formatter.
- ✅ **knip** — unused files / deps / exports.
- ✅ **npm-run-all2** — script orchestration (`run-s` / `run-p`).
- ✅ **lefthook** — git hooks.
- ✅ **Dependabot** — dependency update PRs.

## Backend / full-stack

- ✅ **@tanstack/react-start** — full-stack React (SSR, server functions) on Vite.
- ✅ **Cloudflare Workers** — hosting, through **@cloudflare/vite-plugin** (the dev server runs in workerd) and **wrangler**
  (deploys, previews, bindings and `wrangler types`).

## AI

- ✅ **ai** (Vercel AI SDK) — model calls, structured output and streaming.
- ✅ **@openrouter/ai-sdk-provider** — the only model provider; reaches OpenAI and other models through OpenRouter.
- ✅ **Langfuse** — prompt management (`@langfuse/client`), app tracing (`@langfuse/otel` and `@langfuse/tracing` on
  `@opentelemetry/sdk-trace-base` with `@opentelemetry/context-async-hooks`) and datasets. Model generations, with
  billed cost, arrive through **OpenRouter Broadcast**, not the AI SDK's Langfuse integration.
- ◻️ **@ai-sdk/react** — `useChat` / `useObject` hooks for streaming AI UI.

## Testing

- ✅ **Vitest** — test runner, with **happy-dom** as the DOM environment and **@vitest/coverage-v8** for coverage.
- ✅ **@testing-library/react**, **user-event**, **jest-dom** — component testing.
- ◻️ **@playwright/test** — end-to-end browser tests.
- ◻️ **msw** — API mocking.
- ◻️ **Storybook** + **@storybook/react-vite** — component workshop, with **@storybook/addon-vitest** and
  **@storybook/addon-a11y**.
- ◻️ **@axe-core/playwright** — automated accessibility checks in Playwright/e2e.

## Core libraries

- ✅ **zod** — schema validation (Standard Schema; powers forms, server-function input and env parsing).
- ✅ **@t3-oss/env-core** — type-safe environment variables.
- ✅ **ts-pattern** — pattern matching and exhaustive unions.
- ◻️ **ts-extras** — type-safe stdlib helpers; the preferred helper library over hand-written type helpers. Add it as a
  dependency with its first use.
- ✅ **tiny-invariant** — runtime assertions.
- ✅ **minisearch** — client-side search boxes: relevance ranking across words in paragraph text, with per-word typo and
  prefix matching; small, with no dependencies (Fuse.js is weaker on long text).
- ✅ **@dnd-kit** (`core`, `sortable`, `utilities`) — reorderable lists: accessible sorting with keyboard and
  screen-reader support built in; small and maintained.
- ✅ **react-dropzone** — file drop zones: a headless `useDropzone` hook (styled with our components) that handles
  multiple files, accepted types, size limits with rejection reasons, keyboard and click-to-browse.
- ✅ **@tanstack/react-table** — data tables (shadcn's Data Table pattern, in `src/components/DataTable`): headless sorting,
  pagination, column visibility and a global filter we feed from minisearch, so tables keep our markup and accessibility.
- ✅ **react-error-boundary** — error boundaries.
- ✅ **@tanstack/react-router** — type-safe, file-based routing through TanStack Start.
- ✅ **@mantine/hooks** — React hooks catalog.
- ◻️ **date-fns** — date utilities.
- ✅ **@tanstack/react-form** — forms, validated with Zod schemas and built from shadcn's `Field` components.
- ◻️ **@tanstack/react-hotkeys** — keyboard shortcuts (or `useHotkeys` from `@mantine/hooks`).

## UI & components

- ✅ **tailwindcss** v4 via **@tailwindcss/vite** — styling.
- ✅ **shadcn/ui** — the component system (preset `bd1gAJNo`: `base-vega` style on **@base-ui/react**, Zinc, Inter,
  **lucide-react** icons, large radius). Add
  components with `pnpm dlx shadcn@latest add <name>` from `apps/hoa`, or through the shadcn MCP server. Use its
  CSS-variable tokens (`bg-card`, `text-muted-foreground`, ...) consistently.
- ◻️ **recharts** — charts / data visualization.

## Documents

- ✅ **pdfjs-dist** — renders an uploaded PDF's pages in the document reader's original view, with its text layer for
  selection; the standard browser PDF renderer, loaded only with that view.

## Markdown & rich text

Built on the **unified** (remark + rehype) ecosystem — the standard for parsing and transforming Markdown/HTML.

- ✅ **react-markdown** with **remark-gfm** — render Markdown as React components (no `dangerouslySetInnerHTML`); the
  default for showing Markdown content, including model output.
- ◻️ **remark-rehype** + **rehype-react** — build a custom Markdown→React pipeline directly on **unified** when
  `react-markdown` isn't flexible enough.

## State management

- ◻️ **zustand** — lightweight client state (default for local/global UI state).
- ✅ **@tanstack/react-query** — server-cache layer for client-side data fetching beyond route loaders.

## Database & data layer

- ✅ **Cloudflare D1** — the database (SQLite), through **drizzle-orm** and **drizzle-kit** migrations. Repository tests
  run against a local D1 from Wrangler's `getPlatformProxy`.
- ◻️ **drizzle-zod** — zod schemas generated from the Drizzle tables.

## Authentication

- ◻️ **better-auth** — self-hosted auth.

## File uploads

- ✅ **Cloudflare R2** — file storage, with **aws4fetch** signing presigned upload and download URLs. Drop zones use
  **react-dropzone** (see Core libraries).
- ✅ **fflate** — reading pictures out of Word files.

## Observability

- ◻️ **@sentry/react** — error + performance monitoring.

## Background jobs & events

- ✅ **Cloudflare Workflows** — durable multi-step jobs (document ingest, rulebook builds, application reviews).
- ◻️ **Cron Triggers** — scheduled work.

## Notifications

- ◻️ **resend** + **react-email** — transactional email.
