# React

Conventions for authoring React components in this monorepo. Hooks have their own page — see [hooks.md](hooks.md).

## Components

- **Define components as function declarations**, not arrow consts (use an arrow only for `forwardRef` wrappers).
  **Never use `React.FC`.**
- **Prop types are named `{ComponentName}Props`** and live in the component's `.tsx` file.
- **Omit explicit return types** — let inference handle the render type.
- **The React Compiler is on** — do **not** hand-write `useMemo`/`useCallback`/`React.memo` for performance. Follow the
  Rules of React so the compiler can memoize safely.
- **Name event handlers** with an `on` prefix (`onClick`) or a `handle` prefix (`handleClick`).
- **Wrap every app in `<StrictMode>` and a top-level `react-error-boundary`.** Add the provider required by that app's
  selected UI system. Wrap tests with the same shell so every surface shares context.
- **Choose the UI system at the app or product-surface boundary.** Keep one coherent component system within a product
  surface unless an explicit integration requires otherwise. The `hoa` app uses **shadcn/ui** (preset `bd1gAJNo`, `base-vega`
  style on Base UI) with Tailwind CSS v4.
- **Use real shadcn components; don't hand-build them.** If a component is missing, add it with the shadcn CLI or MCP
  server. Files in `src/components/ui/` are generated: change them only by re-adding them through the CLI. They're
  excluded from oxlint and knip's unused-export check. App-level compositions (`Notice`, `FilePicker`) live in
  `src/components/`.

## Styling

- **Follow the selected UI system's styling model.** shadcn surfaces use Tailwind utility classes on shadcn's
  CSS-variable tokens, defined in `src/styles.css`, unmodified from the preset. Don't override them;
  use Tailwind utilities, and Tailwind's palette for status icons as the dashboard block does. Define shared visual values as tokens rather than scattering hardcoded colors or spacing. Apply the app's global
  reset and base styles once at its root.

## State, errors & URL

- **Wrap error-prone subtrees in [`react-error-boundary`](https://github.com/bvaughn/react-error-boundary).**
- **Routing is type-safe via [TanStack Router](https://tanstack.com/router)** (file-based routes through TanStack
  Start) — prefer the router's `<Link>` (it validates `to` and preloads on intent).
- **Read/write URL state with the route's `validateSearch`** schema rather than hand-parsing `location.search`.
- **Server work goes through TanStack Start server functions** (`createServerFn`) with a Zod input validator.
- **Forms use [React Hook Form](https://react-hook-form.com)** with Zod through `@hookform/resolvers/zod`.

For component file layout (`{ComponentName}.tsx` / `.hooks.ts` / `.utils.ts` / `.test.tsx`), see
[conventions.md](conventions.md#files--component-layout).
