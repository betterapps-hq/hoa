import { getTableColumns, getTableName, type Column } from "drizzle-orm"
import type { SQLiteTable } from "drizzle-orm/sqlite-core"

// SQL text with its values written inline, for seed files that `wrangler d1 execute --file` runs.

export function sqlLiteral(value: unknown): string {
  if (value === null || value === undefined) {
    return "NULL"
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value)
  }
  if (typeof value === "boolean") {
    return value ? "1" : "0"
  }
  if (typeof value === "string") {
    return `'${value.replaceAll("'", "''")}'`
  }
  throw new Error(`${String(value)} can't be written as an SQL value`)
}

/** One row's INSERT, with each value mapped as its column stores it (JSON columns as JSON text). */
export function insertSql<T extends SQLiteTable>(
  table: T,
  row: T["$inferInsert"] & Record<string, unknown>,
  onConflict: "fail" | "replace" = "fail"
) {
  const columns: Record<string, Column> = getTableColumns(table)
  const present = Object.entries(columns).filter(([property]) => row[property] !== undefined)
  const names = present.map(([, column]) => `"${column.name}"`)
  const values = present.map(([property, column]) => {
    const value = row[property]
    return sqlLiteral(value === null ? null : column.mapToDriverValue(value))
  })
  const verb = onConflict === "replace" ? "INSERT OR REPLACE" : "INSERT"
  return `${verb} INTO "${getTableName(table)}" (${names.join(", ")}) VALUES (${values.join(", ")});`
}
