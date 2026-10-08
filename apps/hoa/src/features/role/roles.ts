/** Demo roles. The sidebar's role switcher sets the active one so a demo can show both sides of the review. */
export const roleIds = ["homeowner", "administrator"] as const
export type RoleId = (typeof roleIds)[number]

/** The demo role switcher's cookie. */
export const roleCookie = "hoa-role"

export type NavItem = { title: string; to: "/" | "/documents" | "/rules" | "/submit" }

export type Role = {
  id: RoleId
  name: string
  description: string
  user: { name: string; email: string; initials: string }
  navigation: NavItem[]
}

export const roles: Record<RoleId, Role> = {
  homeowner: {
    id: "homeowner",
    name: "Homeowner",
    description: "Submit projects for review",
    user: { name: "Jordan Avery", email: "jordan@example.com", initials: "JA" },
    navigation: [
      { title: "Dashboard", to: "/" },
      { title: "Submit a project", to: "/submit" }
    ]
  },
  administrator: {
    id: "administrator",
    name: "Administrator",
    description: "Manage the HOA rulebook",
    user: { name: "Sam Rivera", email: "sam@example.com", initials: "SR" },
    navigation: [
      { title: "Dashboard", to: "/" },
      { title: "Documents", to: "/documents" },
      { title: "Rulebook", to: "/rules" },
      { title: "Review an application", to: "/submit" }
    ]
  }
}

export function isRoleId(value: unknown): value is RoleId {
  return roleIds.some((id) => id === value)
}
