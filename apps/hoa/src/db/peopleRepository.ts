import { and, asc, eq, gt, inArray, isNotNull, isNull, lte, or, sql } from "drizzle-orm"
import {
  accessOf,
  emailKey,
  peopleOfAccount,
  type Access,
  type Committee,
  type CommitteeKind,
  type CommitteeMember,
  type CommitteeRole,
  type Person,
  type Unit,
  type UnitLink,
  type UnitRelation
} from "@/people/people"
import { addressRow, toAddress } from "./addresses"
import type { Database } from "./database"
import { cancelingInvitations } from "./membershipRepository"
import { committeeMembers, committees, invitations, members, people, unitPeople, units, users } from "./schema"

// The association's roll (docs/design/people.md). Removing someone or something keeps the row, marked removed, so the
// history that names them still reads.

const toPerson = (row: typeof people.$inferSelect): Person => ({
  id: row.id,
  organizationId: row.organizationId,
  name: row.name,
  email: row.email,
  phone: row.phone,
  mailingAddress: row.mailingAddress,
  userId: row.userId
})

const toUnit = (row: typeof units.$inferSelect): Unit => ({
  id: row.id,
  organizationId: row.organizationId,
  label: row.label,
  ...toAddress(row)
})

const relationOf = (relation: string): UnitRelation =>
  relation === "owner" || relation === "tenant" ? relation : "resident"

const toUnitLink = (row: typeof unitPeople.$inferSelect): UnitLink => ({
  id: row.id,
  unitId: row.unitId,
  personId: row.personId,
  relation: relationOf(row.relation),
  startedOn: row.startedOn,
  endedOn: row.endedOn
})

const kindOf = (kind: string): CommitteeKind => (kind === "board" || kind === "architectural" ? kind : "other")

const toCommittee = (row: typeof committees.$inferSelect): Committee => ({
  id: row.id,
  organizationId: row.organizationId,
  name: row.name,
  kind: kindOf(row.kind)
})

const toMember = (row: typeof committeeMembers.$inferSelect): CommitteeMember => ({
  id: row.id,
  committeeId: row.committeeId,
  personId: row.personId,
  role: row.role === "chair" ? "chair" : "member",
  office: row.office,
  startedOn: row.startedOn,
  termEndsOn: row.termEndsOn,
  endedOn: row.endedOn
})

/**
 * The people an account is, on every association's roll, oldest first; links those with its email that no account has
 * claimed yet, the first time it signs in (`peopleOfAccount`).
 */
export async function peopleForAccount(
  db: Database,
  account: { id: string; email: string; emailVerified: boolean }
): Promise<Person[]> {
  const email = emailKey(account.email)
  const rows = await db
    .select()
    .from(people)
    .where(
      and(
        isNull(people.removedAt),
        email === null ? eq(people.userId, account.id) : or(eq(people.userId, account.id), eq(people.email, email))
      )
    )
    .orderBy(asc(people.createdAt))
  const mine = peopleOfAccount(rows, account)
  const unlinked = mine.filter((row) => row.userId === null).map((row) => row.id)
  if (unlinked.length > 0) {
    await db.update(people).set({ userId: account.id }).where(inArray(people.id, unlinked))
  }
  return mine.map((row) => toPerson({ ...row, userId: account.id }))
}

/**
 * Everyone on the roll, the units, who owns or lives in each, and the committees with their members; with the
 * organization's memberships, and the invitations still waiting at `now`.
 */
export async function getRoll(db: Database, organizationId: string, now = new Date()) {
  const [personRows, unitRows, linkRows, committeeRows, memberRows, membershipRows, invitationRows] = await Promise.all(
    [
      db
        .select()
        .from(people)
        .where(and(eq(people.organizationId, organizationId), isNull(people.removedAt)))
        .orderBy(asc(people.name)),
      db
        .select()
        .from(units)
        .where(and(eq(units.organizationId, organizationId), isNull(units.removedAt)))
        .orderBy(asc(units.label)),
      db.select().from(unitPeople).where(eq(unitPeople.organizationId, organizationId)),
      db
        .select()
        .from(committees)
        .where(and(eq(committees.organizationId, organizationId), isNull(committees.removedAt)))
        .orderBy(asc(committees.createdAt)),
      db.select().from(committeeMembers).where(eq(committeeMembers.organizationId, organizationId)),
      db
        .select({ userId: members.userId, role: members.role })
        .from(members)
        .where(eq(members.organizationId, organizationId)),
      db
        .select({ email: invitations.email, role: invitations.role })
        .from(invitations)
        .where(
          and(
            eq(invitations.organizationId, organizationId),
            eq(invitations.status, "pending"),
            gt(invitations.expiresAt, now)
          )
        )
    ]
  )
  return {
    people: personRows.map(toPerson),
    units: unitRows.map(toUnit),
    links: linkRows.map(toUnitLink),
    committees: committeeRows.map(toCommittee),
    members: memberRows.map(toMember),
    memberships: membershipRows.map((row) => ({ userId: row.userId, access: accessOf(row.role) })),
    invitations: invitationRows.map((row) => ({ email: row.email, access: accessOf(row.role) }))
  }
}

