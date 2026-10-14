import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { z } from "zod"
import { readSchemaSource, referenceOf, snapshotSchema } from "./extract.ts"
import { toTbls, type ErdTable } from "./tbls.ts"

// Writes erd/dist/tbls.json, the D1 tables as the latest migration leaves them, with the comments in src/db/schema.ts
// and every link between tables, for Liam ERD (docs/erd.md). Usage, from apps/hoa: pnpm erd
const here = import.meta.dirname
const app = join(here, "..")
const migrations = join(app, "migrations")
const readJson = (path: string): unknown => JSON.parse(readFileSync(path, "utf8"))

const journal = z
  .object({ entries: z.array(z.object({ tag: z.string() })) })
  .parse(readJson(join(migrations, "meta/_journal.json")))
const latest = journal.entries.at(-1)?.tag
if (!latest) {
  throw new Error("No migrations to draw.")
}
const snapshot = snapshotSchema.parse(readJson(join(migrations, `meta/${latest.slice(0, 4)}_snapshot.json`)))
const source = readSchemaSource(readFileSync(join(app, "src/db/schema.ts"), "utf8"))
const snapshotTables = new Map(Object.values(snapshot.tables).map((table) => [table.name, table]))
const unresolved: string[] = []

const tables = [...snapshotTables.values()].map((table): ErdTable => ({
  name: table.name,
  description: source.get(table.name)?.comment ?? null,
  columns: Object.values(table.columns).map((column) => {
    const said = source.get(table.name)?.columns.get(column.name)
    const reference = referenceOf(table, column.name, snapshotTables)
    if (reference === "unresolved") {
      unresolved.push(`${table.name}.${column.name}`)
    }
    return {
      name: column.name,
      type: column.type,
      holds: said?.holds ?? null,
      notNull: column.notNull,
      default: column.default === undefined ? null : String(column.default),
      description: said?.comment ?? null,
      references: reference === "unresolved" ? null : reference
    }
  }),
  primaryKey:
    Object.values(table.compositePrimaryKeys)[0]?.columns ??
    Object.values(table.columns)
      .filter((column) => column.primaryKey)
      .map((column) => column.name),
  indexes: Object.values(table.indexes).map((index) => ({
    name: index.name,
    columns: index.columns,
    unique: index.isUnique,
    where: index.where ?? null
  }))
}))

const out = join(here, "dist")
mkdirSync(out, { recursive: true })
const tbls = toTbls(tables, latest)
writeFileSync(join(out, "tbls.json"), `${JSON.stringify(tbls, null, 2)}\n`)
console.warn(
  `${tables.length} tables and ${tbls.relations.length} links as of ${latest}, in ${join(out, "tbls.json")}.`
)
if (unresolved.length > 0) {
  console.warn(`Couldn't tell what these point at; add them to pointsAt in annotations.ts: ${unresolved.join(", ")}`)
}
