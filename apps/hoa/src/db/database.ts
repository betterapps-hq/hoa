import { drizzle, type DrizzleD1Database } from "drizzle-orm/d1"
import * as schema from "./schema"

export type Database = DrizzleD1Database<typeof schema>

/** Wraps a D1 binding. Repositories take the result, so tests can pass a local D1 database. */
export function createDatabase(database: D1Database): Database {
  return drizzle(database, { schema })
}