export async function getPerson(db: Database, organizationId: string, id: string): Promise<Person | null> {
  const row = await db
    .select()
    .from(people)
    .where(and(eq(people.organizationId, organizationId), eq(people.id, id), isNull(people.removedAt)))
    .get()
  return row ? toPerson(row) : null
}

/** Someone on the roll already with this email, other than `exceptId`. */
export async function findPersonByEmail(db: Database, organizationId: string, email: string, exceptId?: string) {
  const rows = await db
    .select({ id: people.id })
    .from(people)
    .where(and(eq(people.organizationId, organizationId), eq(people.email, email)))
  return rows.find((row) => row.id !== exceptId) ?? null
}

type PersonFields = {
  name: string
  email: string | null
  phone: string | null
  mailingAddress: string | null
}

/** Adds someone to the roll; with `userId`, a member who wasn't on it, linked to their account. */
export async function insertPerson(
  db: Database,
  organizationId: string,
  fields: PersonFields,
  now: string,
  userId: string | null = null
): Promise<Person> {
  const row = {
    id: crypto.randomUUID(),
    organizationId,
    ...fields,
    userId,
    createdAt: now,
    updatedAt: now,
    removedAt: null
  }
  await db.insert(people).values(row)
  return toPerson(row)
}

/** Edits someone on the roll. A changed email lets go of the account the old one linked, and its membership. */
export async function updatePerson(db: Database, person: Person, fields: PersonFields, now: string) {
  const isNewEmail = fields.email !== person.email
  const update = db
    .update(people)
    .set({ ...fields, ...(isNewEmail ? { userId: null } : {}), updatedAt: now })
    .where(and(eq(people.organizationId, person.organizationId), eq(people.id, person.id)))
  await (isNewEmail && person.userId ? db.batch([update, leaving(db, person.organizationId, person.userId)]) : update)
}

/** Ends an account's membership of an organization. */
const leaving = (db: Database, organizationId: string, userId: string) =>
  db.delete(members).where(and(eq(members.organizationId, organizationId), eq(members.userId, userId)))

/**
 * Takes someone off the roll, ending what they own, live in or sit on today, their membership, and the invitations
 * waiting for them.
 */
export async function removePerson(db: Database, person: Person, now: string) {
  const { organizationId, id } = person
  const today = now.slice(0, 10)
  await db.batch([
    db
      .update(people)
      .set({ removedAt: now, userId: null, updatedAt: now })
      .where(and(eq(people.organizationId, organizationId), eq(people.id, id))),
    ...(person.userId ? [leaving(db, organizationId, person.userId)] : []),
    ...(person.email ? [cancelingInvitations(db, organizationId, person.email)] : []),
    db
      .update(unitPeople)
      .set({ endedOn: today })
      .where(
        and(eq(unitPeople.organizationId, organizationId), eq(unitPeople.personId, id), isNull(unitPeople.endedOn))
      ),
    db
      .update(committeeMembers)
      .set({ endedOn: today })
      .where(
        and(
          eq(committeeMembers.organizationId, organizationId),
          eq(committeeMembers.personId, id),
          isNull(committeeMembers.endedOn)
        )
      )
  ])
}

type UnitFields = Omit<Unit, "id" | "organizationId">

/** A unit's fields as its row keeps them. */
const unitColumns = ({ label, ...address }: UnitFields) => ({ label, ...addressRow(address) })

export async function insertUnit(db: Database, organizationId: string, fields: UnitFields, now: string): Promise<Unit> {
  const row = {
    id: crypto.randomUUID(),
    organizationId,
    ...unitColumns(fields),
    createdAt: now,
    updatedAt: now,
    removedAt: null
  }
  await db.insert(units).values(row)
  return toUnit(row)
}

