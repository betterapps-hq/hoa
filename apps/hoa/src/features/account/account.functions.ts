import { createServerFn } from "@tanstack/react-start"
import { getRequestHeaders } from "@tanstack/react-start/server"
import { isPasswordCompromised } from "better-auth/plugins"
import { and, eq, gt } from "drizzle-orm"
import { z } from "zod"
import { compromisedPasswordMessage, getAuth, isGoogleConfigured } from "@/auth/auth.server"
import { getDb } from "@/db/client.server"
import { claimUnit, getRoll, updatePerson } from "@/db/peopleRepository"
import { accounts, sessions } from "@/db/schema"
import { myDetailsSchema, type Access, type CommitteeRole, type UnitRelation } from "@/people/people"
import { personRows, unitRows } from "@/people/roll"
import { accountOf, getMembership, type SignedInAccount } from "@/session/requestContext.server"
import { deviceOf, type DeviceKind } from "./devices"

/** A browser signed in to the account. */
export type AccountDevice = {
  id: string
  name: string
  kind: DeviceKind
  lastActiveAt: string
  /** The browser showing the page. */
  isCurrent: boolean
}

/** A home on the association's roll that someone could claim as theirs. */
export type ClaimableHome = {
  id: string
  label: string
  /** Its lot and address, when the roll has them. */
  detail: string | null
  /** Someone owns it already, so it can't be claimed. */
  isOwned: boolean
}

/** What the association's roll says about the account's person. */
export type AccountMembership = {
  association: string
  access: Access
  phone: string | null
  mailingAddress: string | null
  homes: { id: string; label: string; relation: UnitRelation; since: string | null }[]
  committees: { id: string; name: string; role: CommitteeRole; office: string | null }[]
  /** Every home on the roll they don't own or live in, for claiming theirs. */
  claimable: ClaimableHome[]
}

export type AccountDetails = {
  name: string
  email: string
  /** When the account was made. */
  createdAt: string
  hasPassword: boolean
  /** The linked Google account's id here, to disconnect it; null when none is linked. */
  googleAccountId: string | null
  isGoogleConfigured: boolean
  /** Null before an association's roll has the account's email. */
  membership: AccountMembership | null
  /** The current browser first, then the most recently active. */
  devices: AccountDevice[]
  /** When the server read all this, so the page says how long ago things were the same way on both sides. */
  asOf: string
}

async function requireSession() {
  const session = await getAuth().api.getSession({ headers: getRequestHeaders() })
  if (!session) {
    throw new Error("Sign in first.")
  }
  return session
}

async function membershipOf(account: SignedInAccount) {
  const membership = await getMembership(account)
  if (!membership?.person) {
    return null
  }
  const { organization, person, access } = membership
  const today = new Date().toISOString().slice(0, 10)
  const roll = await getRoll(getDb(), organization.id)
  const row = personRows(roll, today).find((candidate) => candidate.person.id === person.id)
  const mine = new Set((row?.units ?? []).map(({ unit }) => unit.id))
  return {
    association: organization.name,
    access,
    phone: person.phone,
    mailingAddress: person.mailingAddress,
    homes: (row?.units ?? []).map(({ unit, link }) => ({
      id: link.id,
      label: unit.label,
      relation: link.relation,
      since: link.startedOn
    })),
    committees: (row?.committees ?? []).map(({ committee, member }) => ({
      id: member.id,
      name: committee.name,
      role: member.role,
      office: member.office
    })),
    claimable: unitRows(roll, today)
      .filter(({ unit }) => !mine.has(unit.id))
      .map(({ unit, people }) => ({
        id: unit.id,
        label: unit.label,
        detail: [unit.lot, unit.address].filter(Boolean).join(", ") || null,
        isOwned: people.some(({ link }) => link.relation === "owner")
      }))
  }
}

