// @vitest-environment node
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { createTestDatabase, type TestDatabase } from "@/tests/testDatabase"
import { inviteToJoin, joinRolls, organizationsOnlyAdministeredBy } from "./membershipRepository"
import { invitations, members, organizations, users } from "./schema"

// The rules joining keeps in the database: an account joins each roll it's on once, with the access its invitation
// gives while the invitation still stands, and the invitation is then accepted. And an account can't leave an
// association with no administrator.

const now = new Date("2026-10-14T00:00:00.000Z")
const account = { id: "user-pat", email: "pat@example.com" }

describe("joinRolls", () => {
  let database: TestDatabase

  beforeEach(async () => {
    database = await createTestDatabase()
    const { db } = database
    await db.insert(organizations).values([
      { id: "maple", name: "Maple Hollow", slug: "maple-hollow", createdAt: now },
      { id: "birch", name: "Birch Point", slug: "birch-point", createdAt: now }
    ])
    await db.insert(users).values([
      { id: account.id, name: "Pat", email: account.email, createdAt: now, updatedAt: now },
      { id: "user-sam", name: "Sam", email: "sam@example.com", createdAt: now, updatedAt: now }
    ])
  })

  afterEach(async () => {
    await database.dispose()
  })

  const invite = (organizationId: string, role: string, expiresAt: Date) =>
    database.db.insert(invitations).values({
      id: `invitation-${organizationId}`,
      organizationId,
      email: account.email,
      role,
      expiresAt,
      createdAt: now,
      inviterId: "user-sam"
    })

  it("joins each roll the account is on, with its invitation's access, and accepts the invitation", async () => {
    await invite("maple", "admin", new Date("2026-10-20T00:00:00.000Z"))
    const people = [{ organizationId: "maple" }, { organizationId: "birch" }]
    expect(await joinRolls(database.db, account, people, now)).toEqual([
      { organizationId: "maple", access: "administrator" },
      { organizationId: "birch", access: "member" }
    ])
    const [invitation] = await database.db.select().from(invitations).where(eq(invitations.id, "invitation-maple"))
    expect(invitation?.status).toBe("accepted")
  })

  it("joins as a member once the invitation has expired", async () => {
    await invite("maple", "admin", new Date("2026-10-13T00:00:00.000Z"))
    expect(await joinRolls(database.db, account, [{ organizationId: "maple" }], now)).toEqual([
      { organizationId: "maple", access: "member" }
    ])
  })

  it("joins a roll once, however often the account signs in", async () => {
    await joinRolls(database.db, account, [{ organizationId: "maple" }], now)
    expect(await joinRolls(database.db, account, [{ organizationId: "maple" }], now)).toHaveLength(1)
  })

  it("replaces the invitation still waiting when someone is invited again", async () => {
    const invitation = { organizationId: "maple", email: account.email, inviterId: "user-sam" }
    await inviteToJoin(database.db, { ...invitation, access: "member" }, now)
    await inviteToJoin(database.db, { ...invitation, access: "administrator" }, now)
    const rows = await database.db.select().from(invitations).where(eq(invitations.organizationId, "maple"))
    expect(
      rows.map(({ role, status }) => ({ role, status })).toSorted((a, b) => a.status.localeCompare(b.status))
    ).toEqual([
      { role: "member", status: "canceled" },
      { role: "admin", status: "pending" }
    ])
    expect(await joinRolls(database.db, account, [{ organizationId: "maple" }], now)).toEqual([
      { organizationId: "maple", access: "administrator" }
    ])
  })
})

describe("organizationsOnlyAdministeredBy", () => {
  let database: TestDatabase

  beforeEach(async () => {
    database = await createTestDatabase()
    const { db } = database
    await db.insert(organizations).values([
      { id: "maple", name: "Maple Hollow", slug: "maple-hollow", createdAt: now },
      { id: "birch", name: "Birch Point", slug: "birch-point", createdAt: now },
      { id: "cedar", name: "Cedar Park", slug: "cedar-park", createdAt: now }
    ])
    await db.insert(users).values([
      { id: account.id, name: "Pat", email: account.email, createdAt: now, updatedAt: now },
      { id: "user-sam", name: "Sam", email: "sam@example.com", createdAt: now, updatedAt: now }
    ])
  })

  afterEach(async () => {
    await database.dispose()
  })

  const join = (organizationId: string, userId: string, role: string) =>
    database.db
      .insert(members)
      .values({ id: `${organizationId}-${userId}`, organizationId, userId, role, createdAt: now })

  it("names the associations nobody else administers", async () => {
    // Pat alone administers Maple Hollow; Sam administers Birch Point too; Pat is a member of Cedar Park.
    await join("maple", account.id, "admin")
    await join("maple", "user-sam", "member")
    await join("birch", account.id, "admin")
    await join("birch", "user-sam", "admin")
    await join("cedar", account.id, "member")
    expect(await organizationsOnlyAdministeredBy(database.db, account.id)).toEqual(["Maple Hollow"])
    expect(await organizationsOnlyAdministeredBy(database.db, "user-sam")).toEqual([])
  })
})
