import { eq } from "drizzle-orm"
import { organizationSettingsSchema, type Organization } from "@/organization/organization"
import type { Database } from "./database"
import { organizations } from "./schema"

function toOrganization(row: typeof organizations.$inferSelect): Organization {
  return { id: row.id, name: row.name, slug: row.slug, settings: organizationSettingsSchema.parse(row.settings) }
}

export async function getOrganization(db: Database, id: string): Promise<Organization | null> {
  const row = await db.select().from(organizations).where(eq(organizations.id, id)).get()
  return row ? toOrganization(row) : null
}
