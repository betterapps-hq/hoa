import { readdir, readFile } from "node:fs/promises"
import path from "node:path"
import { getPlatformProxy } from "wrangler"
import { createDatabase, type Database } from "@/db/database"

const appDirectory = path.resolve(import.meta.dirname, "../..")
const migrationsDirectory = path.join(appDirectory, "migrations")

export type TestDatabase = { db: Database; dispose: () => Promise<void> }

/**
 * A fresh, in-memory D1 database in Cloudflare's local runtime, with every migration applied. Repository tests use it
 * so they run the real SQL, including unique and partial indexes. Call `dispose` when the test ends.
 */
export async function createTestDatabase(): Promise<TestDatabase> {
  const proxy = await getPlatformProxy<{ DB: D1Database }>({
    configPath: path.join(appDirectory, "wrangler.jsonc"),
    persist: false,
    remoteBindings: false
  })
  const d1 = proxy.env.DB
  const files = (await readdir(migrationsDirectory)).filter((file) => file.endsWith(".sql")).toSorted()
  for (const file of files) {
    const sql = await readFile(path.join(migrationsDirectory, file), "utf8")
    const statements = sql
      .split("--> statement-breakpoint")
      .map((statement) => statement.trim())
      .filter(Boolean)
    await d1.batch(statements.map((statement) => d1.prepare(statement)))
  }
  return { db: createDatabase(d1), dispose: () => proxy.dispose() }
}