/** The middle of an organization's units on the map; null until one is. The address search looks near it first. */
export async function unitsCenter(db: Database, organizationId: string) {
  const row = await db
    .select({
      latitude: sql<number | null>`avg(${units.latitude})`,
      longitude: sql<number | null>`avg(${units.longitude})`
    })
    .from(units)
    .where(and(eq(units.organizationId, organizationId), isNull(units.removedAt), isNotNull(units.latitude)))
    .get()
  return row && row.latitude !== null && row.longitude !== null
    ? { latitude: row.latitude, longitude: row.longitude }
    : null
}

export async function getUnit(db: Database, organizationId: string, id: string): Promise<Unit | null> {
  const row = await db
    .select()
    .from(units)
    .where(and(eq(units.organizationId, organizationId), eq(units.id, id), isNull(units.removedAt)))
    .get()
  return row ? toUnit(row) : null
}

export async function updateUnit(db: Database, organizationId: string, id: string, fields: UnitFields, now: string) {
  await db
    .update(units)
    .set({ ...unitColumns(fields), updatedAt: now })
    .where(and(eq(units.organizationId, organizationId), eq(units.id, id)))
}

/** Takes a unit off the roll, ending everyone's link to it today. */
export async function removeUnit(db: Database, organizationId: string, id: string, now: string) {
  await db.batch([
    db
      .update(units)
      .set({ removedAt: now, updatedAt: now })
      .where(and(eq(units.organizationId, organizationId), eq(units.id, id))),
    db
      .update(unitPeople)
      .set({ endedOn: now.slice(0, 10) })
      .where(and(eq(unitPeople.organizationId, organizationId), eq(unitPeople.unitId, id), isNull(unitPeople.endedOn)))
  ])
}

export async function insertUnitLink(
  db: Database,
  organizationId: string,
  link: { unitId: string; personId: string; relation: UnitRelation; startedOn: string | null },
  now: string
) {
  await db
    .insert(unitPeople)
    .values({ id: crypto.randomUUID(), organizationId, ...link, endedOn: null, createdAt: now })
}

/**
 * Makes someone the owner of a unit that has no owner on `today`, as a homeowner claiming their home does. One
 * statement, so two people claiming the same home at once can't both get it. False when the unit has an owner, or
 * isn't the association's.
 */
export async function claimUnit(
  db: Database,
  organizationId: string,
  claim: { unitId: string; personId: string },
  today: string,
  now: string
) {
  const rows = await db.all<{ id: string }>(sql`
    INSERT INTO unit_people (id, organization_id, unit_id, person_id, relation, started_on, ended_on, created_at)
    SELECT ${crypto.randomUUID()}, ${organizationId}, ${claim.unitId}, ${claim.personId}, 'owner', NULL, NULL, ${now}
    WHERE EXISTS (SELECT 1 FROM units WHERE id = ${claim.unitId} AND organization_id = ${organizationId} AND removed_at IS NULL)
      AND NOT EXISTS (
        SELECT 1 FROM unit_people
        WHERE unit_id = ${claim.unitId} AND relation = 'owner'
          AND (started_on IS NULL OR started_on <= ${today})
          AND (ended_on IS NULL OR ended_on > ${today})
      )
    RETURNING id`)
  return rows.length > 0
}

/** Ends someone's ownership, residence or tenancy on a day, as a sale or a move-out does. */
export async function endUnitLink(db: Database, organizationId: string, id: string, endedOn: string) {
  await db
    .update(unitPeople)
    .set({ endedOn })
    .where(and(eq(unitPeople.organizationId, organizationId), eq(unitPeople.id, id)))
}

export async function insertCommittee(
  db: Database,
  organizationId: string,
  fields: { name: string; kind: CommitteeKind },
  now: string
): Promise<Committee> {
  const row = { id: crypto.randomUUID(), organizationId, ...fields, createdAt: now, removedAt: null }
  await db.insert(committees).values(row)
  return toCommittee(row)
}

export async function getCommittee(db: Database, organizationId: string, id: string): Promise<Committee | null> {
  const row = await db
    .select()
    .from(committees)
    .where(and(eq(committees.organizationId, organizationId), eq(committees.id, id), isNull(committees.removedAt)))
    .get()
  return row ? toCommittee(row) : null
}

export async function updateCommittee(
  db: Database,
  organizationId: string,
  id: string,
  fields: { name: string; kind: CommitteeKind }
) {
  await db
    .update(committees)
    .set(fields)
    .where(and(eq(committees.organizationId, organizationId), eq(committees.id, id)))
}

