import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { emailInvitation } from "@/auth/auth.server"
import { getDb } from "@/db/client.server"
import { cancelingInvitations, inviteToJoin, setMemberAccess } from "@/db/membershipRepository"
import {
  endCommitteeMember,
  endUnitLink,
  findPersonByEmail,
  getCommittee,
  getPerson,
  getRoll,
  getUnit,
  insertCommittee,
  insertCommitteeMember,
  insertPerson,
  insertUnit,
  insertUnitLink,
  removeCommittee,
  removePerson,
  removeUnit,
  updateCommittee,
  updatePerson,
  updateUnit
} from "@/db/peopleRepository"
import {
  accessLevels,
  committeeInputSchema,
  committeeMemberInputSchema,
  memberRoles,
  personInputSchema,
  unitInputSchema,
  unitLinkInputSchema
} from "@/people/people"
import { accountOf, isLastAdministrator } from "@/people/roll"
import { requireAdministrator, requireWorkOf } from "@/session/requestContext.server"

// The People page's reads and changes (docs/design/people.md): administrators; and the board, which reads the roll,
// adds people to it, and keeps who owns, lives in or rents each home.

const idSchema = z.object({ id: z.string().min(1) })
const day = z.iso.date("Give a date.")

const parse =
  <T>(schema: z.ZodType<T>) =>
  (data: unknown) =>
    schema.parse(data)

const lastAdministrator = "The association needs at least one administrator. Make someone else one first."

/** The association's roll: everyone on it, the units and their people, and the committees. */
export const getPeopleRoll = createServerFn({ method: "GET" }).handler(async () => {
  const context = await requireWorkOf("board")
  return getRoll(getDb(), context.organization.id)
})

/**
 * Adds someone to the roll or edits them, keeping one person per email and at least one administrator. Their access
 * changes once they've joined; until then it's the invitation's (`invitePerson`). The board adds people, such as a
 * home's buyer, but only an administrator edits someone or changes their access.
 */
export const savePerson = createServerFn({ method: "POST" })
  .validator(parse(z.object({ id: z.string().nullable(), person: personInputSchema })))
  .handler(async ({ data }) => {
    const context = await requireWorkOf("board")
    const { access, ...fields } = data.person
    if (context.role !== "administrator" && (data.id || access === "administrator")) {
      throw new Error("Only an administrator can do this.")
    }
    const db = getDb()
    const organizationId = context.organization.id
    const now = new Date().toISOString()
    if (fields.email && (await findPersonByEmail(db, organizationId, fields.email, data.id ?? undefined))) {
      throw new Error("Someone on the roll already has that email.")
    }
    if (!data.id) {
      return insertPerson(db, organizationId, fields, now)
    }
    const person = await getPerson(db, organizationId, data.id)
    if (!person) {
      throw new Error("That person isn't on the roll.")
    }
    const roll = await getRoll(db, organizationId)
    const account = accountOf(roll, person)
    // A new email lets go of their account, and with it their access.
    const losesAdministrator =
      account.status === "joined" &&
      account.access === "administrator" &&
      (access !== "administrator" || fields.email !== person.email)
    if (losesAdministrator && isLastAdministrator(roll, person.id)) {
      throw new Error(lastAdministrator)
    }
    if (account.status === "joined" && person.userId && access !== account.access) {
      await setMemberAccess(db, organizationId, person.userId, access)
    }
    await updatePerson(db, person, fields, now)
    return { ...person, ...fields }
  })

/** Takes someone off the roll, ending what they own, rent or sit on today, their membership and their invitation. */
export const removeFromRoll = createServerFn({ method: "POST" })
  .validator(parse(idSchema))
  .handler(async ({ data }) => {
    const context = await requireAdministrator()
    const db = getDb()
    const roll = await getRoll(db, context.organization.id)
    const person = roll.people.find((candidate) => candidate.id === data.id)
    if (!person) {
      throw new Error("That person isn't on the roll.")
    }
    if (isLastAdministrator(roll, person.id)) {
      throw new Error(lastAdministrator)
    }
    await removePerson(db, person, new Date().toISOString())
  })

/**
 * Invites someone on the roll to join, with the access they'll have, in place of an invitation still waiting, and
 * emails it. Signing in with the email joins.
 */
export const invitePerson = createServerFn({ method: "POST" })
  .validator(parse(z.object({ id: z.string().min(1), access: z.enum(accessLevels) })))
  .handler(async ({ data }) => {
    const context = await requireAdministrator()
    const person = await getPerson(getDb(), context.organization.id, data.id)
    if (!person?.email) {
      throw new Error("Add their email first.")
    }
    if (person.userId) {
      throw new Error(`${person.name} has joined already.`)
    }
    await inviteToJoin(
      getDb(),
      { organizationId: context.organization.id, email: person.email, access: data.access, inviterId: context.user.id },
      new Date()
    )
    await emailInvitation({ email: person.email, role: memberRoles[data.access], organization: context.organization })
  })

/** Cancels the invitation waiting for someone on the roll; they stay on it. */
export const cancelInvite = createServerFn({ method: "POST" })
  .validator(parse(idSchema))
  .handler(async ({ data }) => {
    const context = await requireAdministrator()
    const db = getDb()
    const person = await getPerson(db, context.organization.id, data.id)
    if (!person?.email) {
      throw new Error("That person isn't on the roll.")
    }
    await cancelingInvitations(db, context.organization.id, person.email)
  })

