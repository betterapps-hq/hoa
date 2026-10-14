// @vitest-environment node
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { createTestDatabase, type TestDatabase } from "@/tests/testDatabase"
import { deleteOrganization } from "./organizationRepository"
import { insertCommittee, insertPerson, insertUnit } from "./peopleRepository"
import { committees, invitations, members, organizations, people, sessions, units, users } from "./schema"

// Deleting an association takes everything it keeps, and nothing another association keeps.

const now = new Date("2026-10-14T00:00:00.000Z")
const stamp = now.toISOString()
const noAddress = { street: null, unitNumber: null, city: null, state: null, postalCode: null, place: null }

describe("deleteOrganization", () => {
  let database: TestDatabase

  beforeEach(async () => {
    database = await createTestDatabase()
  })

  afterEach(async () => {
    await database.dispose()
  })

  async function setUp() {
    const { db } = database
    await db.insert(organizations).values([
      { id: "maple", name: "Maple Hollow", slug: "maple-hollow", createdAt: now },
      { id: "birch", name: "Birch Point", slug: "birch-point", createdAt: now }
    ])
    await db
      .insert(users)
      .values({ id: "user-pat", name: "Pat", email: "pat@example.com", createdAt: now, updatedAt: now })
    for (const organizationId of ["maple", "birch"]) {
      await insertPerson(
        db,
        organizationId,
        { name: "Pat", email: "pat@example.com", phone: null, mailingAddress: null },
        stamp
      )
      await insertUnit(db, organizationId, { label: "12 Birch Lane", ...noAddress }, stamp)
      await insertCommittee(db, organizationId, { name: "Board of Directors", kind: "board" }, stamp)
      await db.insert(members).values({
        id: `member-${organizationId}`,
        organizationId,
        userId: "user-pat",
        role: "admin",
        createdAt: now
      })
      await db.insert(invitations).values({
        id: `invitation-${organizationId}`,
        organizationId,
        email: "sam@example.com",
        expiresAt: now,
        createdAt: now,
        inviterId: "user-pat"
      })
      await db.insert(sessions).values({
        id: `session-${organizationId}`,
        token: `token-${organizationId}`,
        userId: "user-pat",
        expiresAt: now,
        createdAt: now,
        updatedAt: now,
        activeOrganizationId: organizationId
      })
    }
    return db
  }

  it("deletes the organization's records and leaves another's", async () => {
    const db = await setUp()
    await deleteOrganization(db, "maple")
    const kept = async (
      table: typeof people | typeof units | typeof committees | typeof members | typeof invitations
    ) => (await db.select({ organizationId: table.organizationId }).from(table)).map((row) => row.organizationId)
    for (const table of [people, units, committees, members, invitations]) {
      expect(await kept(table)).toEqual(["birch"])
    }
    expect((await db.select({ id: organizations.id }).from(organizations)).map((row) => row.id)).toEqual(["birch"])
    const open = await db
      .select({ id: sessions.id, organizationId: sessions.activeOrganizationId })
      .from(sessions)
      .where(eq(sessions.userId, "user-pat"))
    expect(open.toSorted((a, b) => a.id.localeCompare(b.id))).toEqual([
      { id: "session-birch", organizationId: "birch" },
      { id: "session-maple", organizationId: null }
    ])
  })
})