/** Dissolves a committee, ending its members' terms today. */
export async function removeCommittee(db: Database, organizationId: string, id: string, now: string) {
  await db.batch([
    db
      .update(committees)
      .set({ removedAt: now })
      .where(and(eq(committees.organizationId, organizationId), eq(committees.id, id))),
    db
      .update(committeeMembers)
      .set({ endedOn: now.slice(0, 10) })
      .where(
        and(
          eq(committeeMembers.organizationId, organizationId),
          eq(committeeMembers.committeeId, id),
          isNull(committeeMembers.endedOn)
        )
      )
  ])
}

/** A term in a seat as the repository keeps it. */
type Term = { role: CommitteeRole; office: string | null; startedOn: string | null; termEndsOn: string | null }

export async function insertCommitteeMember(
  db: Database,
  organizationId: string,
  member: { committeeId: string; personId: string } & Term,
  now: string
) {
  await db
    .insert(committeeMembers)
    .values({ id: crypto.randomUUID(), organizationId, ...member, endedOn: null, createdAt: now })
}

export async function getCommitteeMember(
  db: Database,
  organizationId: string,
  id: string
): Promise<CommitteeMember | null> {
  const [row] = await db
    .select()
    .from(committeeMembers)
    .where(and(eq(committeeMembers.organizationId, organizationId), eq(committeeMembers.id, id)))
  return row ? toMember(row) : null
}

/** Corrects a term: its role, office and days. A new term is `startNextTerm`, which keeps this one as it was. */
export async function updateCommitteeMember(db: Database, organizationId: string, id: string, term: Term) {
  await db
    .update(committeeMembers)
    .set(term)
    .where(and(eq(committeeMembers.organizationId, organizationId), eq(committeeMembers.id, id)))
}

/**
 * Starts someone's next term in a seat they hold, on its first day (YYYY-MM-DD): the term before ends that day, and
 * stays on the roll as one they served.
 */
export async function startNextTerm(
  db: Database,
  organizationId: string,
  previous: Pick<CommitteeMember, "id" | "committeeId" | "personId">,
  term: Term & { startedOn: string },
  now: string
) {
  await db.batch([
    db
      .update(committeeMembers)
      .set({ endedOn: term.startedOn })
      .where(
        and(
          eq(committeeMembers.organizationId, organizationId),
          eq(committeeMembers.id, previous.id),
          or(isNull(committeeMembers.endedOn), gt(committeeMembers.endedOn, term.startedOn))
        )
      ),
    db.insert(committeeMembers).values({
      id: crypto.randomUUID(),
      organizationId,
      committeeId: previous.committeeId,
      personId: previous.personId,
      ...term,
      endedOn: null,
      createdAt: now
    })
  ])
}

/**
 * The committees whose work someone does, whose pages they see: every committee for an administrator, and otherwise the
 * ones they sit on on a day (YYYY-MM-DD). In the order they were added, as the roll lists them. A null id is someone
 * not on the roll: a platform operator looking at the organization.
 */
export async function committeesInView(
  db: Database,
  person: { id: string | null; organizationId: string },
  access: Access,
  today: string
): Promise<Committee[]> {
  const seatsOf = (personId: string) =>
    db
      .select({ committeeId: committeeMembers.committeeId })
      .from(committeeMembers)
      .where(
        and(
          eq(committeeMembers.organizationId, person.organizationId),
          eq(committeeMembers.personId, personId),
          or(isNull(committeeMembers.startedOn), lte(committeeMembers.startedOn, today)),
          or(isNull(committeeMembers.endedOn), gt(committeeMembers.endedOn, today))
        )
      )
  if (access !== "administrator" && person.id === null) {
    return []
  }
  const rows = await db
    .select()
    .from(committees)
    .where(
      and(
        eq(committees.organizationId, person.organizationId),
        isNull(committees.removedAt),
        access === "administrator" || person.id === null ? undefined : inArray(committees.id, seatsOf(person.id))
      )
    )
    .orderBy(asc(committees.createdAt))
  return rows.map(toCommittee)
}

/** Ends someone's term on a committee on a day. */
export async function endCommitteeMember(db: Database, organizationId: string, id: string, endedOn: string) {
  await db
    .update(committeeMembers)
    .set({ endedOn })
    .where(and(eq(committeeMembers.organizationId, organizationId), eq(committeeMembers.id, id)))
}

/**
 * The names of the accounts that have signed in as someone on the roll, removed people too, for what records say each
 * did: an account's own name, or the roll's when it has none.
 */
export async function accountNames(db: Database, organizationId: string) {
  const rows = await db
    .select({ id: users.id, account: users.name, person: people.name })
    .from(people)
    .innerJoin(users, eq(people.userId, users.id))
    .where(eq(people.organizationId, organizationId))
  return new Map(rows.map((row) => [row.id, row.account || row.person]))
}
