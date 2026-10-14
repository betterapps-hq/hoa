/** The workspaces people sign in to: a person's access on the association's roll sets theirs (docs/design/people.md). */
export const roleIds = ["homeowner", "administrator"] as const
export type RoleId = (typeof roleIds)[number]

export type NavItem = { title: string; to: "/" | "/rules" | "/project-types" | "/applications" | "/people" }

/** A group of the sidebar's links, under its heading; the first, the dashboard, has none. */
export type NavSection = { label: string | null; items: NavItem[] }

export type Role = {
  id: RoleId
  name: string
  description: string
  navigation: NavSection[]
}

export const roles: Record<RoleId, Role> = {
  homeowner: {
    id: "homeowner",
    name: "Homeowner",
    description: "Submit projects for review",
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
    description: "Manage the whole HOA",
    navigation: [
      { label: null, items: [{ title: "Dashboard", to: "/" }] },
      {
        label: "Organization",
        items: [
          { title: "Applications", to: "/applications" },
          { title: "Project types", to: "/project-types" },
          { title: "Rulebook", to: "/rules" },
          { title: "People", to: "/people" }
        ]
      }
    ]
  }
}

/** Throws unless the role is the HOA's administrator: every review, build and publishing action checks it. */
export function assertAdministrator(role: RoleId) {
  if (role !== "administrator") {
    throw new Error("Only an administrator can do this.")
  }
}
