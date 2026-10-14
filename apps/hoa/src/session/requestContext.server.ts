import { deleteCookie, getCookie, getRequestHeaders, getRequestUrl, setCookie } from "@tanstack/react-start/server"
import { getAuth } from "@/auth/auth.server"
import { getDb } from "@/db/client.server"
import { isMember, joinRolls } from "@/db/membershipRepository"
import { firstOrganization, getOrganization } from "@/db/organizationRepository"
import { committeesInView, insertPerson, peopleForAccount } from "@/db/peopleRepository"
import { assertAdministrator, assertWorkOf, type RoleId } from "@/features/role/roles"
import type { Organization } from "@/organization/organization"
import { emailKey, roleOf, type Access, type Committee, type Person } from "@/people/people"
import type { RequestUser } from "./users"

export type RequestContext = {
  organization: Organization
  role: RoleId
  user: RequestUser
  /** Who they are on the roll; null for a platform operator looking at an organization they're not on. */
  person: Person | null
  /** Their membership's: "administrator" manages the organization. */
  access: Access
  /** The committees whose work they do (`committeesInView`). */
  committees: Committee[]
}

type AuthSession = NonNullable<Awaited<ReturnType<ReturnType<typeof getAuth>["api"]["getSession"]>>>

/** The account a Better Auth session is signed in to, and the organization it's in. */
export function accountOf({ user, session }: AuthSession) {
  const { id, name, email, emailVerified } = user
  return {
    id,
    name,
    email,
    emailVerified,
    activeOrganizationId: session.activeOrganizationId ?? null,
    // The platform's operators (Better Auth's admin plugin), and the operator viewing the app as this account.
    isOperator: user.role === "admin",
    impersonatedBy: session.impersonatedBy ?? null
  }
}

/** The signed-in account, from its session cookie; null when nobody is signed in. */
export async function getSignedInAccount() {
  const session = await getAuth().api.getSession({ headers: getRequestHeaders() })
  return session ? accountOf(session) : null
}

export type SignedInAccount = ReturnType<typeof accountOf>

/** The organization a platform operator opened without being a member of it. */
const operatorOrganizationCookie = "operator_organization"

/**
 * The organization an account is in, who it is on the roll there, and its access. Signing in joins every roll with its
 * email (`peopleForAccount`, `joinRolls`); a member who isn't on the roll, such as one the platform's operators added,
 * is put on it. The session's active organization, or the first joined. A platform operator can open any organization
 * (`openOrganization`) and works in it as an administrator without being on its roll; one in none lands in the first.
 * Null when it's in none. `memberOf` lists the organizations it's a member of.
 */
export async function getMembership(account: SignedInAccount): Promise<{
  organization: Organization
  person: Person | null
  access: Access
  memberOf: string[]
} | null> {
  const db = getDb()
  const now = new Date()
  const people = await peopleForAccount(db, account)
  const memberships = await joinRolls(db, account, people, now)
  const memberOf = memberships.map(({ organizationId }) => organizationId)
  const chosenId =
    (account.isOperator ? getCookie(operatorOrganizationCookie) : undefined) ?? account.activeOrganizationId
  const chosen = memberships.find(({ organizationId }) => organizationId === chosenId)
  if (!chosen && account.isOperator) {
    const opened = chosenId ? await getOrganization(db, chosenId) : null
    const organization = opened ?? (memberships.length === 0 ? await firstOrganization(db) : null)
    if (organization) {
      return { organization, person: null, access: "administrator", memberOf }
    }
  }
  const membership = chosen ?? memberships[0]
  if (!membership) {
    return null
  }
  const { organizationId, access } = membership
  const [organization, person] = await Promise.all([
    getOrganization(db, organizationId),
    people.find((candidate) => candidate.organizationId === organizationId) ??
      insertPerson(
        db,
        organizationId,
        { name: account.name || account.email, email: emailKey(account.email), phone: null, mailingAddress: null },
        now.toISOString(),
        account.id
      )
  ])
  return organization ? { organization, person, access, memberOf } : null
}

/**
 * Opens another organization: one the account is a member of, as Better Auth's active organization; or, for a platform
 * operator, any, remembered in a cookie of its own.
 */
export async function openOrganization(account: SignedInAccount, organizationId: string) {
  const db = getDb()
  if (await isMember(db, organizationId, account.id)) {
    await getAuth().api.setActiveOrganization({ body: { organizationId }, headers: getRequestHeaders() })
    deleteCookie(operatorOrganizationCookie, { path: "/" })
    return
  }
  if (!account.isOperator || !(await getOrganization(db, organizationId))) {
    throw new Error("You're not a member of that association.")
  }
  setCookie(operatorOrganizationCookie, organizationId, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: new URL(getRequestUrl()).protocol === "https:",
    maxAge: 60 * 60 * 24 * 30
  })
}

/**
 * Who is asking, and for which HOA. Server functions take the HOA and user only from here, never from their input:
 * the signed-in account, and the person it is on the association's roll, whose access sets the role.
 */
export async function getRequestContext(): Promise<RequestContext> {
  const account = await getSignedInAccount()
  if (!account) {
    throw new Error("Sign in first.")
  }
  const membership = await getMembership(account)
  if (!membership) {
    throw new Error("Your email isn't on an association's roll yet.")
  }
  const { organization, person, access } = membership
  return {
    organization,
    role: roleOf(access),
    user: { id: account.id, name: account.name || person?.name || account.email, email: account.email },
    person,
    access,
    committees: await committeesInView(
      getDb(),
      { id: person?.id ?? null, organizationId: organization.id },
      access,
      new Date().toISOString().slice(0, 10)
    )
  }
}

/** Throws unless the request comes from an administrator, or someone who sits on a committee of the kind. */
export async function requireWorkOf(kind: Parameters<typeof assertWorkOf>[2]): Promise<RequestContext> {
  const context = await getRequestContext()
  assertWorkOf(context.role, context.committees, kind)
  return context
}

/** Throws unless the request comes from one of the HOA's administrators. */
export async function requireAdministrator(): Promise<RequestContext> {
  const context = await getRequestContext()
  assertAdministrator(context.role)
  return context
}