/** The signed-in account: who they are, what their association has on file, how they sign in, and where. */
export const getAccountDetails = createServerFn({ method: "GET" }).handler(async (): Promise<AccountDetails> => {
  const authSession = await requireSession()
  const { user, session } = authSession
  const db = getDb()
  const [methods, signedIn, membership] = await Promise.all([
    db.select({ id: accounts.id, providerId: accounts.providerId }).from(accounts).where(eq(accounts.userId, user.id)),
    db
      .select({
        id: sessions.id,
        userAgent: sessions.userAgent,
        updatedAt: sessions.updatedAt
      })
      .from(sessions)
      .where(and(eq(sessions.userId, user.id), gt(sessions.expiresAt, new Date()))),
    membershipOf(accountOf(authSession))
  ])
  const devices = signedIn
    .map((row) => ({
      id: row.id,
      ...deviceOf(row.userAgent),
      lastActiveAt: row.updatedAt.toISOString(),
      isCurrent: row.id === session.id
    }))
    .toSorted((a, b) => Number(b.isCurrent) - Number(a.isCurrent) || b.lastActiveAt.localeCompare(a.lastActiveAt))
  return {
    name: user.name,
    email: user.email,
    createdAt: user.createdAt.toISOString(),
    hasPassword: methods.some((method) => method.providerId === "credential"),
    googleAccountId: methods.find((method) => method.providerId === "google")?.id ?? null,
    isGoogleConfigured: isGoogleConfigured(),
    membership,
    devices,
    asOf: new Date().toISOString()
  }
})

/** Makes the signed-in person the owner of a home on their association's roll that nobody owns yet. */
export const claimHome = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ unitId: z.string().min(1) }).parse(data))
  .handler(async ({ data }) => {
    const membership = await getMembership(accountOf(await requireSession()))
    if (!membership?.person) {
      throw new Error("Your email isn't on this association's roll.")
    }
    const now = new Date().toISOString()
    const claimed = await claimUnit(
      getDb(),
      membership.organization.id,
      { unitId: data.unitId, personId: membership.person.id },
      now.slice(0, 10),
      now
    )
    if (!claimed) {
      throw new Error("That home already has an owner on the roll. Ask your board or an administrator to change it.")
    }
  })

/** Saves someone's own name, on their account and the roll, and the phone and mailing address the roll has for them. */
export const saveMyDetails = createServerFn({ method: "POST" })
  .validator((data: unknown) => myDetailsSchema.parse(data))
  .handler(async ({ data }) => {
    const authSession = await requireSession()
    const db = getDb()
    // Through Better Auth, so the session's cached copy of the user changes too.
    await getAuth().api.updateUser({ body: { name: data.name }, headers: getRequestHeaders() })
    const membership = await getMembership(accountOf(authSession))
    if (membership?.person) {
      const { person } = membership
      await updatePerson(
        db,
        person,
        {
          name: data.name,
          email: person.email,
          phone: data.phone,
          mailingAddress: data.mailingAddress
        },
        new Date().toISOString()
      )
    }
  })

/** Adds a password to an account that signs in by code or Google. Changing one goes through Better Auth's client. */
export const addPassword = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({
        password: z.string().min(10, "Use at least 10 characters.").max(128, "Use at most 128 characters.")
      })
      .parse(data)
  )
  .handler(async ({ data }) => {
    const { user } = await requireSession()
    const existing = await getDb()
      .select({ id: accounts.id })
      .from(accounts)
      .where(and(eq(accounts.userId, user.id), eq(accounts.providerId, "credential")))
      .get()
    if (existing) {
      throw new Error("This account has a password already. Change it instead.")
    }
    // Better Auth's breach check runs on its own endpoints' requests, not on a call from the server like this one.
    if (await isPasswordCompromised(data.password)) {
      throw new Error(compromisedPasswordMessage)
    }
    await getAuth().api.setPassword({ body: { newPassword: data.password }, headers: getRequestHeaders() })
  })

/** Signs one of the account's other browsers out. */
export const signOutDevice = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ id: z.string().min(1) }).parse(data))
  .handler(async ({ data }) => {
    const { user, session } = await requireSession()
    if (data.id === session.id) {
      throw new Error("To sign out here, use Sign out in your menu.")
    }
    const device = await getDb()
      .select({ token: sessions.token })
      .from(sessions)
      .where(and(eq(sessions.id, data.id), eq(sessions.userId, user.id)))
      .get()
    if (device) {
      await getAuth().api.revokeSession({ body: { token: device.token }, headers: getRequestHeaders() })
    }
  })
