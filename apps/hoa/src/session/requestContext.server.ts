import { getCookie, getRequestHeader } from "@tanstack/react-start/server"
import { getDb } from "@/db/client.server"
import { getDefaultHoa } from "@/db/hoaRepository"
import { assertAdministrator, isRoleId, roleCookie, roles, type RoleId } from "@/features/role/roles"
import type { Hoa } from "@/hoa/hoa"

export type RequestUser = { id: string; name: string; email: string }

export type RequestContext = { hoa: Hoa; role: RoleId; user: RequestUser }

/**
 * Who is asking, and for which HOA. Server functions take the HOA and user only from here, never from their input.
 * The user is the Cloudflare Access identity when Access is on, otherwise the demo user for the selected role; the
 * role comes from the demo role switcher's cookie.
 */
export async function getRequestContext(): Promise<RequestContext> {
  const cookieRole = getCookie(roleCookie)
  const role: RoleId = isRoleId(cookieRole) ? cookieRole : "homeowner"
  const accessEmail = getRequestHeader("cf-access-authenticated-user-email")
  const demoUser = roles[role].user
  const user = accessEmail
    ? { id: accessEmail, name: accessEmail, email: accessEmail }
    : { id: `demo-${role}`, name: demoUser.name, email: demoUser.email }
  return { hoa: await getDefaultHoa(getDb()), role, user }
}

/** Throws unless the request comes from the HOA's administrator role. */
export async function requireAdministrator(): Promise<RequestContext> {
  const context = await getRequestContext()
  assertAdministrator(context.role)
  return context
}
