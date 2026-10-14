import { asc, eq, inArray } from "drizzle-orm"
import { organizationSettingsSchema, type Organization } from "@/organization/organization"
import type { Database } from "./database"
import { organizations } from "./schema"

function toOrganization(row: typeof organizations.$inferSelect): Organization {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    logo: row.logo,
    settings: organizationSettingsSchema.parse(row.settings)
  }
}

export async function getOrganization(db: Database, id: string): Promise<Organization | null> {
  const row = await db.select().from(organizations).where(eq(organizations.id, id)).get()
  return row ? toOrganization(row) : null
}

/** The first organization by name; null when there are none. */
export async function firstOrganization(db: Database): Promise<Organization | null> {
  const row = await db.select().from(organizations).orderBy(asc(organizations.name)).limit(1).get()
  return row ? toOrganization(row) : null
}

/** Organizations' ids, names and logos, by name: every one, or those with these ids. */
export async function listOrganizations(db: Database, ids?: readonly string[]) {
  return db
    .select({ id: organizations.id, name: organizations.name, logo: organizations.logo })
    .from(organizations)
    .where(ids ? inArray(organizations.id, [...ids]) : undefined)
    .orderBy(asc(organizations.name))
}
