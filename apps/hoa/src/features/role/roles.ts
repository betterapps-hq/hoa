/** Demo roles. The sidebar's role switcher sets the active one so a demo can show both sides of the review. */
export const roleIds = ["homeowner", "administrator"] as const
export type RoleId = (typeof roleIds)[number]

/** The demo role switcher's cookie. */
export const roleCookie = "hoa-role"

export type NavItem = { title: string; to: "/" | "/rules" | "/project-types" | "/applications" }

/** A group of the sidebar's links, under its heading; the first, the dashboard, has none. */
export type NavSection = { label: string | null; items: NavItem[] }

export type Role = {
  id: RoleId
  name: string
  description: string
  user: { name: string; email: string; initials: string }
  navigation: NavSection[]
}

export const roles: Record<RoleId, Role> = {
  homeowner: {
    id: "homeowner",
    name: "Homeowner",
    description: "Submit projects for review",
    user: { name: "Jordan Avery", email: "jordan@example.com", initials: "JA" },
    navigation: [
      { label: null, items: [{ title: "Dashboard", to: "/" }] },
      {
        label: "Organization",
        items: [
          { title: "Applications", to: "/applications" },
          { title: "Rulebook", to: "/rules" }
        ]
      }
    ]
  },
  administrator: {
    id: "administrator",
    name: "Administrator",
    description: "Manage the rulebook and decide applications",
    user: { name: "Sam Rivera", email: "sam@example.com", initials: "SR" },
    navigation: [
      { label: null, items: [{ title: "Dashboard", to: "/" }] },
      {
        label: "Organization",
        items: [
          { title: "Applications", to: "/applications" },
          { title: "Project types", to: "/project-types" },
          { title: "Rulebook", to: "/rules" }
        ]
      }
    ]
  }
}

export function isRoleId(value: unknown): value is RoleId {
  return roleIds.some((id) => id === value)
}

/** Throws unless the role is the HOA's administrator: every review, build and publishing action checks it. */
export function assertAdministrator(role: RoleId) {
  if (role !== "administrator") {
    throw new Error("Only an administrator can do this.")
  }
}
