import { getRequestHeaders } from "@tanstack/react-start/server"
import { getAuth } from "@/auth/auth.server"
import { getDb } from "@/db/client.server"
import { getHoa } from "@/db/hoaRepository"
import { committeesInView, peopleForAccount } from "@/db/peopleRepository"
import { assertAdministrator, assertWorkOf, type RoleId } from "@/features/role/roles"
import type { Hoa } from "@/hoa/hoa"
import { roleOf, type Committee, type Person } from "@/people/people"
import type { RequestUser } from "./users"

export type RequestContext = {
  hoa: Hoa
  role: RoleId
  user: RequestUser
  person: Person
  /** The committees whose work they do (`committeesInView`). */
  committees: Committee[]
}

/** The signed-in account, from its session cookie; null when nobody is signed in. */
export async function getSignedInAccount() {
  const session = await getAuth().api.getSession({ headers: getRequestHeaders() })
  if (!session) {
    return null
  }
  const { id, name, email, emailVerified } = session.user
  return { id, name, email, emailVerified }
}

export type SignedInAccount = NonNullable<Awaited<ReturnType<typeof getSignedInAccount>>>

/**
 * The association an account belongs to, and who it is there: the person on the roll with its email, linked the first
 * time it signs in. Null when no roll has its email yet. Someone on several rolls gets the first they joined, until the
 * app lets them switch.
 */
export async function getMembership(account: SignedInAccount) {
  const db = getDb()
  const [person] = await peopleForAccount(db, account)
  if (!person) {
    return null
  }
  const hoa = await getHoa(db, person.hoaId)
  return hoa ? { hoa, person } : null
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
  const { hoa, person } = membership
  return {
    hoa,
    role: roleOf(person),
    user: { id: account.id, name: account.name || person.name, email: account.email },
    person,
    committees: await committeesInView(getDb(), person, new Date().toISOString().slice(0, 10))
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
