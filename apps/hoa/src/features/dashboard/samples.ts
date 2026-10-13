import { CalendarDaysIcon, MegaphoneIcon, ReceiptIcon, TriangleAlertIcon, WrenchIcon } from "lucide-react"
import type { Area } from "./areas"
import { dateText } from "./dashboardDisplay"

// Sample data for the parts of an HOA portal the app doesn't have yet (docs/dashboard.md, Samples), so both dashboards
// show the whole portal: dues, violations and fines, maintenance requests, meetings and votes, and the board's
// announcements. The homeowner sees their own home's; the HOA's management sees the whole community's. Each is replaced by its area's own records when that area is built. Nothing here stands in for what
// the app has: applications and the rulebook are always the real ones. Dates count from the moment the dashboard is
// read, so the samples stay current, and every sample is shown marked as one.

const day = 24 * 60 * 60 * 1000

export const sampleAreas = {
  dues: { label: "Dues", icon: ReceiptIcon },
  violations: { label: "Violations and fines", icon: TriangleAlertIcon },
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
export function homeownerSampleAttention(asOf: string): SampleAttention[] {
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
export function homeownerSampleStandings(asOf: string): SampleStanding[] {
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
export function homeownerSampleActivity(asOf: string): SampleEvent[] {
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

// The HOA's management: the whole community, as the board or its manager runs it. The figures agree with each other: 200
// homes paying a $350 quarterly assessment, $70,000 a quarter.

/** What waits on the HOA's management in the areas the app doesn't have yet. */
export function managementSampleAttention(asOf: string): SampleAttention[] {
  return [
    {
      id: "sample-late-dues",
      area: sampleAreas.dues,
      subject: "Late assessments",
      aside: `Were due ${dateText(thisQuarterDue(asOf))}`,
      detail: "12 homes owe $4,200, and 3 of them are more than 60 days late.",
      note: "Send reminders, or start late fees for the three."
    },
    {
      id: "sample-hearing",
      area: sampleAreas.violations,
      subject: "Hearing requested",
      aside: `Asked ${dateText(daysFrom(asOf, -3))}`,
      detail: "Lot 42 contests its $150 fine for an unapproved shed.",
      note: "Schedule the hearing before the board meeting."
    },
    {
      id: "sample-streetlight",
      area: sampleAreas.maintenance,
      subject: "Streetlight out on Birch Lane",
      aside: `Reported ${dateText(daysFrom(asOf, -9))}`,
      detail: "3 homeowners have reported it.",
      note: "Assign a vendor."
    },
    {
      id: "sample-agenda",
      area: sampleAreas.meetings,
      subject: "Board meeting agenda",
      aside: `Due ${dateText(daysFrom(asOf, 4))}`,
      detail: `For the meeting on ${dateText(daysFrom(asOf, 9))}.`,
      note: "Post it so homeowners can read it before the meeting."
    }
  ]
}

/** Where the community stands in the areas the app doesn't have yet. */
export function managementSampleStandings(asOf: string): SampleStanding[] {
  return [
    {
      id: "sample-dues",
      area: sampleAreas.dues,
      text: "94% of this quarter's assessments collected: $65,800 of $70,000. 12 homes owe the other $4,200."
    },
    {
      id: "sample-violations",
      area: sampleAreas.violations,
      text: "7 open: 4 courtesy notices, 2 unpaid fines totaling $300, and 1 hearing requested."
    },
    {
      id: "sample-maintenance",
      area: sampleAreas.maintenance,
      text: `3 open requests, the oldest reported ${dateText(daysFrom(asOf, -9))}.`
    },
    {
      id: "sample-meetings",
      area: sampleAreas.meetings,
      text: `Board meeting ${dateText(daysFrom(asOf, 9))} at 7 pm. Ballots for the board election open ${dateText(daysFrom(asOf, 13))}, for 2 seats and 4 candidates.`
    }
  ]
}

/** What happened lately across the community, in the areas the app doesn't have yet. */
export function managementSampleActivity(asOf: string): SampleEvent[] {
  return [
    {
      id: "sample-paid-online",
      area: sampleAreas.dues,
      at: daysFrom(asOf, -0.2),
      subject: "Assessment paid",
      detail: "Lot 17, $350",
      note: "Paid online by Taylor Brooks"
    },
    {
      id: "sample-request-closed",
      area: sampleAreas.maintenance,
      at: daysFrom(asOf, -1),
      subject: "Request closed",
      detail: "The pool gate's latch is repaired.",
      note: "Closed by Morgan Lee"
    },
    {
      id: "sample-paid-check",
      area: sampleAreas.dues,
      at: daysFrom(asOf, -1.5),
      subject: "Assessment paid",
      detail: "Lot 31, $350",
      note: "Paid by check, recorded by Morgan Lee"
    },
    {
      id: "sample-landscaping",
      area: sampleAreas.announcements,
      at: daysFrom(asOf, -2),
      subject: "Landscaping in the common areas",
      detail: "Crews are working on weekdays through the end of the month.",
      note: "Posted by Morgan Lee for the board"
    },
    {
      id: "sample-notice",
      area: sampleAreas.violations,
      at: daysFrom(asOf, -4),
      subject: "Courtesy notice sent",
      detail: "Lot 8, trash cans visible from the street",
      note: "Sent by Sam Rivera"
    },
    {
      id: "sample-fine",
      area: sampleAreas.violations,
      at: daysFrom(asOf, -5),
      subject: "Fine issued",
      detail: "Lot 42, $150 for an unapproved shed",
      note: "Issued by Sam Rivera"
    }
  ]
}

/** Something coming up: when, what, and what to know. */
export type SampleUpcoming = { id: string; area: Area; at: string; subject: string; note: string }

/** What's coming up for the community, soonest first. */
export function managementSampleUpcoming(asOf: string): SampleUpcoming[] {
  const upcoming: SampleUpcoming[] = [
    {
      id: "sample-board-meeting",
      area: sampleAreas.meetings,
      at: daysFrom(asOf, 9),
      subject: "Board meeting",
      note: "7 pm in the clubhouse, and online."
    },
    {
      id: "sample-notice-deadline",
      area: sampleAreas.violations,
      at: daysFrom(asOf, 10),
      subject: "Courtesy notice deadline",
      note: "Lot 8 has until then to move its trash cans out of view."
    },
    {
      id: "sample-ballots",
      area: sampleAreas.meetings,
      at: daysFrom(asOf, 13),
      subject: "Board election ballots open",
      note: "2 seats and 4 candidates."
    },
    {
      id: "sample-assessment",
      area: sampleAreas.dues,
      at: nextDueDate(asOf),
      subject: "Quarterly assessment due",
      note: "$350 from each of the 200 homes."
    }
  ]
  return upcoming.toSorted((a, b) => Date.parse(a.at) - Date.parse(b.at))
}

/** The first day of the moment's month: when this quarter's assessment was due. */
function thisQuarterDue(asOf: string) {
  const now = new Date(asOf)
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()
}
