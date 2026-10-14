import { and, asc, desc, eq, gt } from "drizzle-orm"
import { accessOf, memberRoles, type Access, type Person } from "@/people/people"
import type { Database } from "./database"
import { invitations, members } from "./schema"

// Memberships (docs/design/people.md): Better Auth's organization plugin's members and invitations. The plugin holds
// who has an account in an organization and their access; the roll holds everyone, and keeps the two in step.

export type Membership = { organizationId: string; access: Access }

/** Whether an account is a member of an organization. */
export async function isMember(db: Database, organizationId: string, userId: string) {
  const row = await db
    .select({ id: members.id })
    .from(members)
    .where(and(eq(members.organizationId, organizationId), eq(members.userId, userId)))
    .get()
  return row !== undefined
}

/** An account's memberships, oldest first. */
async function membershipsOf(db: Database, userId: string): Promise<Membership[]> {
  const rows = await db
    .select({ organizationId: members.organizationId, role: members.role })
    .from(members)
    .where(eq(members.userId, userId))
    .orderBy(asc(members.createdAt))
  return rows.map((row) => ({ organizationId: row.organizationId, access: accessOf(row.role) }))
}

/** The latest invitation still waiting for an email to join an organization; null for none. */
async function pendingInvitation(db: Database, organizationId: string, email: string, now: Date) {
  const row = await db
    .select({ id: invitations.id, role: invitations.role })
    .from(invitations)
    .where(
      and(
        eq(invitations.organizationId, organizationId),
        eq(invitations.email, email),
        eq(invitations.status, "pending"),
        gt(invitations.expiresAt, now)
      )
    )
    .orderBy(desc(invitations.createdAt))
    .get()
  return row ?? null
}

/**
 * Makes an account a member of each organization whose roll it's on (`peopleForAccount`) and hasn't joined yet, with
 * the access it was invited with, or as a member, accepting the invitation. Returns all its memberships.
 */
export async function joinRolls(
  db: Database,
  account: { id: string; email: string },
  people: readonly Pick<Person, "organizationId">[],
  now: Date
): Promise<Membership[]> {
  const memberships = await membershipsOf(db, account.id)
  const joined = new Set(memberships.map((membership) => membership.organizationId))
  const toJoin = [...new Set(people.map((person) => person.organizationId))].filter((id) => !joined.has(id))
  if (toJoin.length === 0) {
    return memberships
  }
  for (const organizationId of toJoin) {
    const invitation = await pendingInvitation(db, organizationId, account.email.toLowerCase(), now)
    const member = db
      .insert(members)
      .values({
        id: crypto.randomUUID(),
        organizationId,
        userId: account.id,
        role: invitation?.role ?? memberRoles.member,
        createdAt: now
      })
      .onConflictDoNothing()
    await (invitation
      ? db.batch([member, db.update(invitations).set({ status: "accepted" }).where(eq(invitations.id, invitation.id))])
      : member)
  }
  return membershipsOf(db, account.id)
}

/** Gives a member of an organization another access. */
export async function setMemberAccess(db: Database, organizationId: string, userId: string, access: Access) {
  await db
    .update(members)
    .set({ role: memberRoles[access] })
    .where(and(eq(members.organizationId, organizationId), eq(members.userId, userId)))
}
