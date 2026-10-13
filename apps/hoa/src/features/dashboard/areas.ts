import { ClipboardCheckIcon, ScrollTextIcon, type LucideIcon } from "lucide-react"

// The areas of the HOA the portal manages (docs/dashboard.md). Everything a dashboard lists, what needs attention and
// what happened, belongs to one, and says which by its icon and name. Violations and fines, dues, maintenance requests
// and voting join these as they're built; until then the homeowner's dashboard shows them with sample data
// (samples.ts).

export type Area = {
  /** The area's name, as every list names it. */
  label: string
  /** The icon the sidebar gives the area's main page. */
  icon: LucideIcon
}

export const areas = {
  "architectural-review": { label: "Architectural review", icon: ClipboardCheckIcon },
  rulebook: { label: "Rulebook", icon: ScrollTextIcon }
} as const satisfies Record<string, Area>

export type AreaId = keyof typeof areas
