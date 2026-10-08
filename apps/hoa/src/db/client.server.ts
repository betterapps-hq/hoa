import { env } from "cloudflare:workers"
import { createDatabase, type Database } from "./database"

/** The app's D1 database, through Drizzle. Tests build their own with `createDatabase`. */
export function getDb(): Database {
  return createDatabase(env.DB)
}
