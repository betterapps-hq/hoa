import { createServerFn } from "@tanstack/react-start"
import { isGoogleConfigured, turnstileSiteKey } from "@/auth/auth.server"
import { getDb } from "@/db/client.server"
import { committeesInView } from "@/db/peopleRepository"
import type { RoleId } from "@/features/role/roles"
import type { OrganizationSettings } from "@/organization/organization"
import { roleOf, type Committee } from "@/people/people"
import { getMembership, getSignedInAccount } from "./requestContext.server"

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
      organizationName: string
      /** The committees whose work they do, for the sidebar's sections. */
      committees: Pick<Committee, "name" | "kind">[]
      /** The units the organization's forms offer for amounts. */
      unitSystem: OrganizationSettings["unitSystem"]
      user: SessionUser
      /** Their person on the organization's roll. */
      personId: string
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
  const { organization, person, access } = membership
  const committees = await committeesInView(getDb(), person, access, new Date().toISOString().slice(0, 10))
  return {
    status: "member",
    roleId: roleOf(access),
    organizationName: organization.name,
    committees: committees.map(({ name, kind }) => ({ name, kind })),
    unitSystem: organization.settings.unitSystem,
    user: { name: account.name || person.name, email: account.email },
    personId: person.id,
    isOperator: account.isOperator,
    isViewingAs: account.impersonatedBy !== null
  }
})
