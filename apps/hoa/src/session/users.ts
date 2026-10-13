import { roleIds, roles, type RoleId } from "@/features/role/roles"

/** A person using the app. */
export type RequestUser = { id: string; name: string; email: string }

/** The demo user for a role, who acts while Cloudflare Access is off. */
export const demoUserId = (role: RoleId) => `demo-${role}`

/**
 * Who a user id is, as far as the app knows: a demo role's user by their name, or a Cloudflare Access identity, whose id
 * is its email, by that email. Records keep the id of whoever acted, and lists name them through this.
 */
export function userOf(id: string): RequestUser {
  const role = roleIds.find((candidate) => demoUserId(candidate) === id)
  if (!role) {
    return { id, name: id, email: id }
  }
  const { name, email } = roles[role].user
  return { id, name, email }
}
