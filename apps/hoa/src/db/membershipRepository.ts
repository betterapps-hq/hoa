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

/** How long an invitation to join an organization lasts. */
export const invitationDays = 14

/** The update that cancels the invitations still waiting for an email to join an organization. */
export const cancelingInvitations = (db: Database, organizationId: string, email: string) =>
  db
    .update(invitations)
    .set({ status: "canceled" })
    .where(
      and(
        eq(invitations.organizationId, organizationId),
        eq(invitations.email, email),
        eq(invitations.status, "pending")
      )
    )

/**
 * Invites an email to join an organization with an access, in place of any invitation still waiting for it. Signing
 * in with the email accepts it (`joinRolls`). Written here rather than through Better Auth's plugin, which lets only
 * the organization's members invite, so the platform's operators can too.
 */
export async function inviteToJoin(
  db: Database,
  invitation: { organizationId: string; email: string; access: Access; inviterId: string },
  now: Date
) {
  const { organizationId, email, access, inviterId } = invitation
  await db.batch([
    cancelingInvitations(db, organizationId, email),
    db.insert(invitations).values({
      id: crypto.randomUUID(),
      organizationId,
      email,
      role: memberRoles[access],
      status: "pending",
      expiresAt: new Date(now.getTime() + invitationDays * 24 * 60 * 60 * 1000),
      createdAt: now,
      inviterId
    })
  ])
}

/** Gives a member of an organization another access. */
export async function setMemberAccess(db: Database, organizationId: string, userId: string, access: Access) {
  await db
    .update(members)
    .set({ role: memberRoles[access] })
    .where(and(eq(members.organizationId, organizationId), eq(members.userId, userId)))
}
