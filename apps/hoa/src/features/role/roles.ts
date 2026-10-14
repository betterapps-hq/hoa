import type { Committee, CommitteeKind } from "@/people/people"

/** The workspaces people sign in to: a person's access on the association's roll sets theirs (docs/design/people.md). */
export const roleIds = ["homeowner", "administrator"] as const
export type RoleId = (typeof roleIds)[number]

export type NavItem = {
  title: string
  to: "/" | "/rules" | "/project-types" | "/applications" | "/people" | "/settings"
}

/** A group of the sidebar's links, under its heading; the first, the dashboard, has none. */
export type NavSection = { label: string | null; items: NavItem[] }

export type Role = { id: RoleId; name: string; description: string }

export const roles: Record<RoleId, Role> = {
  homeowner: { id: "homeowner", name: "Homeowner", description: "Submit projects for review" },
  administrator: { id: "administrator", name: "Administrator", description: "Manage the whole HOA" }
}

/** The committees with work of their own in the app. */
type WorkingKind = Exclude<CommitteeKind, "other">

const committeeOnly: Record<WorkingKind, string> = {
  board: "Only the board or an administrator can do this.",
  architectural: "Only the architectural committee or an administrator can do this."
}

/** Whether someone does a kind of committee's work: an administrator, or someone who sits on such a committee. */
export const doesWorkOf = (role: RoleId, committees: readonly Pick<Committee, "kind">[], kind: WorkingKind) =>
  role === "administrator" || committees.some((committee) => committee.kind === kind)

/** Throws unless someone does a kind of committee's work (`doesWorkOf`). */
export function assertWorkOf(role: RoleId, committees: readonly Pick<Committee, "kind">[], kind: WorkingKind) {
  if (!doesWorkOf(role, committees, kind)) {
    throw new Error(committeeOnly[kind])
  }
}

/** The pages each kind of committee works in, under its name in the sidebar. */
const committeePages: Record<CommitteeKind, NavItem[]> = {
  board: [],
  architectural: [
    { title: "Applications", to: "/applications" },
    { title: "Project types", to: "/project-types" }
  ],
  other: []
}

/** The roll, which the board keeps. */
const peoplePage: NavItem = { title: "People", to: "/people" }

/**
 * The sidebar's sections: the dashboard; the organization's own pages; then a section for each committee whose work
 * they do (`committeesInView`) that has pages, named as the association names it. A page sits under the first committee
 * that works in it, and an administrator finds a page no committee has under the organization's.
 */
export function navigationFor(roleId: RoleId, committees: readonly Pick<Committee, "name" | "kind">[]): NavSection[] {
  const placed = new Set<NavItem["to"]>()
  const sections = committees.flatMap((committee) => {
    const items = committeePages[committee.kind].filter((item) => !placed.has(item.to))
    for (const item of items) {
      placed.add(item.to)
    }
    return items.length > 0 ? [{ label: committee.name, items }] : []
  })
  const organization: NavItem[] = [
    // Everyone sees their own applications; the architectural committee sees everyone's.
    { title: "Applications", to: "/applications" },
    ...(roleId === "administrator" ? committeePages.architectural.slice(1) : []),
    { title: "Rulebook", to: "/rules" },
    ...(doesWorkOf(roleId, committees, "board") ? [peoplePage] : []),
    // What the documents don't say about the association, kept by an administrator.
    ...(roleId === "administrator" ? [{ title: "Settings", to: "/settings" } as const] : [])
  ]
  return [
    { label: null, items: [{ title: "Dashboard", to: "/" }] },
    { label: "Organization", items: organization.filter((item) => !placed.has(item.to)) },
    ...sections
  ]
}

/** Throws unless the role is the HOA's administrator: every review, build and publishing action checks it. */
export function assertAdministrator(role: RoleId) {
  if (role !== "administrator") {
    throw new Error("Only an administrator can do this.")
  }
}
