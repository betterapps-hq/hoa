import { createServerFn } from "@tanstack/react-start"
import { getRequestUrl } from "@tanstack/react-start/server"
import { z } from "zod"
import { sendEmail } from "@/auth/email.server"
import { invitationEmail } from "@/auth/emails"
import { getDb } from "@/db/client.server"
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
  markInvited,
  removeCommittee,
  removePerson,
  removeUnit,
  updateCommittee,
  updatePerson,
  updateUnit
} from "@/db/peopleRepository"
import { env } from "@/env.server"
import {
  committeeInputSchema,
  committeeMemberInputSchema,
  personInputSchema,
  unitInputSchema,
  unitLinkInputSchema
} from "@/people/people"
import { isLastAdministrator } from "@/people/roll"
import { requireAdministrator, requireWorkOf } from "@/session/requestContext.server"

// The People page's reads and changes (docs/design/people.md): administrators; and the board, which reads the roll,
// adds people to it, and keeps who owns, lives in or rents each home.

const idSchema = z.object({ id: z.string().min(1) })
const day = z.iso.date("Give a date.")

const parse =
  <T>(schema: z.ZodType<T>) =>
  (data: unknown) =>
    schema.parse(data)

/** The association's roll: everyone on it, the units and their people, and the committees. */
export const getPeopleRoll = createServerFn({ method: "GET" }).handler(async () => {
  const context = await requireWorkOf("board")
  return getRoll(getDb(), context.hoa.id)
})

/**
 * Adds someone to the roll or edits them, keeping one person per email and at least one administrator. The board adds
 * people, such as a home's buyer, but only an administrator edits someone or makes them an administrator.
 */
export const savePerson = createServerFn({ method: "POST" })
  .validator(parse(z.object({ id: z.string().nullable(), person: personInputSchema })))
  .handler(async ({ data }) => {
    const context = await requireWorkOf("board")
    if (context.role !== "administrator" && (data.id || data.person.access === "administrator")) {
      throw new Error("Only an administrator can do this.")
    }
    const db = getDb()
    const now = new Date().toISOString()
    const fields = data.person
    if (fields.email && (await findPersonByEmail(db, context.hoa.id, fields.email, data.id ?? undefined))) {
      throw new Error("Someone on the roll already has that email.")
    }
    if (!data.id) {
      return insertPerson(db, context.hoa.id, fields, now)
    }
    const person = await getPerson(db, context.hoa.id, data.id)
    if (!person) {
      throw new Error("That person isn't on the roll.")
    }
    if (fields.access !== "administrator") {
      const { people } = await getRoll(db, context.hoa.id)
      if (isLastAdministrator(people, person.id)) {
        throw new Error("The association needs at least one administrator. Make someone else one first.")
      }
    }
    await updatePerson(db, person, fields, now)
    return { ...person, ...fields }
  })

/** Takes someone off the roll, ending what they own, rent or sit on today. */
export const removeFromRoll = createServerFn({ method: "POST" })
  .validator(parse(idSchema))
  .handler(async ({ data }) => {
    const context = await requireAdministrator()
    const db = getDb()
    const { people } = await getRoll(db, context.hoa.id)
    if (isLastAdministrator(people, data.id)) {
      throw new Error("The association needs at least one administrator. Make someone else one first.")
    }
    await removePerson(db, context.hoa.id, data.id, new Date().toISOString())
  })

/** Emails someone on the roll an invitation to sign in with their email. */
export const invitePerson = createServerFn({ method: "POST" })
  .validator(parse(idSchema))
  .handler(async ({ data }) => {
    const context = await requireAdministrator()
    const db = getDb()
    const person = await getPerson(db, context.hoa.id, data.id)
    if (!person?.email) {
      throw new Error("Add their email first.")
    }
    const origin = env.BETTER_AUTH_URL ?? new URL(getRequestUrl()).origin
    await sendEmail(invitationEmail(person.email, person.name, context.hoa.name, `${origin}/sign-in`))
    await markInvited(db, context.hoa.id, person.id, new Date().toISOString())
  })

