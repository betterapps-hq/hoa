---
root: true
targets: ["*"]
description: Project-specific instructions
---

# Project-specific guidance

Project-specific requirements below take precedence over shared recommendations when they differ.

# HOA agent guidance

- **Lint:** `oxlint` (not eslint). **Format:** `oxfmt` (not prettier).
- **Type-check:** native TypeScript 7.0.2 (pinned in the `pnpm-workspace.yaml` catalog) via `pnpm check:types`.
- **Test:** Vitest via `pnpm test`. **Build:** Vite (TanStack Start on Cloudflare Workers) via `pnpm build`.
- **Package manager:** pnpm `>=12` on Node `>=26`. **Tasks:** Turborepo.
- **Git hooks:** lefthook (pre-commit: `oxlint --fix` and `oxfmt`; pre-push: `check:types`). Don't use `--no-verify`.
- **AI:** Vercel AI SDK through OpenRouter. Every prompt lives in Langfuse prompt management and every model call is
  traced to Langfuse. See [apps/hoa/docs/ai.md](apps/hoa/docs/ai.md).
- **UI:** real shadcn/ui components (preset `bd1gAJNo`, `base-vega` on Base UI). Add missing ones with
  `pnpm dlx shadcn@latest add` in `apps/hoa` or the shadcn MCP server; never hand-build or hand-edit
  `src/components/ui/`.
- **Reuse first:** prefer `@mantine/hooks`, `ts-extras`, `ts-pattern`, and `tiny-invariant` over hand-rolled hooks /
  type helpers; narrow with type guards, not `as`.
- **Product copy:** never use `·`, `•`, or another dot glyph as a visual separator.
- **Docs:** root [`docs/`](docs/README.md) is for monorepo-wide engineering only. Anything specific to one app or
  package goes in that app or package's own `docs/` folder, indexed by its `docs/README.md`.
- **UX acceptance:** verify every UX change through the integrated browser before calling it complete. Component tests
  alone are not sufficient.

