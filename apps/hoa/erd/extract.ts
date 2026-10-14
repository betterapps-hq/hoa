import { z } from "zod"
import { irregularPlurals, pointsAt } from "./annotations.ts"

// Reading the schema: drizzle-kit's latest migration snapshot for the tables, and src/db/schema.ts for its comments and
// for what each column holds. Pure, so the tests can feed it text.

/** What a column holds beyond its SQLite type, as src/db/schema.ts declares it. */
export type Holds = "json" | "boolean" | "epoch ms" | "iso time"

export type Reference = {
  table: string
  column: string
  /** A foreign key D1 checks; false for one the app keeps by naming convention. */
  enforced: boolean
  onDelete: string | null
}

const record = <T extends z.ZodType>(value: T) => z.record(z.string(), value)

export const snapshotSchema = z.object({
  tables: record(
    z.object({
      name: z.string(),
      columns: record(
        z.object({
          name: z.string(),
          type: z.string(),
          primaryKey: z.boolean(),
          notNull: z.boolean(),
          default: z.union([z.string(), z.number(), z.boolean()]).optional()
        })
      ),
      indexes: record(
        z.object({
          name: z.string(),
          columns: z.array(z.string()),
          isUnique: z.boolean(),
          where: z.string().optional()
        })
      ),
      foreignKeys: record(
        z.object({
          columnsFrom: z.array(z.string()),
          tableTo: z.string(),
          columnsTo: z.array(z.string()),
          onDelete: z.string().optional()
        })
      ),
      compositePrimaryKeys: record(z.object({ columns: z.array(z.string()) }))
    })
  )
})

export type Snapshot = z.infer<typeof snapshotSchema>
export type SnapshotTable = Snapshot["tables"][string]

export type ColumnSource = { comment: string | null; holds: Holds | null }
export type TableSource = { comment: string | null; columns: ReadonlyMap<string, ColumnSource> }

const holdsOf = (helper: string, line: string): Holds | null => {
  if (helper === "json") {
    return "json"
  }
  if (helper === "timestamp") {
    return "iso time"
  }
  if (helper === "authDate" || line.includes('mode: "timestamp_ms"')) {
    return "epoch ms"
  }
  return line.includes('mode: "boolean"') ? "boolean" : null
}

/**
 * Each table's comments in schema.ts, by its SQL name: the comment right above a table or a column. A comment with a
 * blank line after it introduces a section of tables, and belongs to none.
 */
export function readSchemaSource(source: string): ReadonlyMap<string, TableSource> {
  const tables = new Map<string, { comment: string | null; columns: Map<string, ColumnSource> }>()
  const lines = source.replaceAll("\r\n", "\n").split("\n")
  let comment: string[] = []
  let current: Map<string, ColumnSource> | null = null
  let pendingTable: { comment: string | null } | null = null
  for (const line of lines) {
    const text = line.trim()
    if (text.startsWith("//")) {
      comment.push(text.replace(/^\/\/\s?/, ""))
      continue
    }
    const said = comment.length > 0 ? comment.join(" ") : null
    comment = []
    if (pendingTable) {
      // `sqliteTable(` with its name on the next line.
      const name = /^"(\w+)"/.exec(text)?.[1]
      if (name) {
        current = new Map()
        tables.set(name, { comment: pendingTable.comment, columns: current })
        pendingTable = null
        continue
      }
    }
    const table = /^export const \w+ = sqliteTable\(\s*(?:"(\w+)")?/.exec(text)
    if (table) {
      if (table[1]) {
        current = new Map()
        tables.set(table[1], { comment: said, columns: current })
      } else {
        pendingTable = { comment: said }
      }
      continue
    }
    const column = /^\w+:\s*(\w+)(?:<.*>)?\(\s*"(\w+)"/.exec(text)
    if (column && current) {
      current.set(column[2], { comment: said, holds: holdsOf(column[1], text) })
    }
  }
  return tables
}

const pluralsOf = (noun: string) => [irregularPlurals[noun], `${noun}s`, `${noun}es`, noun.replace(/y$/, "ies")]

/**
 * What a column points at: its foreign key, or by convention a column ending in _by (an account) or _id (the table
 * named for it), unless annotations.ts says otherwise. "unresolved" for an _id column the convention can't place.
 */
export function referenceOf(
  table: SnapshotTable,
  column: string,
  tables: ReadonlyMap<string, SnapshotTable>
): Reference | "unresolved" | null {
  const key = Object.values(table.foreignKeys).find((fk) => fk.columnsFrom.length === 1 && fk.columnsFrom[0] === column)
  if (key) {
    return { table: key.tableTo, column: key.columnsTo[0] ?? "id", enforced: true, onDelete: key.onDelete ?? null }
  }
  const byConvention = (target: string): Reference | null => {
    const [name = "", targetColumn = "id"] = target.split(".")
    const resolved = name === "self" ? table.name : name
    return tables.get(resolved)?.columns[targetColumn]
      ? { table: resolved, column: targetColumn, enforced: false, onDelete: null }
      : null
  }
  if (column in pointsAt) {
    const target = pointsAt[column]
    return target ? (byConvention(target) ?? "unresolved") : null
  }
  if (column.endsWith("_by")) {
    return byConvention("users")
  }
  if (column !== "id" && column.endsWith("_id")) {
    const noun = column.slice(0, -"_id".length)
    const target = pluralsOf(noun).find((name) => name !== undefined && tables.has(name))
    return target ? byConvention(target) : "unresolved"
  }
  return null
}
