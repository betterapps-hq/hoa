# Preferred Tech Stack

The tools we reach for **first**. Prefer them before introducing an alternative for the same job.

> **Deviating from this list requires a discussion with a human.** If a task seems to need a library that isn't here (or
> a different one than what's listed), raise it — in the issue or PR — and get agreement before adding it. Don't
> silently swap in a different tool.

**Legend:** ✅ = already wired into this repo · ◻️ = preferred choice, add when the need arises.

## Developer experience

- ✅ **pnpm** — package manager (workspaces, catalog, hoisted linker).
- ✅ **Turborepo** — task runner + caching.
- ✅ **Vite** — bundler / dev server.
- ✅ **oxlint** — linter · **oxfmt** — formatter.
- ✅ **knip** — unused files / deps / exports.
- ✅ **npm-run-all2** — script orchestration (`run-s` / `run-p`).
- ✅ **lefthook** — git hooks.
- ✅ **Dependabot** — dependency update PRs.
- ✅ **beachball** — versioning + changelogs (`pnpm change` to add change files; `pnpm change:release` to bump +
  publish).

## Backend / full-stack

- ✅ **@tanstack/react-start** — full-stack React (SSR, server functions) on Vite.
- ✅ **Cloudflare Workers** — hosting, through **@cloudflare/vite-plugin** (the dev server runs in workerd) and **wrangler**
  (deploys, previews, bindings and `wrangler types`).

## AI

- ✅ **ai** (Vercel AI SDK) — model calls, structured output and streaming.
- ✅ **@openrouter/ai-sdk-provider** — the only model provider; reaches OpenAI and other models through OpenRouter.
- ✅ **Langfuse** — prompt management (`@langfuse/client`), app tracing (`@langfuse/otel` and `@langfuse/tracing` on
  `@opentelemetry/sdk-trace-base` with `@opentelemetry/context-async-hooks`), datasets, experiments and evaluators. Model generations, with billed cost, arrive
  through **OpenRouter Broadcast**, not the AI SDK's Langfuse integration.
- ◻️ **@ai-sdk/react** — `useChat` / `useObject` hooks for streaming AI UI.

## Testing

- ✅ **Vitest** — test runner · **happy-dom** — DOM environment · **@vitest/coverage-v8** — coverage.
- ✅ **@testing-library/react**, **user-event**, **jest-dom** — component testing.
- ◻️ **@playwright/test** — end-to-end browser tests.
- ◻️ **msw** — API mocking.
- ◻️ **Storybook** + **@storybook/react-vite** — component workshop, with **@storybook/addon-vitest** and
  **@storybook/addon-a11y**.
- ◻️ **@axe-core/playwright** — automated accessibility checks in Playwright/e2e.

## Core libraries

- ✅ **zod** — schema validation (Standard Schema; powers forms, server-function input and env parsing).
- ✅ **@t3-oss/env-core** — type-safe environment variables.
- ✅ **ts-pattern** — pattern matching / exhaustive unions · **ts-extras** — type-safe stdlib helpers.
- ✅ **tiny-invariant** — runtime assertions.
- ✅ **minisearch** — client-side search boxes: relevance ranking across words in paragraph text, with per-word typo and
  prefix matching; small, with no dependencies (Fuse.js is weaker on long text).
- ✅ **react-error-boundary** — error boundaries.
- ✅ **@tanstack/react-router** — type-safe, file-based routing through TanStack Start.
- ◻️ **@mantine/hooks** — React hooks catalog.
- ◻️ **date-fns** — date utilities.
- ◻️ **@tanstack/react-form** — forms, validated with Zod schemas and built from shadcn's `Field` components.
- ◻️ **@tanstack/react-hotkeys** — keyboard shortcuts (or `useHotkeys` from `@mantine/hooks`).

## UI & components

- ✅ **tailwindcss** v4 via **@tailwindcss/vite** — styling.
- ✅ **shadcn/ui** — the component system (preset `bd1gAJNo`: `base-vega` style on **@base-ui/react**, Zinc, Inter, **lucide-react** icons, large radius). Add
  components with `pnpm dlx shadcn@latest add <name>` from `apps/hoa`, or through the shadcn MCP server. Use its
  CSS-variable tokens (`bg-card`, `text-muted-foreground`, ...) consistently.
- ◻️ **recharts** — charts / data visualization.

## Markdown & rich text

Built on the **unified** (remark + rehype) ecosystem — the standard for parsing and transforming Markdown/HTML.

- ◻️ **react-markdown** — render Markdown as React components (no `dangerouslySetInnerHTML`); the default for showing
  Markdown content, including model output.
- ◻️ **remark-rehype** + **rehype-react** — build a custom Markdown→React pipeline directly on **unified** when
  `react-markdown` isn't flexible enough.

## State management

- ◻️ **zustand** — lightweight client state (default for local/global UI state).
- ◻️ **@tanstack/react-query** — server-cache layer for client-side data fetching beyond route loaders.

## Database & data layer

- ◻️ **drizzle-orm** + **drizzle-zod** + **drizzle-kit** — SQL ORM, zod schema bridge, and migrations.
- ✅ **Cloudflare D1** — the database (SQLite), through **drizzle-orm** and **drizzle-kit** migrations. Repository tests
  run against a local D1 from Wrangler's `getPlatformProxy`.

## Authentication

- ◻️ **better-auth** — self-hosted auth.

## File uploads

- ◻️ **react-dropzone** — drag-and-drop / file-picker hook; pairs with any upload target.
- ✅ **Cloudflare R2** — file storage. ◻️ **aws4fetch** signs presigned upload and download URLs.
- ◻️ **fflate** — reading pictures out of Word files.

## Observability

- ◻️ **@sentry/react** — error + performance monitoring.

## Background jobs & events

- ◻️ **Cloudflare Workflows** — durable multi-step jobs (OCR, rulebook builds, reviews), and **Cron Triggers** for
  scheduled work.

## Notifications

- ◻️ **resend** + **react-email** — transactional email.
