import { asc, eq, getTableColumns, inArray, is } from "drizzle-orm"
import { SQLiteTable, type SQLiteColumn } from "drizzle-orm/sqlite-core"
import { organizationSettingsSchema, type Organization, type OrganizationSettings } from "@/organization/organization"
import type { Address } from "@/places/address"
import { addressRow, toAddress } from "./addresses"
import type { Database } from "./database"
import * as schema from "./schema"
import { organizations, sessions } from "./schema"

function toOrganization(row: typeof organizations.$inferSelect): Organization {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    logo: row.logo,
    address: toAddress(row),
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

/** Renames an organization and sets its mailing address. */
export async function updateOrganizationDetails(db: Database, id: string, details: { name: string; address: Address }) {
  await db
    .update(organizations)
    .set({ name: details.name, ...addressRow(details.address) })
    .where(eq(organizations.id, id))
}

/** Changes some of an organization's settings, keeping the rest. */
export async function updateOrganizationSettings(db: Database, id: string, changes: Partial<OrganizationSettings>) {
  const organization = await getOrganization(db, id)
  if (organization) {
    await db
      .update(organizations)
      .set({ settings: { ...organization.settings, ...changes } })
      .where(eq(organizations.id, id))
  }
}

/** Sets an organization's logo's URL; null shows its initials. */
export async function setOrganizationLogo(db: Database, id: string, logo: string | null) {
  await db.update(organizations).set({ logo }).where(eq(organizations.id, id))
}

/** Every table that keeps an organization's records, by its `organization_id`. */
const organizationTables = Object.values(schema).flatMap((table) => {
  if (!is(table, SQLiteTable)) {
    return []
  }
  const columns: Record<string, SQLiteColumn | undefined> = getTableColumns(table)
  return columns.organizationId ? [{ table, column: columns.organizationId }] : []
})

/**
 * Deletes an organization and everything it keeps, in one batch: its records in every table with an `organization_id`,
 * its memberships and invitations, and itself; sessions that had it open open none. Its files are the caller's.
 */
export async function deleteOrganization(db: Database, id: string) {
  await db.batch([
    db.update(sessions).set({ activeOrganizationId: null }).where(eq(sessions.activeOrganizationId, id)),
    ...organizationTables.map(({ table, column }) => db.delete(table).where(eq(column, id))),
    db.delete(organizations).where(eq(organizations.id, id))
  ])
}
