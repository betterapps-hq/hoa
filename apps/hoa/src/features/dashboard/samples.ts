import { CalendarDaysIcon, MegaphoneIcon, WrenchIcon } from "lucide-react"
import type { Area } from "./areas"
import { dateText } from "./dashboardDisplay"

// Sample data for the parts of an HOA portal the app doesn't have yet (docs/dashboard.md, Samples), so both dashboards
// show the whole portal: maintenance requests, meetings and votes, and the board's announcements. The homeowner sees
// their own home's; the HOA's management sees the whole community's. Each is replaced by its area's own records when
// that area is built. Nothing here stands in for what the app has: applications, the rulebook, violations, dues and
// payments are always the real ones. Dates count from the moment the dashboard is read, so the samples stay current,
// and every sample is shown marked as one.

const day = 24 * 60 * 60 * 1000

export const sampleAreas = {
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

/** Something coming up: when, what, and what to know. */
export type SampleUpcoming = { id: string; area: Area; at: string; subject: string; note: string }

/** The moment some days from another; negative for before it. */
const daysFrom = (at: string, days: number) => new Date(Date.parse(at) + days * day).toISOString()

/** Where a homeowner stands in the areas the app doesn't have yet. */
export function homeownerSampleStandings(asOf: string): SampleStanding[] {
  return [
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

/** What's coming up for a homeowner in the areas the app doesn't have yet. */
export function homeownerSampleUpcoming(asOf: string): SampleUpcoming[] {
  return [
    {
      id: "sample-board-meeting",
      area: sampleAreas.meetings,
      at: daysFrom(asOf, 9),
      subject: "Board meeting",
      note: "7 pm in the clubhouse, and online."
    }
  ]
}

// The HOA's management: the whole community, as the board or its manager runs it.

/** What waits on the HOA's management in the areas the app doesn't have yet. */
export function managementSampleAttention(asOf: string): SampleAttention[] {
  return [
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
      id: "sample-request-closed",
      area: sampleAreas.maintenance,
      at: daysFrom(asOf, -1),
      subject: "Request closed",
      detail: "The pool gate's latch is repaired.",
      note: "Closed by Morgan Lee"
    },
    {
      id: "sample-landscaping",
      area: sampleAreas.announcements,
      at: daysFrom(asOf, -2),
      subject: "Landscaping in the common areas",
      detail: "Crews are working on weekdays through the end of the month.",
      note: "Posted by Morgan Lee for the board"
    }
  ]
}

/** What's coming up for the community in the areas the app doesn't have yet, soonest first. */
export function managementSampleUpcoming(asOf: string): SampleUpcoming[] {
  return [
    {
      id: "sample-board-meeting",
      area: sampleAreas.meetings,
      at: daysFrom(asOf, 9),
      subject: "Board meeting",
      note: "7 pm in the clubhouse, and online."
    },
    {
      id: "sample-ballots",
      area: sampleAreas.meetings,
      at: daysFrom(asOf, 13),
      subject: "Board election ballots open",
      note: "2 seats and 4 candidates."
    }
  ]
}
