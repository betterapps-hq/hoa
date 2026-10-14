import { z } from "zod"
import type { RoleId } from "@/features/role/roles"
import { unitNumberText, type Place } from "@/places/address"
import { optionalPhone } from "./phone"

// The association's people (docs/design/people.md): everyone on its roll, with or without an account, the units they
// own or live in, and the board and committees they sit on.

export const accessLevels = ["member", "administrator"] as const
export type Access = (typeof accessLevels)[number]

export const unitRelations = ["owner", "resident", "tenant"] as const
export type UnitRelation = (typeof unitRelations)[number]

export const committeeKinds = ["board", "architectural", "other"] as const
export type CommitteeKind = (typeof committeeKinds)[number]

export const committeeRoles = ["chair", "member"] as const
export type CommitteeRole = (typeof committeeRoles)[number]

export type Person = {
  id: string
  organizationId: string
  name: string
  email: string | null
  phone: string | null
  mailingAddress: string | null
  /** The account that signed in with their email; null until they do. Its membership holds their access. */
  userId: string | null
}

/** A home, lot or condominium unit: its name, its lot, its address in parts, and where it is once the search found it. */
export type Unit = {
  id: string
  organizationId: string
  label: string
  lot: string | null
  street: string | null
  unitNumber: string | null
  city: string | null
  state: string | null
  postalCode: string | null
  place: Place | null
}

/** A unit's address on one line, as on an envelope: "12 Lakeview Drive #3B, Bellingham, WA 98229". */
export function addressLine(unit: Pick<Unit, "street" | "unitNumber" | "city" | "state" | "postalCode">) {
  const street = [unit.street, unit.unitNumber ? unitNumberText(unit.unitNumber) : null].filter(Boolean).join(" ")
  const region = [unit.state, unit.postalCode].filter(Boolean).join(" ")
  return [street, unit.city, region].filter(Boolean).join(", ")
}

/** Someone owning, living in or renting a unit, from one day to another; `endedOn` is null while it lasts. */
export type UnitLink = {
  id: string
  unitId: string
  personId: string
  relation: UnitRelation
  startedOn: string | null
  endedOn: string | null
}

export type Committee = { id: string; organizationId: string; name: string; kind: CommitteeKind }

export type CommitteeMember = {
  id: string
  committeeId: string
  personId: string
  role: CommitteeRole
  /** An officer's title on the board, such as president. */
  office: string | null
  startedOn: string | null
  endedOn: string | null
}

/** The workspace a person signs in to: administrators manage the association, everyone else sees their own. */
export const roleOf = (access: Access): RoleId => (access === "administrator" ? "administrator" : "homeowner")

/** A membership's role in Better Auth's organization plugin, for each access: "admin" manages the organization. */
export const memberRoles: Record<Access, "admin" | "member"> = { administrator: "admin", member: "member" }

/** The access a membership's role gives: the plugin's "owner" and "admin" both manage the organization. */
export const accessOf = (role: string | null): Access =>
  role === "admin" || role === "owner" ? "administrator" : "member"

/** How emails are kept and compared: trimmed and lowercased; null for none. */
export function emailKey(email: string | null | undefined) {
  const key = email?.trim().toLowerCase() ?? ""
  return key === "" ? null : key
}

/**
 * Which people an account is: those already linked to it, and those on a roll with its email and no account yet, as
 * long as the account has proven its email. People with another account are never taken over.
 */
export function peopleOfAccount<T extends Pick<Person, "email" | "userId">>(
  people: readonly T[],
  account: { id: string; email: string; emailVerified: boolean }
) {
  const email = emailKey(account.email)
  return people.filter(
    (person) =>
      person.userId === account.id ||
      (account.emailVerified && person.userId === null && email !== null && emailKey(person.email) === email)
  )
}

/** Whether a link is in force on a day (YYYY-MM-DD): started by then, or with no start, and not yet ended. */
export const isCurrent = (link: Pick<UnitLink, "startedOn" | "endedOn">, today: string) =>
  (link.startedOn === null || link.startedOn <= today) && (link.endedOn === null || link.endedOn > today)

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((text) => (text === "" ? null : text))

/** Someone's own details, as they edit them on their account page. */
export const myDetailsSchema = z.object({
  name: z.string().trim().min(1, "Give your name.").max(200, "Keep your name under 200 characters."),
  phone: optionalPhone,
  mailingAddress: optionalText(300)
})

/** A person as an administrator adds or edits them; their access changes only once they've joined. */
export const personInputSchema = z.object({
  name: z.string().trim().min(1, "Give their name.").max(200, "Keep the name under 200 characters."),
  email: z
    .union([z.literal(""), z.email("Give an email address such as name@example.com.")])
    .transform((email) => emailKey(email)),
  phone: optionalPhone,
  mailingAddress: optionalText(300),
  access: z.enum(accessLevels)
})

/** A unit as an administrator adds or edits it. */
export const unitInputSchema = z.object({
  label: z.string().trim().min(1, "Give the unit a name.").max(200),
  lot: optionalText(60),
  street: optionalText(200),
  unitNumber: optionalText(30),
  city: optionalText(100),
  state: optionalText(40),
  postalCode: optionalText(20),
  place: z
    .object({
      id: z.string().min(1).max(300),
      latitude: z.number().min(-90).max(90),
      longitude: z.number().min(-180).max(180)
    })
    .nullable()
})

/** A unit as its form gives it. */
export type UnitInput = z.input<typeof unitInputSchema>

const day = z.union([z.literal(""), z.iso.date("Give a date.")]).transform((text) => (text === "" ? null : text))

/** Someone added to a unit. */
export const unitLinkInputSchema = z.object({
  unitId: z.string().min(1),
  personId: z.string().min(1),
  relation: z.enum(unitRelations),
  startedOn: day
})

/** A committee as an administrator adds or renames it. */
export const committeeInputSchema = z.object({
  name: z.string().trim().min(1, "Give the committee's name.").max(200),
  kind: z.enum(committeeKinds)
})

/** Someone added to a committee. */
export const committeeMemberInputSchema = z.object({
  committeeId: z.string().min(1),
  personId: z.string().min(1),
  role: z.enum(committeeRoles),
  office: optionalText(80),
  startedOn: day
})

/** Someone's role in the app: an admin manages the association; a member uses it. */
export const accessLabels: Record<Access, string> = { administrator: "Admin", member: "Member" }
export const relationLabels: Record<UnitRelation, string> = { owner: "Owner", resident: "Resident", tenant: "Tenant" }

/** Someone's seat on a committee as people say it: their office and whether they chair it, or Member. */
export const seatLabel = (member: Pick<CommitteeMember, "office" | "role">) =>
  [member.office, member.role === "chair" ? "Chair" : null].filter(Boolean).join(", ") || "Member"
export const committeeKindLabels: Record<CommitteeKind, string> = {
  board: "Board",
  architectural: "Architectural committee",
  other: "Committee"
}
