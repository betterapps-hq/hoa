import { getRequestHeaders } from "@tanstack/react-start/server"
import { getAuth } from "@/auth/auth.server"
import { getDb } from "@/db/client.server"
import { joinRolls } from "@/db/membershipRepository"
import { getOrganization } from "@/db/organizationRepository"
import { committeesInView, insertPerson, peopleForAccount } from "@/db/peopleRepository"
import { assertAdministrator, assertWorkOf, type RoleId } from "@/features/role/roles"
import type { Organization } from "@/organization/organization"
import { emailKey, roleOf, type Access, type Committee, type Person } from "@/people/people"
import type { RequestUser } from "./users"

export type RequestContext = {
  organization: Organization
  role: RoleId
  user: RequestUser
  person: Person
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

/**
 * The organization an account is in, who it is on the roll there, and its access. Signing in joins every roll with its
 * email (`peopleForAccount`, `joinRolls`); a member who isn't on the roll, such as one the platform's operators added,
 * is put on it. The session's active organization, or the first joined. Null when it's in none.
 */
export async function getMembership(account: SignedInAccount) {
  const db = getDb()
  const now = new Date()
  const people = await peopleForAccount(db, account)
  const memberships = await joinRolls(db, account, people, now)
  const membership =
    memberships.find(({ organizationId }) => organizationId === account.activeOrganizationId) ?? memberships[0]
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
  return organization ? { organization, person, access } : null
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
    user: { id: account.id, name: account.name || person.name, email: account.email },
    person,
    access,
    committees: await committeesInView(getDb(), person, access, new Date().toISOString().slice(0, 10))
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
