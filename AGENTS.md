# AGENTS.md

Agent guidance for this repository lives in [.github/copilot-instructions.md](.github/copilot-instructions.md). Read it
before making changes.

Quick reference:

- **Lint:** `oxlint` (not eslint) · **Format:** `oxfmt` (not prettier)
- **Type-check:** TypeScript 7 RC native compiler via `pnpm check:types`
- **Test:** Vitest via `pnpm test` · **Build:** Vite (TanStack Start) via `pnpm build`
- **Package manager:** pnpm `>=12` on Node `>=24` · **Tasks:** Turborepo
- **Git hooks:** lefthook (pre-commit: `oxlint --fix` + `oxfmt`; pre-push: `check:types`). Don't use `--no-verify`.
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

Verify loop (must be clean before finishing): run **`pnpm verify`** (format, lint, types, knip, tests with coverage).
