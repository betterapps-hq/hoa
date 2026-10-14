import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { isGoogleConfigured, turnstileSiteKey } from "@/auth/auth.server"
import { getDb } from "@/db/client.server"
import { listOrganizations } from "@/db/organizationRepository"
import { committeesInView } from "@/db/peopleRepository"
import type { RoleId } from "@/features/role/roles"
import type { OrganizationSettings } from "@/organization/organization"
import { roleOf, type Committee } from "@/people/people"
import { getMembership, getSignedInAccount, openOrganization } from "./requestContext.server"

export type SessionUser = { name: string; email: string }

/**
 * Where the visitor stands: signed out; signed in with an email no association's roll has yet; or a member of one, with
 * their role in it.
 */
export type Session =
  | { status: "signed-out"; isGoogleConfigured: boolean; turnstileSiteKey: string | null }
  | { status: "unaffiliated"; user: SessionUser }
  | {
      status: "member"
      roleId: RoleId
      organizationId: string
      organizationName: string
      organizationLogo: string | null
      /** The organizations they can switch to, this one among them: every one for an operator; empty with just one. */
      organizations: { id: string; name: string; logo: string | null }[]
      /** The committees whose work they do, for the sidebar's sections. */
      committees: Pick<Committee, "name" | "kind">[]
      /** The units the organization's forms offer for amounts. */
      unitSystem: OrganizationSettings["unitSystem"]
      user: SessionUser
      /** Their person on the organization's roll; null for an operator looking at one they're not on. */
      personId: string | null
      /** One of the platform's operators, who can view the app as someone. */
      isOperator: boolean
      /** An operator is viewing the app as this account. */
      isViewingAs: boolean
    }

/** The signed-in user, their role and their HOA, for the app shell and the sign-in pages. */
export const getSession = createServerFn({ method: "GET" }).handler(async (): Promise<Session> => {
  const account = await getSignedInAccount()
  if (!account) {
    return { status: "signed-out", isGoogleConfigured: isGoogleConfigured(), turnstileSiteKey: turnstileSiteKey() }
  }
  const membership = await getMembership(account)
  if (!membership) {
    return { status: "unaffiliated", user: { name: account.name, email: account.email } }
  }
  const { organization, person, access, memberOf } = membership
  const db = getDb()
  const [committees, organizations] = await Promise.all([
    committeesInView(
      db,
      { id: person?.id ?? null, organizationId: organization.id },
      access,
      new Date().toISOString().slice(0, 10)
    ),
    account.isOperator || memberOf.length > 1 ? listOrganizations(db, account.isOperator ? undefined : memberOf) : []
  ])
  return {
    status: "member",
    roleId: roleOf(access),
    organizationId: organization.id,
    organizationName: organization.name,
    organizationLogo: organization.logo,
    organizations,
    committees: committees.map(({ name, kind }) => ({ name, kind })),
    unitSystem: organization.settings.unitSystem,
    user: { name: account.name || person?.name || account.email, email: account.email },
    personId: person?.id ?? null,
    isOperator: account.isOperator,
    isViewingAs: account.impersonatedBy !== null
  }
})

/** Opens another organization: one they're a member of or, for the platform's operators, any (`openOrganization`). */
export const switchOrganization = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ id: z.string().min(1) }).parse(data))
  .handler(async ({ data }) => {
    const account = await getSignedInAccount()
    if (!account) {
      throw new Error("Sign in first.")
    }
    await openOrganization(account, data.id)
  })
