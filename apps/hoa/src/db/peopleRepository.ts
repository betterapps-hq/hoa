import { and, asc, eq, inArray, isNull, or, sql } from "drizzle-orm"
import {
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
import type { Database } from "./database"
import { committeeMembers, committees, people, unitPeople, units, users } from "./schema"

// The association's roll (docs/design/people.md). Removing someone or something keeps the row, marked removed, so the
// history that names them still reads.

const toPerson = (row: typeof people.$inferSelect): Person => ({
  id: row.id,
  hoaId: row.hoaId,
  name: row.name,
  email: row.email,
  phone: row.phone,
  mailingAddress: row.mailingAddress,
  access: row.access === "administrator" ? "administrator" : "member",
  userId: row.userId,
  invitedAt: row.invitedAt
})

const toUnit = (row: typeof units.$inferSelect): Unit => ({
  id: row.id,
  hoaId: row.hoaId,
  label: row.label,
  address: row.address,
  lot: row.lot
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
  hoaId: row.hoaId,
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

/** Everyone on the roll, the units, who owns or lives in each, and the committees with their members. */
export async function getRoll(db: Database, hoaId: string) {
  const [personRows, unitRows, linkRows, committeeRows, memberRows] = await Promise.all([
    db
      .select()
      .from(people)
      .where(and(eq(people.hoaId, hoaId), isNull(people.removedAt)))
      .orderBy(asc(people.name)),
    db
      .select()
      .from(units)
      .where(and(eq(units.hoaId, hoaId), isNull(units.removedAt)))
      .orderBy(asc(units.label)),
    db.select().from(unitPeople).where(eq(unitPeople.hoaId, hoaId)),
    db
      .select()
      .from(committees)
      .where(and(eq(committees.hoaId, hoaId), isNull(committees.removedAt)))
      .orderBy(asc(committees.createdAt)),
    db.select().from(committeeMembers).where(eq(committeeMembers.hoaId, hoaId))
  ])
  return {
    people: personRows.map(toPerson),
    units: unitRows.map(toUnit),
    links: linkRows.map(toUnitLink),
    committees: committeeRows.map(toCommittee),
    members: memberRows.map(toMember)
  }
}

export async function getPerson(db: Database, hoaId: string, id: string): Promise<Person | null> {
  const row = await db
    .select()
    .from(people)
    .where(and(eq(people.hoaId, hoaId), eq(people.id, id), isNull(people.removedAt)))
    .get()
  return row ? toPerson(row) : null
}

/** Someone on the roll already with this email, other than `exceptId`. */
export async function findPersonByEmail(db: Database, hoaId: string, email: string, exceptId?: string) {
  const rows = await db
    .select({ id: people.id })
    .from(people)
    .where(and(eq(people.hoaId, hoaId), eq(people.email, email)))
  return rows.find((row) => row.id !== exceptId) ?? null
}

type PersonFields = {
  name: string
  email: string | null
  phone: string | null
  mailingAddress: string | null
  access: Access
}

export async function insertPerson(db: Database, hoaId: string, fields: PersonFields, now: string): Promise<Person> {
  const row = {
    id: crypto.randomUUID(),
    hoaId,
    ...fields,
    userId: null,
    invitedAt: null,
    createdAt: now,
    updatedAt: now,
    removedAt: null
  }
  await db.insert(people).values(row)
  return toPerson(row)
}

/** Edits someone on the roll. A changed email lets go of the account the old one linked. */
export async function updatePerson(db: Database, person: Person, fields: PersonFields, now: string) {
  const isNewEmail = fields.email !== person.email
  await db
    .update(people)
    .set({ ...fields, ...(isNewEmail ? { userId: null } : {}), updatedAt: now })
    .where(and(eq(people.hoaId, person.hoaId), eq(people.id, person.id)))
}

/** Takes someone off the roll, ending what they own, live in or sit on today. */
export async function removePerson(db: Database, hoaId: string, id: string, now: string) {
  const today = now.slice(0, 10)
  await db.batch([
    db
      .update(people)
      .set({ removedAt: now, userId: null, updatedAt: now })
      .where(and(eq(people.hoaId, hoaId), eq(people.id, id))),
    db
      .update(unitPeople)
      .set({ endedOn: today })
      .where(and(eq(unitPeople.hoaId, hoaId), eq(unitPeople.personId, id), isNull(unitPeople.endedOn))),
    db
      .update(committeeMembers)
      .set({ endedOn: today })
      .where(
        and(eq(committeeMembers.hoaId, hoaId), eq(committeeMembers.personId, id), isNull(committeeMembers.endedOn))
      )
  ])
}

export async function markInvited(db: Database, hoaId: string, id: string, now: string) {
  await db
    .update(people)
    .set({ invitedAt: now })
    .where(and(eq(people.hoaId, hoaId), eq(people.id, id)))
}

type UnitFields = { label: string; address: string | null; lot: string | null }

export async function insertUnit(db: Database, hoaId: string, fields: UnitFields, now: string): Promise<Unit> {
  const row = { id: crypto.randomUUID(), hoaId, ...fields, createdAt: now, updatedAt: now, removedAt: null }
  await db.insert(units).values(row)
  return toUnit(row)
}

export async function getUnit(db: Database, hoaId: string, id: string): Promise<Unit | null> {
  const row = await db
    .select()
    .from(units)
    .where(and(eq(units.hoaId, hoaId), eq(units.id, id), isNull(units.removedAt)))
    .get()
  return row ? toUnit(row) : null
}

export async function updateUnit(db: Database, hoaId: string, id: string, fields: UnitFields, now: string) {
  await db
    .update(units)
    .set({ ...fields, updatedAt: now })
    .where(and(eq(units.hoaId, hoaId), eq(units.id, id)))
}

/** Takes a unit off the roll, ending everyone's link to it today. */
export async function removeUnit(db: Database, hoaId: string, id: string, now: string) {
  await db.batch([
    db
      .update(units)
      .set({ removedAt: now, updatedAt: now })
      .where(and(eq(units.hoaId, hoaId), eq(units.id, id))),
    db
      .update(unitPeople)
      .set({ endedOn: now.slice(0, 10) })
      .where(and(eq(unitPeople.hoaId, hoaId), eq(unitPeople.unitId, id), isNull(unitPeople.endedOn)))
  ])
}

export async function insertUnitLink(
  db: Database,
  hoaId: string,
  link: { unitId: string; personId: string; relation: UnitRelation; startedOn: string | null },
  now: string
) {
  await db.insert(unitPeople).values({ id: crypto.randomUUID(), hoaId, ...link, endedOn: null, createdAt: now })
}

/**
 * Makes someone the owner of a unit that has no owner on `today`, as a homeowner claiming their home does. One
 * statement, so two people claiming the same home at once can't both get it. False when the unit has an owner, or
 * isn't the association's.
 */
export async function claimUnit(
  db: Database,
  hoaId: string,
  claim: { unitId: string; personId: string },
  today: string,
  now: string
) {
  const rows = await db.all<{ id: string }>(sql`
    INSERT INTO unit_people (id, hoa_id, unit_id, person_id, relation, started_on, ended_on, created_at)
    SELECT ${crypto.randomUUID()}, ${hoaId}, ${claim.unitId}, ${claim.personId}, 'owner', NULL, NULL, ${now}
    WHERE EXISTS (SELECT 1 FROM units WHERE id = ${claim.unitId} AND hoa_id = ${hoaId} AND removed_at IS NULL)
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
export async function endUnitLink(db: Database, hoaId: string, id: string, endedOn: string) {
  await db
    .update(unitPeople)
    .set({ endedOn })
    .where(and(eq(unitPeople.hoaId, hoaId), eq(unitPeople.id, id)))
}

export async function insertCommittee(
  db: Database,
  hoaId: string,
  fields: { name: string; kind: CommitteeKind },
  now: string
): Promise<Committee> {
  const row = { id: crypto.randomUUID(), hoaId, ...fields, createdAt: now, removedAt: null }
  await db.insert(committees).values(row)
  return toCommittee(row)
}

export async function getCommittee(db: Database, hoaId: string, id: string): Promise<Committee | null> {
  const row = await db
    .select()
    .from(committees)
    .where(and(eq(committees.hoaId, hoaId), eq(committees.id, id), isNull(committees.removedAt)))
    .get()
  return row ? toCommittee(row) : null
}

export async function updateCommittee(
  db: Database,
  hoaId: string,
  id: string,
  fields: { name: string; kind: CommitteeKind }
) {
  await db
    .update(committees)
    .set(fields)
    .where(and(eq(committees.hoaId, hoaId), eq(committees.id, id)))
}

/** Dissolves a committee, ending its members' terms today. */
export async function removeCommittee(db: Database, hoaId: string, id: string, now: string) {
  await db.batch([
    db
      .update(committees)
      .set({ removedAt: now })
      .where(and(eq(committees.hoaId, hoaId), eq(committees.id, id))),
    db
      .update(committeeMembers)
      .set({ endedOn: now.slice(0, 10) })
      .where(
        and(eq(committeeMembers.hoaId, hoaId), eq(committeeMembers.committeeId, id), isNull(committeeMembers.endedOn))
      )
  ])
}

export async function insertCommitteeMember(
  db: Database,
  hoaId: string,
  member: {
    committeeId: string
    personId: string
    role: CommitteeRole
    office: string | null
    startedOn: string | null
  },
  now: string
) {
  await db.insert(committeeMembers).values({ id: crypto.randomUUID(), hoaId, ...member, endedOn: null, createdAt: now })
}

/** Ends someone's term on a committee on a day. */
export async function endCommitteeMember(db: Database, hoaId: string, id: string, endedOn: string) {
  await db
    .update(committeeMembers)
    .set({ endedOn })
    .where(and(eq(committeeMembers.hoaId, hoaId), eq(committeeMembers.id, id)))
}

/**
 * The names of the accounts that have signed in as someone on the roll, removed people too, for what records say each
 * did: an account's own name, or the roll's when it has none.
 */
export async function accountNames(db: Database, hoaId: string) {
  const rows = await db
    .select({ id: users.id, account: users.name, person: people.name })
    .from(people)
    .innerJoin(users, eq(people.userId, users.id))
    .where(eq(people.hoaId, hoaId))
  return new Map(rows.map((row) => [row.id, row.account || row.person]))
}
