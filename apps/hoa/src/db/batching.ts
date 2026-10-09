import { getTableColumns } from "drizzle-orm"
import type { BatchItem } from "drizzle-orm/batch"
import type { SQLiteTable } from "drizzle-orm/sqlite-core"
import type { Database } from "./database"

// D1 binds at most 100 parameters per statement, and a Worker may run at most 1,000 queries per invocation, so many
// rows go in multi-row inserts of as many whole rows as fit.
const maxParameters = 100

export function chunk<T>(items: readonly T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, index) =>
    items.slice(index * size, (index + 1) * size)
  )
}

/** Rows split into groups that each fit one insert into the table. */
export function insertChunks<T>(table: SQLiteTable, rows: readonly T[]) {
  return chunk(rows, Math.floor(maxParameters / Object.keys(getTableColumns(table)).length))
}

/** Runs statements as one D1 batch, which lands atomically; nothing to run is fine. */
export async function runBatch(db: Database, statements: readonly BatchItem<"sqlite">[]) {
  const [first, ...rest] = statements
  if (first) {
    await db.batch([first, ...rest])
  }
}
