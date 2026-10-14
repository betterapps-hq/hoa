import { eq } from "drizzle-orm"
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
