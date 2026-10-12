# Coding Conventions

The agent-facing project summary lives in [`.github/copilot-instructions.md`](../.github/copilot-instructions.md) and
links here. These conventions apply to all TypeScript/React code in the monorepo. Many are enforced by `oxlint` (see
[`packages/oxlint-config/base.json`](../packages/oxlint-config/base.json)).

## Quality gates

- **`pnpm verify` must be clean before finishing.** It runs, in order, `check:format` (oxfmt), `check:lint` and
  `check:types` (per package through Turbo), `check:unused` (knip over the whole graph) and `test:coverage`. Formatting
  is global; lint and type-checking are per package; knip runs only at the root.
- **Check once the work is complete, not after each edit.** Finish the coherent implementation, run the smallest
  relevant focused checks, then run `pnpm verify`. If a check exposes related defects, batch the repairs before
  rerunning it. Test passes take a long time, so don't overtest.
- **New code ships with co-located tests** and must keep the relevant app or package's Vitest coverage thresholds
  green.
- **Git hooks (lefthook):** pre-commit runs `oxlint --fix` and `oxfmt` on staged files; pre-push runs
  `pnpm check:types`. Don't bypass them with `--no-verify` unless the user explicitly authorizes it for a failure wholly
  caused by unrelated work. That exception doesn't waive focused checks for the files being committed, and the commit
  handoff must record the unrelated blocker and the checks run directly.

## TypeScript and type helpers

See **[typescript.md](typescript.md)** for type conventions (no `any`, avoid `as`, narrowing order, `type` vs
`interface`, `enum`s) and the type-helper libraries (`ts-extras`, `ts-pattern`, `tiny-invariant`, `zod`). Read it
before writing a new type helper.

## Hooks

See **[hooks.md](hooks.md)** for hook conventions and when to reach for `@mantine/hooks`. Read it before writing a new
hook.

## React

See **[react.md](react.md)** for component conventions (function declarations, no `React.FC`, prop-type naming, the
React Compiler), the UI system and styling, and the state, error, URL, routing and form libraries.

## Imports and exports

- **Prefer named exports** — they keep renames consistent. Route files are the exception: TanStack Router requires the
  `Route` export.
- **Avoid barrel files** (`index.ts` that only re-exports), except a single leaf folder re-exporting its own
  component/resource.
- **Consume shared config via workspace packages** (`@repo/*`); extend the shared oxlint/TS configs rather than
  redefining rules per package.
- **Prefer path/package aliases over deep relative paths** (`../../../`).
- **Suffix server-only modules with `.server.ts`.** They hold secrets or Node-only code and must only be imported from
  server functions or other server modules.

## Logging

- **No `console.*` in product code** (`console.warn`/`console.error` are allowed; lint-enforced). Temporary local
  debugging aside.

## Tests

- **Test code is production code** — hold it to the same quality bar.
- **Co-locate tests** next to source: `*.test.ts` for logic and `*.test.tsx` for rendered components (happy-dom).
- **Drive interactions with `@testing-library/user-event`**; query by role/text, not implementation details.
- **Mock the minimum.** Favor integration-style tests that exercise real collaborators over fully-mocked units. Never
  call a paid model API from a unit test; inject the model (the AI SDK's `MockLanguageModelV4` from `ai/test`).

<a id="files--component-layout"></a>

## Files and component layout

Split a component by concern so the `.tsx` stays focused on rendering:

| File                       | Holds                                                                    |
| -------------------------- | ------------------------------------------------------------------------ |
| `{ComponentName}.tsx`      | The component **and** its `{ComponentName}Props` type                    |
| `{ComponentName}.hooks.ts` | Component-scoped hooks                                                   |
| `{ComponentName}.utils.ts` | Non-render helpers and logic                                             |
| `{ComponentName}.test.tsx` | Tests (`.tsx` when they render JSX, otherwise `{ComponentName}.test.ts`) |

- **File naming:** PascalCase for component files (`AppDrawer.tsx`); camelCase for everything else — utils, hooks,
  services (`toPixelDimension.ts`, `useDisclosure.ts`).
- **Multi-file components get their own folder** named after the component.
- **A single-file component** can live as a lone `{ComponentName}.tsx` without a folder.
- **Component name, file name, and folder name stay in lockstep** — renaming the component renames its file(s) and
  folder.