/** Adds a unit or edits one. */
export const saveUnit = createServerFn({ method: "POST" })
  .validator(parse(z.object({ id: z.string().nullable(), unit: unitInputSchema })))
  .handler(async ({ data }) => {
    const context = await requireAdministrator()
    const db = getDb()
    const now = new Date().toISOString()
    if (!data.id) {
      return insertUnit(db, context.hoa.id, data.unit, now)
    }
    if (!(await getUnit(db, context.hoa.id, data.id))) {
      throw new Error("That unit isn't on the roll.")
    }
    await updateUnit(db, context.hoa.id, data.id, data.unit, now)
    return { id: data.id, hoaId: context.hoa.id, ...data.unit }
  })

export const removeUnitFromRoll = createServerFn({ method: "POST" })
  .validator(parse(idSchema))
  .handler(async ({ data }) => {
    const context = await requireAdministrator()
    await removeUnit(getDb(), context.hoa.id, data.id, new Date().toISOString())
  })

/** Adds someone as a unit's owner, resident or tenant. */
export const addToUnit = createServerFn({ method: "POST" })
  .validator(parse(unitLinkInputSchema))
  .handler(async ({ data }) => {
    const context = await requireWorkOf("board")
    const db = getDb()
    const [unit, person] = await Promise.all([
      getUnit(db, context.hoa.id, data.unitId),
      getPerson(db, context.hoa.id, data.personId)
    ])
    if (!unit || !person) {
      throw new Error("That unit or person isn't on the roll.")
    }
    await insertUnitLink(db, context.hoa.id, data, new Date().toISOString())
  })

/** Ends someone's ownership, residence or tenancy on a day: a move-out. */
export const leaveUnit = createServerFn({ method: "POST" })
  .validator(parse(z.object({ id: z.string().min(1), endedOn: day })))
  .handler(async ({ data }) => {
    const context = await requireWorkOf("board")
    await endUnitLink(getDb(), context.hoa.id, data.id, data.endedOn)
  })

/** A sale: the unit's owners stop owning it on the day, and the buyer starts. */
export const recordSale = createServerFn({ method: "POST" })
  .validator(parse(z.object({ unitId: z.string().min(1), buyerId: z.string().min(1), soldOn: day })))
  .handler(async ({ data }) => {
    const context = await requireWorkOf("board")
    const db = getDb()
    const roll = await getRoll(db, context.hoa.id)
    if (!roll.units.some((unit) => unit.id === data.unitId) || !roll.people.some((p) => p.id === data.buyerId)) {
      throw new Error("That unit or buyer isn't on the roll.")
    }
    const owners = roll.links.filter(
      (link) => link.unitId === data.unitId && link.relation === "owner" && link.endedOn === null
    )
    for (const owner of owners) {
      await endUnitLink(db, context.hoa.id, owner.id, data.soldOn)
    }
    await insertUnitLink(
      db,
      context.hoa.id,
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
      return insertCommittee(db, context.hoa.id, data.committee, new Date().toISOString())
    }
    if (!(await getCommittee(db, context.hoa.id, data.id))) {
      throw new Error("That committee isn't on the roll.")
    }
    await updateCommittee(db, context.hoa.id, data.id, data.committee)
    return { id: data.id, hoaId: context.hoa.id, ...data.committee }
  })

export const dissolveCommittee = createServerFn({ method: "POST" })
  .validator(parse(idSchema))
  .handler(async ({ data }) => {
    const context = await requireAdministrator()
    await removeCommittee(getDb(), context.hoa.id, data.id, new Date().toISOString())
  })

/** Seats someone on a committee, as its chair or a member, with an officer's title on the board. */
export const addToCommittee = createServerFn({ method: "POST" })
  .validator(parse(committeeMemberInputSchema))
  .handler(async ({ data }) => {
    const context = await requireAdministrator()
    const db = getDb()
    const [committee, person] = await Promise.all([
      getCommittee(db, context.hoa.id, data.committeeId),
      getPerson(db, context.hoa.id, data.personId)
    ])
    if (!committee || !person) {
      throw new Error("That committee or person isn't on the roll.")
    }
    await insertCommitteeMember(db, context.hoa.id, data, new Date().toISOString())
  })

/** Ends someone's term on a committee on a day. */
export const leaveCommittee = createServerFn({ method: "POST" })
  .validator(parse(z.object({ id: z.string().min(1), endedOn: day })))
  .handler(async ({ data }) => {
    const context = await requireAdministrator()
    await endCommitteeMember(getDb(), context.hoa.id, data.id, data.endedOn)
  })