/** Adds a unit or edits one. */
export const saveUnit = createServerFn({ method: "POST" })
  .validator(parse(z.object({ id: z.string().nullable(), unit: unitInputSchema })))
  .handler(async ({ data }) => {
    const context = await requireAdministrator()
    const db = getDb()
    const now = new Date().toISOString()
    if (!data.id) {
      return insertUnit(db, context.organization.id, data.unit, now)
    }
    if (!(await getUnit(db, context.organization.id, data.id))) {
      throw new Error("That unit isn't on the roll.")
    }
    await updateUnit(db, context.organization.id, data.id, data.unit, now)
    return { id: data.id, organizationId: context.organization.id, ...data.unit }
  })

export const removeUnitFromRoll = createServerFn({ method: "POST" })
  .validator(parse(idSchema))
  .handler(async ({ data }) => {
    const context = await requireAdministrator()
    await removeUnit(getDb(), context.organization.id, data.id, new Date().toISOString())
  })

/** Adds someone as a unit's owner, resident or tenant. */
export const addToUnit = createServerFn({ method: "POST" })
  .validator(parse(unitLinkInputSchema))
  .handler(async ({ data }) => {
    const context = await requireWorkOf("board")
    const db = getDb()
    const [unit, person] = await Promise.all([
      getUnit(db, context.organization.id, data.unitId),
      getPerson(db, context.organization.id, data.personId)
    ])
    if (!unit || !person) {
      throw new Error("That unit or person isn't on the roll.")
    }
    await insertUnitLink(db, context.organization.id, data, new Date().toISOString())
  })

/** Ends someone's ownership, residence or tenancy on a day: a move-out. */
export const leaveUnit = createServerFn({ method: "POST" })
  .validator(parse(z.object({ id: z.string().min(1), endedOn: day })))
  .handler(async ({ data }) => {
    const context = await requireWorkOf("board")
    await endUnitLink(getDb(), context.organization.id, data.id, data.endedOn)
  })

/** A sale: the unit's owners stop owning it on the day, and the buyer starts. */
export const recordSale = createServerFn({ method: "POST" })
  .validator(parse(z.object({ unitId: z.string().min(1), buyerId: z.string().min(1), soldOn: day })))
  .handler(async ({ data }) => {
    const context = await requireWorkOf("board")
    const db = getDb()
    const roll = await getRoll(db, context.organization.id)
    if (!roll.units.some((unit) => unit.id === data.unitId) || !roll.people.some((p) => p.id === data.buyerId)) {
      throw new Error("That unit or buyer isn't on the roll.")
    }
    const owners = roll.links.filter(
      (link) => link.unitId === data.unitId && link.relation === "owner" && link.endedOn === null
    )
    for (const owner of owners) {
      await endUnitLink(db, context.organization.id, owner.id, data.soldOn)
    }
    await insertUnitLink(
      db,
      context.organization.id,
      { unitId: data.unitId, personId: data.buyerId, relation: "owner", startedOn: data.soldOn },
      new Date().toISOString()
    )
  })

/** Adds a committee or renames one. */
export const saveCommittee = createServerFn({ method: "POST" })
  .validator(parse(z.object({ id: z.string().nullable(), committee: committeeInputSchema })))
  .handler(async ({ data }) => {
    const context = await requireAdministrator()
    const db = getDb()
    if (!data.id) {
      return insertCommittee(db, context.organization.id, data.committee, new Date().toISOString())
    }
    if (!(await getCommittee(db, context.organization.id, data.id))) {
      throw new Error("That committee isn't on the roll.")
    }
    await updateCommittee(db, context.organization.id, data.id, data.committee)
    return { id: data.id, organizationId: context.organization.id, ...data.committee }
  })

export const dissolveCommittee = createServerFn({ method: "POST" })
  .validator(parse(idSchema))
  .handler(async ({ data }) => {
    const context = await requireAdministrator()
    await removeCommittee(getDb(), context.organization.id, data.id, new Date().toISOString())
  })

/** Seats someone on a committee, as its chair or a member, with an officer's title on the board. */
export const addToCommittee = createServerFn({ method: "POST" })
  .validator(parse(committeeMemberInputSchema))
  .handler(async ({ data }) => {
    const context = await requireAdministrator()
    const db = getDb()
    const [committee, person] = await Promise.all([
      getCommittee(db, context.organization.id, data.committeeId),
      getPerson(db, context.organization.id, data.personId)
    ])
    if (!committee || !person) {
      throw new Error("That committee or person isn't on the roll.")
    }
    await insertCommitteeMember(db, context.organization.id, data, new Date().toISOString())
  })

/** Ends someone's term on a committee on a day. */
export const leaveCommittee = createServerFn({ method: "POST" })
  .validator(parse(z.object({ id: z.string().min(1), endedOn: day })))
  .handler(async ({ data }) => {
    const context = await requireAdministrator()
    await endCommitteeMember(getDb(), context.organization.id, data.id, data.endedOn)
  })