Verify loop: **`pnpm verify`** must be clean before finishing. See
[docs/conventions.md](docs/conventions.md#quality-gates).

# HOA Monorepo Project Guidelines

A Turborepo and pnpm monorepo for hoa, an AI-native HOA management platform built on each community's governing
documents. Architectural review is its first module. The app is React 19 and TypeScript. Shared config lives in
`@repo/*` packages under `packages/`. See [README.md](README.md) for setup and the [docs index](docs/README.md) for
conventions.

## Tooling (differs from common defaults)

- **Lint:** `oxlint` (not eslint). **Format:** `oxfmt` (not prettier).
- **Type-check:** `tsc` from the native TypeScript 7.0.2 pinned in the `pnpm-workspace.yaml` catalog.
- **Test:** Vitest (happy-dom unit tests). **Web framework:** TanStack Start on Vite, running on Cloudflare Workers.
- **AI:** Vercel AI SDK (`ai`) with the OpenRouter provider; prompts, traces, cost and latency in Langfuse.
- **Package manager:** pnpm (`>=12`) on Node `>=26`, enforced via root `engines` + `engine-strict`.
- **Task runner:** Turborepo.

## Build and verify loop

Run `pnpm verify` before declaring work done; it must be clean. When to run checks, what `pnpm verify` covers and the
lefthook rules are in [conventions.md](docs/conventions.md#quality-gates).

## Workspace layout

- `apps/` — product applications; `packages/` — shared libraries. Each keeps its own `docs/`.
- **Reusable shared config** (extend these; don't redefine per package): `@repo/oxlint-config`,
  `@repo/typescript-config`.
- `.fixtures/` — real homeowner submissions used for local development and evaluation. Git-ignored; never commit them.

## Conventions

Coding conventions live in the [`docs/`](docs/README.md) folder. Start at the index and read the relevant page before
writing code. Working in an app or package, read its own `docs/README.md` too. Two points worth stating up front: the
**React Compiler is on** (don't hand-write `useMemo`/`useCallback`/`memo`), and **reuse before building**: check
[hooks.md](docs/hooks.md) and [typescript.md](docs/typescript.md) for what the preferred libraries already provide
before writing a hook or type helper.

Prefer the tools in the [preferred tech stack](docs/tech-stack.md); **introducing a library that isn't already used
needs a human discussion**, not a silent add.

## AI features

- **Model runs need the user's approval, every time.** Anything that calls a model through the app's OpenRouter key or
  writes to Langfuse (evaluation rounds, encoding builds, reviews, document uploads that start a build, prompt
  experiments) bills the user's accounts. Before each run, say what will run, on which model, and roughly what it costs,
  and wait for a yes. Unit tests and `pnpm verify` use mocked models and need no approval. Judging and comparing
  evaluation results is done by the coding agent itself, not by model calls through the app's key.
- **Prompts live in Langfuse.** Fetch them through the app's prompt helper: by label for a single call, and by the
  version the job resolved for a Workflow step. Never put prompt text in source: prompts are created and edited only in
  Langfuse, and code refers to them by name.
- **Every model call is traced.** Use the app's model helper so the call reaches Langfuse with its prompt version, token
  usage, cost and latency.
- **Nothing is fitted to one instance.** Code, prompts, validations and evaluation data stay generic: no prompt or code
  may name an organization's terms, a project type, a product or an example from a sample case. Organization and project
  knowledge lives only in rulebook data (term definitions, scope notes, value relations). Tune on some cases and measure
  on held-out ones, including whole project types; change expected data only with a cited reason.
- **Every model stage is measured.** How each stage is evaluated, and what runs in production, is in
  [apps/hoa/docs/design/evaluation.md](apps/hoa/docs/design/evaluation.md).

## Documentation

- **Keep this file brief.** It's the entry point; link to `docs/` articles rather than duplicating detail.
- **Docs live with what they describe.** The root [`docs/`](docs/README.md) is only for engineering across the whole
  monorepo. Everything specific to one app or package goes in that app or package's own `docs/` folder, indexed by its
  `docs/README.md`. A new app or package gets a `docs/` folder with its first doc, and a link from the root index.
- **One topic per page, kept short**, and updated (with its folder's `README.md` index) in the same change as the
  behavior, tooling or convention it describes.
- Do not create executable validators or test suites for prose documentation, backlogs or status tables. Review those
  artifacts directly. Tests cover executable code and generated artifacts that affect runtime behavior or an external
  interface.

## Product copy and UX acceptance

- Follow [apps/hoa/docs/ux.md](apps/hoa/docs/ux.md): quiet views with one primary action, required fields marked with a
  red asterisk and optional ones unmarked, at most one help affordance per field, shared inputs for quantities, files,
  tables, search and citations.
- Never use a dot glyph, including `·` or `•`, as a visual separator. Use layout, separate text elements, or a clearly
  worded phrase instead.
- Verify every new or changed UX feature in the integrated browser before considering it complete. Exercise the customer
  workflow, inspect the rendered result at desktop and mobile sizes, and check keyboard and accessible-name behavior.
  Unit or component tests do not replace this browser acceptance check.

## Gotchas

- oxlint rules live in the shared `@repo/oxlint-config` base; add new rules there so every package benefits.
- `apps/hoa/src/routeTree.gen.ts` is generated by TanStack Start on `dev` and `build`, and committed so `check:types`
  works without a build. Don't edit it; run `dev` after adding or renaming a route.
- `apps/hoa/worker-configuration.d.ts` is generated by `wrangler types` and committed. Regenerate it with
  `pnpm --filter hoa cf-typegen` after changing `wrangler.jsonc`.
- Run Wrangler's interactive commands (`wrangler login`) from `apps/hoa` with `pnpm exec`, not through `pnpm --filter`,
  which can start them twice.

## Principles for development

- **Correctness over expediency.** Fix root causes and keep contracts coherent, even when a shortcut is faster.
- **No backward compatibility by default.** Replace obsolete contracts and implementations directly. If a change would
  break something that might need to keep working, ask first; with no one to ask, assume it doesn't. The exception is D1
  migrations ([apps/hoa/docs/setup.md](apps/hoa/docs/setup.md#schema-and-binding-changes)).
- **One canonical implementation.** No version-suffixed files, symbols, schemas, routes or APIs (`V2`, `Phase2`,
  `legacy`) and no compatibility aliases. Fix forward instead of adding shims, fallbacks or dual paths for unreleased
  behavior.
- Treat prototype data as disposable. Do not preserve, migrate, or repair stale prototype data unless the user
  explicitly requests it.
- Preserve integration credentials and unrelated external configuration when resetting application data unless the user
  explicitly requests a full reset.
