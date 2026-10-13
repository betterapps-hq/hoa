import { CalendarDaysIcon, MegaphoneIcon, ReceiptIcon, TriangleAlertIcon, WrenchIcon } from "lucide-react"
import type { Area } from "./areas"
import { dateText } from "./dashboardDisplay"

// Sample data for the parts of an HOA portal the app doesn't have yet (docs/dashboard.md, Samples), so the homeowner's
// dashboard shows the whole portal: dues, violation notices, maintenance requests, meetings and votes, and the board's
// announcements. Each is replaced by its area's own records when that area is built. Nothing here stands in for what
// the app has: applications and the rulebook are always the real ones. Dates count from the moment the dashboard is
// read, so the samples stay current, and every sample is shown marked as one.

const day = 24 * 60 * 60 * 1000

export const sampleAreas = {
  dues: { label: "Dues", icon: ReceiptIcon },
  violations: { label: "Violations", icon: TriangleAlertIcon },
  maintenance: { label: "Maintenance requests", icon: WrenchIcon },
  meetings: { label: "Meetings and votes", icon: CalendarDaysIcon },
  announcements: { label: "Announcements", icon: MegaphoneIcon }
} as const satisfies Record<string, Area>

/** A sample to-do: what it's about, when it's due, and what's needed. */
export type SampleAttention = {
  id: string
  area: Area
  subject: string
  aside: string
  detail: string | null
  note: string
}

/** A sample area's state, in a sentence. */
export type SampleStanding = { id: string; area: Area; text: string }

/** A sample of something that happened. */
export type SampleEvent = { id: string; area: Area; at: string; subject: string; detail: string | null; note: string }

/** The moment some days from another; negative for before it. */
const daysFrom = (at: string, days: number) => new Date(Date.parse(at) + days * day).toISOString()

/** The first day of the month after the moment's: when the next assessment is due. */
function nextDueDate(asOf: string) {
  const now = new Date(asOf)
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString()
}

/** What waits on a homeowner in the areas the app doesn't have yet. */
export function sampleAttention(asOf: string): SampleAttention[] {
  const due = nextDueDate(asOf)
  const noticed = daysFrom(asOf, -4)
  return [
    {
      id: "sample-dues",
      area: sampleAreas.dues,
      subject: "Quarterly assessment",
      aside: `Due ${dateText(due)}`,
      detail: null,
      note: "$350 for the next three months."
    },
    {
      id: "sample-violation",
      area: sampleAreas.violations,
      subject: "Courtesy notice",
      aside: `Fix by ${dateText(daysFrom(noticed, 14))}`,
      detail: "Trash cans visible from the street.",
      note: "Move them out of view, or ask the committee for a hearing."
    }
  ]
}

/** Where a homeowner stands in the areas the app doesn't have yet. */
export function sampleStandings(asOf: string): SampleStanding[] {
  const due = nextDueDate(asOf)
  return [
    {
      id: "sample-dues",
      area: sampleAreas.dues,
      text: `Paid through ${dateText(daysFrom(due, -1))}. The next assessment, $350, is due ${dateText(due)}.`
    },
    {
      id: "sample-violations",
      area: sampleAreas.violations,
      text: "1 open notice, about trash cans visible from the street."
    },
    {
      id: "sample-maintenance",
      area: sampleAreas.maintenance,
      text: `1 open request: a streetlight out near your home, reported ${dateText(daysFrom(asOf, -9))}.`
    },
    {
      id: "sample-meetings",
      area: sampleAreas.meetings,
      text: `Board meeting ${dateText(daysFrom(asOf, 9))} at 7 pm. Ballots for the board election open ${dateText(daysFrom(asOf, 13))}.`
    }
  ]
}

/** The board's announcements, as a homeowner's recent activity would list them. */
export function sampleActivity(asOf: string): SampleEvent[] {
  return [
    {
      id: "sample-landscaping",
      area: sampleAreas.announcements,
      at: daysFrom(asOf, -2),
      subject: "Landscaping in the common areas",
      detail: "Crews are working on weekdays through the end of the month.",
      note: "Posted by Morgan Lee for the board"
    },
    {
      id: "sample-minutes",
      area: sampleAreas.announcements,
      at: daysFrom(asOf, -6),
      subject: "Board meeting minutes",
      detail: "The minutes from the last board meeting are ready to read.",
      note: "Posted by Morgan Lee for the board"
    }
  ]
}
