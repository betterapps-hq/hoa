import { createServerFn } from "@tanstack/react-start"
import { isGoogleConfigured } from "@/auth/auth.server"
import type { RoleId } from "@/features/role/roles"
import type { HoaSettings } from "@/hoa/hoa"
import { roleOf } from "@/people/people"
import { getMembership, getSignedInAccount } from "./requestContext.server"

export type SessionUser = { name: string; email: string }

/**
 * Where the visitor stands: signed out; signed in with an email no association's roll has yet; or a member of one, with
 * their role in it.
 */
export type Session =
  | { status: "signed-out"; isGoogleConfigured: boolean }
  | { status: "unaffiliated"; user: SessionUser }
  | {
      status: "member"
      roleId: RoleId
      hoaName: string
      /** The units the organization's forms offer for amounts. */
      unitSystem: HoaSettings["unitSystem"]
      user: SessionUser
    }

/** The signed-in user, their role and their HOA, for the app shell and the sign-in pages. */
export const getSession = createServerFn({ method: "GET" }).handler(async (): Promise<Session> => {
  const account = await getSignedInAccount()
  if (!account) {
    return { status: "signed-out", isGoogleConfigured: isGoogleConfigured() }
  }
  const membership = await getMembership(account)
  if (!membership) {
    return { status: "unaffiliated", user: { name: account.name, email: account.email } }
  }
  const { hoa, person } = membership
  return {
    status: "member",
    roleId: roleOf(person),
    hoaName: hoa.name,
    unitSystem: hoa.settings.unitSystem,
    user: { name: account.name || person.name, email: account.email }
  }
})
