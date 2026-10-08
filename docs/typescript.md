# TypeScript & Type Helpers

Type conventions for all TypeScript in the monorepo, and a catalog of the type-helper libraries we install so you
**don't reinvent them**. Many rules here are enforced by `oxlint` (see
[`packages/oxlint-config/base.json`](../packages/oxlint-config/base.json)).

## Conventions

- **No `any`.** If a value is genuinely unknown, type it `unknown` and narrow it.
- **Avoid `as` type assertions.** They silence the compiler. To narrow, prefer, in order: a **type guard**
  (`value is T`) → **`invariant(...)`** (runtime-checked) → **`assertNever`** / **`ts-pattern` `.exhaustive()`** for
  unions. (`as const` is fine — the ban is on _type assertions_.)
- **Prefer `type` over `interface`.** Reach for `interface` only when you need a feature it uniquely provides (e.g.
  declaration merging).
- **Let return types infer.** Add an explicit return type only to lock a public/shared API contract.
- **Prefer string-literal unions over `enum`s**; pair them with exhaustive handling.
- **Prefix boolean variables** with `is`/`has` (`isLoading`, `hasError`).
- **Validate external data with `zod`** at the boundary (never trust network/env input).

## Type narrowing — order of preference

1. **Type guard** — a `function isThing(x: unknown): x is Thing` predicate.
2. **`invariant(cond, msg)`** (`tiny-invariant`) — asserts a runtime assumption and narrows afterward.
3. **`assertNever(x)`** (`ts-extras`) / **`match(x).exhaustive()`** (`ts-pattern`) — for exhaustive unions.

Do **not** reach for `as`.

## `ts-extras` — type-safe stdlib helpers

Typed replacements for unsafe built-ins. Import from `ts-extras`. Use these instead of casting.

### Objects

- `objectKeys(obj)` — like `Object.keys`, but typed `(keyof obj)[]` instead of `string[]`.
- `objectEntries(obj)` — typed `[key, value]` tuples.
- `objectValues(obj)` — typed values.
- `objectFromEntries(entries)` — typed inverse of `objectEntries`.
- `objectHasOwn(obj, key)` — typed `Object.hasOwn`; narrows the key.
- `objectHasIn(obj, key)` — typed `in` check.
- `objectAssign(target, ...sources)` — typed `Object.assign`.
- `objectMapValues(obj, fn)` — map an object's values, preserving keys.
- `objectUpdate(obj, key, fn)` — immutably update one value.

### Arrays

- `arrayIncludes(array, item)` — like `Array#includes`, but narrows `item` (works with `readonly` literal tuples).
- `arrayAt(array, index)` / `arrayFirst(array)` / `arrayLast(array)` — safe element access typed `T | undefined`.
- `arrayConcat`, `arrayJoin` — typed `concat`/`join`.

### Guards & assertions (narrowing)

- `isDefined(x)` / `isPresent(x)` — narrow out `undefined` / (`null` **and** `undefined`). Great in `.filter()`.
- `isPropertyDefined(obj, key)` / `isPropertyPresent(obj, key)` — narrow a property.
- `isEmpty(x)` — typed emptiness check.
- `keyIn(key, obj)` — typed `key in obj`.
- `assertDefined(x)`, `assertPresent(x)`, `assertError(x)`, `assertNever(x)` — throw + narrow.
- `not(predicate)` — invert a type-guard predicate while keeping narrowing.

### Numbers

- `isFinite`, `isInfinite`, `isInteger`, `isSafeInteger` — typed numeric checks.

### Misc

- `safeCastTo<T>()` / `asWritable(x)` — controlled, explicit casts when unavoidable.
- `isEqualType`, `stringSplit`, `setHas` — type-level equality, typed `split`, typed `Set#has`.

## `ts-pattern` — pattern matching

Use for branching on unions/shapes instead of `switch` or nested conditionals.

```ts
import { match, P } from "ts-pattern"

const label = match(result)
  .with({ status: "ok", data: P.select() }, (data) => `ok: ${data}`)
  .with({ status: "error", error: P.instanceOf(Error) }, ({ error }) => error.message)
  .with({ status: "loading" }, () => "loading…")
  .exhaustive() // compile error if a case is missing
```

Key API:

- `match(value)` → `.with(pattern, handler)` → terminate with `.exhaustive()` (enforces all cases) or `.otherwise(fn)`
  (default). Use `.returnType<T>()` to pin the return type.
- **Patterns (`P`):** `P._` / `P.any`, `P.string`, `P.number`, `P.boolean`, `P.bigint`, `P.nullish`, `P.array(pattern)`,
  `P.set`, `P.map`, `P.union(...)`, `P.intersection(...)`, `P.not(pattern)`, `P.optional(pattern)`,
  `P.instanceOf(Class)`, `P.when(predicate)`, `P.select()` (extract a value), and string/number refinements like
  `P.string.startsWith(...)`, `P.number.gte(...)`.
- `isMatching(pattern)` — a standalone type guard built from a pattern.

## `tiny-invariant` — runtime assertions

```ts
import invariant from "tiny-invariant"

invariant(user, "user must be loaded before render") // throws in dev if falsy
user.name // narrowed to non-null here
```

The message is stripped from production builds. Use it for assumptions that _should_ always hold (loaded data, found DOM
nodes) rather than for expected/validation errors.

## `zod` — schema validation

Validate and parse untrusted input; infer static types from schemas.

```ts
import { z } from "zod"

const User = z.object({ id: z.string(), email: z.email() })
type User = z.infer<typeof User>

const user = User.parse(await res.json()) // throws on mismatch
const result = User.safeParse(input) // { success, data | error }
```

The same zod schemas power form validation (`react-hook-form` with `@hookform/resolvers/zod`) and API/env parsing
(`@t3-oss/env-core`).
