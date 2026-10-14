import {
  isCurrent,
  type Committee,
  type CommitteeMember,
  type Person,
  type Unit,
  type UnitLink,
  type UnitRelation
} from "./people"

/** The roll as the repository reads it: people, units, who owns or lives in each, and the committees. */
export type RollData = {
  people: Person[]
  units: Unit[]
  links: UnitLink[]
  committees: Committee[]
  members: CommitteeMember[]
}

/** Whether someone can sign in yet, and whether they've been asked to. */
export type SignInStatus = "signed-in" | "invited" | "not-invited" | "no-email"

export const signInStatusLabels: Record<SignInStatus, string> = {
  "signed-in": "Signed in",
  invited: "Invited",
  "not-invited": "Not invited",
  "no-email": "No email"
}

export const signInStatusOf = (person: Pick<Person, "userId" | "email" | "invitedAt">): SignInStatus => {
  if (person.userId) {
    return "signed-in"
  }
  if (!person.email) {
    return "no-email"
  }
  return person.invitedAt ? "invited" : "not-invited"
}

export type PersonRow = {
  person: Person
  units: { link: UnitLink; unit: Unit }[]
  committees: { member: CommitteeMember; committee: Committee }[]
  status: SignInStatus
}

export type UnitRow = { unit: Unit; people: { link: UnitLink; person: Person }[] }

export type CommitteeView = { committee: Committee; members: { member: CommitteeMember; person: Person }[] }

/** Owners first, then residents, then tenants. */
const relationOrder: Record<UnitRelation, number> = { owner: 0, resident: 1, tenant: 2 }

/** The roll on a day (YYYY-MM-DD): each person with what they own, live in and sit on now. */
export function personRows(roll: RollData, today: string): PersonRow[] {
  const units = new Map(roll.units.map((unit) => [unit.id, unit]))
  const committees = new Map(roll.committees.map((committee) => [committee.id, committee]))
  return roll.people.map((person) => ({
    person,
    units: roll.links
      .filter((link) => link.personId === person.id && isCurrent(link, today))
      .flatMap((link) => {
        const unit = units.get(link.unitId)
        return unit ? [{ link, unit }] : []
      })
      .toSorted((a, b) => relationOrder[a.link.relation] - relationOrder[b.link.relation]),
    committees: roll.members
      .filter((member) => member.personId === person.id && isCurrent(member, today))
      .flatMap((member) => {
        const committee = committees.get(member.committeeId)
        return committee ? [{ member, committee }] : []
      }),
    status: signInStatusOf(person)
  }))
}

/** Each unit with who owns, lives in or rents it on a day, owners first. */
export function unitRows(roll: RollData, today: string): UnitRow[] {
  const people = new Map(roll.people.map((person) => [person.id, person]))
  return roll.units.map((unit) => ({
    unit,
    people: roll.links
      .filter((link) => link.unitId === unit.id && isCurrent(link, today))
      .flatMap((link) => {
        const person = people.get(link.personId)
        return person ? [{ link, person }] : []
      })
      .toSorted((a, b) => relationOrder[a.link.relation] - relationOrder[b.link.relation])
  }))
}

/** Each committee, the board first, with who sits on it on a day, the chair first. */
export function committeeViews(roll: RollData, today: string): CommitteeView[] {
  const people = new Map(roll.people.map((person) => [person.id, person]))
  return roll.committees
    .toSorted((a, b) => Number(b.kind === "board") - Number(a.kind === "board"))
    .map((committee) => ({
      committee,
      members: roll.members
        .filter((member) => member.committeeId === committee.id && isCurrent(member, today))
        .flatMap((member) => {
          const person = people.get(member.personId)
          return person ? [{ member, person }] : []
        })
        .toSorted((a, b) => Number(b.member.role === "chair") - Number(a.member.role === "chair"))
    }))
}

/** Whether taking `personId` off the roll, or their administrator access away, would leave nobody to manage it. */
export const isLastAdministrator = (people: readonly Pick<Person, "id" | "access">[], personId: string) =>
  people.some((person) => person.id === personId && person.access === "administrator") &&
  people.filter((person) => person.access === "administrator").length === 1
