# React Hooks

Hook conventions, and where to look before writing your own hook.

## Conventions

- **Reuse first.** Before writing a hook, check [`@mantine/hooks`](https://mantine.dev/hooks/package/). It covers
  state helpers (`useUncontrolled`, `useDisclosure`, `useListState`), timing (`useDebouncedValue`, `useInterval`),
  storage (`useLocalStorage`), lifecycle and refs (`useDidUpdate`, `useMergedRef`), DOM observation (`useElementSize`,
  `useIntersection`, `useWindowEvent`) and environment queries (`useMediaQuery`, `useReducedMotion`). The app already
  uses several of these. Write a custom hook only when nothing there fits.
- **Don't add a hook for what the stack already does.** Server data goes through TanStack Router loaders or TanStack
  Query, forms through TanStack Form, and URL state through the route's `validateSearch` ([react.md](react.md)).
- **One hook per file**, named `use{Name}.ts`, colocated with its feature or under a shared `hooks/` folder.
  Component-scoped hooks go in `{ComponentName}.hooks.ts` ([conventions.md](conventions.md#files--component-layout)).
- **The React Compiler is on.** Don't hand-write `useMemo`, `useCallback` or `React.memo` for performance; follow the
  Rules of React.
- **Follow the Rules of Hooks** (call unconditionally, at the top level). `oxlint`'s `react/rules-of-hooks` enforces
  this.
