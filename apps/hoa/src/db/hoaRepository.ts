import { asc, eq } from "drizzle-orm"
import { hoaSettingsSchema, type Hoa } from "@/hoa/hoa"
import type { Database } from "./database"
import { hoas } from "./schema"

function toHoa(row: typeof hoas.$inferSelect): Hoa {
  return { id: row.id, name: row.name, slug: row.slug, settings: hoaSettingsSchema.parse(row.settings) }
}

export async function getHoa(db: Database, id: string): Promise<Hoa | null> {
  const row = await db.select().from(hoas).where(eq(hoas.id, id)).get()
  return row ? toHoa(row) : null
}

/** The demo serves one HOA, created by the seed script. */
export async function getDefaultHoa(db: Database): Promise<Hoa> {
  const row = await db.select().from(hoas).orderBy(asc(hoas.createdAt)).limit(1).get()
  if (!row) {
    throw new Error("No HOA exists yet. Run the seed script (db:seed:local, db:seed:preview or db:seed:demo).")
  }
  return toHoa(row)
}
