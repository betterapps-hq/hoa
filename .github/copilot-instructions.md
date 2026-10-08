# HOA Monorepo — Project Guidelines

A Turborepo + pnpm monorepo with React 19 and TypeScript applications. UI systems are selected at the app or
product-surface boundary. Shared config lives in `@repo/*` packages under `packages/`. See [README.md](../README.md) for
setup and the [docs index](../docs/README.md) for conventions.

## Tooling (differs from common defaults)

- **Lint:** `oxlint` (not eslint) · **Format:** `oxfmt` (not prettier).
- **Type-check:** `tsc` from a pinned native TypeScript — keep the version aligned across packages.
- **Test:** Vitest (happy-dom unit tests) · **Web framework:** TanStack Start on Vite, running on Cloudflare Workers.
- **AI:** Vercel AI SDK (`ai`) with the OpenRouter provider; prompts, traces, cost, latency and evaluations in Langfuse.
- **Package manager:** pnpm (`>=12`) on Node `>=26`, enforced via root `engines` + `engine-strict`.
- **Task runner:** Turborepo.

## Build / verify loop

Complete the coherent implementation before running unit tests, type-checks, lint, browser acceptance, or the full
verification suite. Do not run these checks after each small edit. Once the implementation is complete, run the smallest
relevant focused checks, then run the required final verification. If a check exposes related defects, batch the repairs
before rerunning that check.

Run `pnpm verify` before declaring work done — it must be clean. It runs, in order, `check:format` (oxfmt), `check:lint`
and `check:types` (per package via Turbo), `check:unused` (`knip` over the whole graph) and `test:coverage`. Formatting
is global; lint and type-check are per-package; knip is root-only.

Git hooks (lefthook): **pre-commit** runs `oxlint --fix` + `oxfmt` on staged files; **pre-push** runs
`pnpm check:types`. Do not bypass them with `--no-verify` unless the user explicitly authorizes it for a failure wholly
caused by unrelated project work. That exception does not waive focused verification for the files being committed, and
the commit handoff must record the unrelated blocker and the checks run directly.

## Workspace layout

- `apps/` — product applications; `packages/` — shared libraries. Each keeps its own `docs/`.
- **Reusable shared config** (extend these; don't redefine per package): `@repo/oxlint-config`,
  `@repo/typescript-config`.
- `.fixtures/` — real homeowner submissions used for local development and evaluation. Git-ignored; never commit them.

## Conventions

Coding conventions live in the [`docs/`](../docs/README.md) folder — start at the index and read the relevant page
before writing code. Working in an app or package, read its own `docs/README.md` too. Two points worth stating up front:
the **React Compiler is on** (don't hand-write `useMemo`/`useCallback`/`memo`), and **reuse before building** — check
the [hooks](../docs/hooks.md) and [type-helper](../docs/typescript.md) catalogs before writing your own.

Prefer the tools in the [preferred tech stack](../docs/tech-stack.md); **introducing a library that isn't already used
needs a human discussion**, not a silent add.

## AI features

- **Prompts live in Langfuse.** Fetch them through the app's prompt helper: by label for a single call, and by the
  version the job resolved for a Workflow step. Never hard-code a prompt in source except as the fallback used when
  Langfuse is unreachable.
- **Every model call is traced.** Use the app's model helper so the call reaches Langfuse with its prompt version, token
  usage, cost and latency.
- **Every model stage is measured.** It has a Langfuse dataset (or is measured through the stage that consumes it),
  listed in the app's design/evaluation.md; production evaluators exist only where that page lists them. See
  [apps/hoa/docs/ai.md](../apps/hoa/docs/ai.md).

## Documentation

- **Keep this file brief** — it's the entry point; link to `docs/` articles rather than duplicating detail.
- **Docs live with what they describe.** The root [`docs/`](../docs/README.md) is only for engineering across the whole
  monorepo. Everything specific to one app or package goes in that app or package's own `docs/` folder, indexed by its
  `docs/README.md`. A new app or package gets a `docs/` folder with its first doc, and a link from the root index.
- **One topic per page, kept short**, and updated (with its folder's `README.md` index) in the same change as the
  behavior, tooling or convention it describes.
- Do not create executable validators or test suites for prose documentation, backlogs or status tables. Review those
  artifacts directly. Tests cover executable code and generated artifacts that affect runtime behavior or an external
  interface.

## Product copy and UX acceptance

- Never use a dot glyph, including `·` or `•`, as a visual separator. Use layout, separate text elements, or a clearly
  worded phrase instead.
- Verify every new or changed UX feature in the integrated browser before considering it complete. Exercise the customer
  workflow, inspect the rendered result at desktop and mobile sizes, and check keyboard and accessible-name behavior.
  Unit or component tests do not replace this browser acceptance check.

## Gotchas

- Hosted on **GitHub** — use GitHub for PRs and issues.
- oxlint rules live in the shared `@repo/oxlint-config` base; add new rules there so every package benefits.
- `apps/hoa/src/routeTree.gen.ts` is generated by TanStack Start on `dev` and `build`, and committed so `check:types`
  works without a build. Don't edit it; run `dev` after adding or renaming a route.
- `apps/hoa/worker-configuration.d.ts` is generated by `wrangler types` and committed. Regenerate it with
  `pnpm --filter hoa cf-typegen` after changing `wrangler.jsonc`.
- Run Wrangler's interactive commands (`wrangler login`) from `apps/hoa` with `pnpm exec`, not through `pnpm --filter`,
  which can start them twice.

## Principles for development

- **Don't reinvent wheels.** [typescript.md](../docs/typescript.md) and [hooks.md](../docs/hooks.md) catalog what the
  installed libraries already provide. Check them before adding a hook or type helper.
- Don't overtest or verify. Complete shippable units of work before running test passes and resolving failures. Test
  passes cost lots of time.
- **Correctness over expediency.** Fix root causes and keep contracts coherent, even when a shortcut is faster.
- **No backward compatibility by default.** Replace obsolete contracts and implementations directly. If a change would
  break something that might need to keep working, ask first; with no one to ask, assume it doesn't. The exception is D1
  migrations: every pull request preview shares one preview database, so migrations must stay backward compatible.
- **One canonical implementation.** No version-suffixed files, symbols, schemas, routes or APIs (`V2`, `Phase2`,
  `legacy`) and no compatibility aliases. Fix forward instead of adding shims, fallbacks or dual paths for unreleased
  behavior.
- Treat prototype data as disposable. Do not preserve, migrate, or repair stale prototype data unless the user
  explicitly requests it.
- Preserve integration credentials and unrelated external configuration when resetting application data unless the user
  explicitly requests a full reset.
