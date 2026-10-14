import {
  isCurrent,
  type Access,
  type Committee,
  type CommitteeMember,
  type Person,
  type Unit,
  type UnitLink,
  type UnitRelation
} from "./people"

/**
 * The roll as the repository reads it: people, units, who owns or lives in each, and the committees; with the accounts
 * that have joined the organization and their access, and the invitations waiting for an answer.
 */
export type RollData = {
  people: Person[]
  units: Unit[]
  links: UnitLink[]
  committees: Committee[]
  members: CommitteeMember[]
  memberships: { userId: string; access: Access }[]
  invitations: { email: string; access: Access }[]
}

/** Whether someone has joined, made an account with their email, and if not, whether they've been invited to. */
export type AccountStatus = "joined" | "invited" | "not-invited" | "no-email"

export const accountStatusLabels: Record<AccountStatus, string> = {
  joined: "Joined",
  invited: "Invited",
  "not-invited": "Not invited",
  "no-email": "No email"
}

/** Someone's access and whether they've joined: from their membership, or the invitation waiting for them. */
export function accountOf(
  roll: Pick<RollData, "memberships" | "invitations">,
  person: Pick<Person, "userId" | "email">
) {
  const membership = person.userId
    ? roll.memberships.find((candidate) => candidate.userId === person.userId)
    : undefined
  if (membership) {
    return { status: "joined" as const, access: membership.access }
  }
  const invitation = person.email ? roll.invitations.find((candidate) => candidate.email === person.email) : undefined
  if (invitation) {
    return { status: "invited" as const, access: invitation.access }
  }
  return { status: person.email ? ("not-invited" as const) : ("no-email" as const), access: "member" as const }
}

export type PersonRow = {
  person: Person
  units: { link: UnitLink; unit: Unit }[]
  committees: { member: CommitteeMember; committee: Committee }[]
  status: AccountStatus
  /** Their membership's access, or the one they're invited with. */
  access: Access
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
    ...accountOf(roll, person)
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
/**
 * Why someone can't leave their seat on a day (YYYY-MM-DD), or null: the board is never left with nobody on it. Any
 * other committee can empty.
 */
export function resignationProblem(
  roll: Pick<RollData, "committees" | "members">,
  seat: CommitteeMember,
  endedOn: string
) {
  const committee = roll.committees.find((candidate) => candidate.id === seat.committeeId)
  const stays = roll.members.some(
    (member) => member.committeeId === seat.committeeId && member.id !== seat.id && isCurrent(member, endedOn)
  )
  return committee?.kind === "board" && !stays
    ? "You're the board's last member. An admin needs to seat someone else first."
    : null
}

export function isLastAdministrator(roll: Pick<RollData, "people" | "memberships">, personId: string) {
  const administrators = roll.memberships.filter((membership) => membership.access === "administrator")
  const userId = roll.people.find((person) => person.id === personId)?.userId
  return administrators.length === 1 && administrators[0]?.userId === userId
}
