# Entity-relationship diagram

`pnpm --filter hoa erd` draws every D1 table with [Liam ERD](https://liambx.com/) and opens it in the browser: the
tables, their columns with the comments from `src/db/schema.ts`, and every link between them. `pnpm --filter hoa
erd:build` only builds it, into `erd/dist/site`.

## Where it comes from

[`erd/build.ts`](../erd/build.ts) reads the newest Drizzle Kit migration snapshot for the tables, columns, keys and
indexes, and `src/db/schema.ts` for the comment right above each table and column and for what a column holds (JSON, a
boolean, or a time). It writes `erd/dist/tbls.json` in [tbls](https://github.com/k1LoW/tbls)'s format, and Liam's CLI
builds the diagram from it.

Only three links are foreign keys D1 checks: `sessions`, `accounts` and `people` to `users`. Every other link is a naming
convention the app keeps: a column ending in `_by` points at `users`, and one ending in `_id` at the table named for it.
Liam draws a line only for a foreign key, so the export lists those links as foreign keys too, named `*_by_name`, and
their column's comment says D1 doesn't check them. Columns whose names don't say what they point at are listed in
[`erd/annotations.ts`](../erd/annotations.ts); the build warns about any `_id` column it can't place.
