# Coding Conventions

The agent-facing project summary lives in [`.github/copilot-instructions.md`](../.github/copilot-instructions.md) and
links here. These conventions apply to all TypeScript/React code in the monorepo. Many are enforced by `oxlint` (see
[`packages/oxlint-config/base.json`](../packages/oxlint-config/base.json)).

## Quality gates

- **`pnpm verify` must pass before finishing.** It runs formatting, lint, type-checking, unused-code analysis (knip) and
  unit tests with coverage across every workspace.
- **New code ships with co-located tests** and must keep the relevant app or package's Vitest coverage thresholds
  green.
- Git hooks (lefthook) run `oxlint --fix` + `oxfmt` on commit and `check:types` on push. Don't bypass with
  `--no-verify`.

## TypeScript & type helpers

See **[typescript.md](typescript.md)** for type conventions (no `any`, avoid `as`, narrowing order, `type` vs
`interface`, `enum`s) and a full catalog of the type-helper libraries (`ts-extras`, `ts-pattern`, `tiny-invariant`,
`zod`) — read it before writing a new type helper.

## Hooks

See **[hooks.md](hooks.md)** for hook conventions and the full `@mantine/hooks` catalog — read it before writing a new
hook.

## React

See **[react.md](react.md)** for component conventions (function declarations, no `React.FC`, prop-type naming, the
React Compiler), product-level UI-system selection and styling, and the state/error/URL/routing/form libraries.

## Imports & exports

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

## Files & component layout

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
