import { roles } from "@/features/role/roles"
import type {
  ActivityEvent,
  CommitteeDashboardData,
  CommitteeMeeting,
  DashboardApplication,
  HomeownerDashboardData
} from "./dashboardData"

// DEMO DATA. Everything in this file is invented for demos, to be replaced by real queries: applications with their
// homeowners and addresses, committee meetings and recent activity don't exist as records yet. The names and addresses
// are made up. Dates are relative to `asOf`, so the demo always looks current.

const day = 24 * 60 * 60 * 1000
const hour = 60 * 60 * 1000

const homeowner = { name: roles.homeowner.user.name, address: "64 Juniper Bend" }
const administrator = roles.administrator.user.name

type Draft = Omit<DashboardApplication, "updatedAt" | "submittedAt" | "decision" | "informationRequest"> & {
  /** Days before `asOf`. */
  submitted: number | null
  updated: number
  decided?: { outcome: NonNullable<DashboardApplication["decision"]>["outcome"]; daysAgo: number }
  requested?: { text: string; daysAgo: number }
}

const drafts: Draft[] = [
  {
    id: "demo-deck",
    projectTypeLabel: "Deck",
    description: "Extend the rear deck to 14 by 20 feet with composite boards and a matching railing.",
    status: "information-requested",
    submitted: 16,
    updated: 2,
    recommendation: "approve-with-conditions",
    requested: { text: "Send a photo or sample of the railing color.", daysAgo: 2 },
    applicant: homeowner,
    meetingId: null
  },
  {
    id: "demo-garage-door",
    projectTypeLabel: "Garage door",
    description: "Replace the garage door with a carriage-style door in the existing trim color.",
    status: "reviewed",
    submitted: null,
    updated: 1,
    recommendation: "request-information",
    applicant: homeowner,
    meetingId: null
  },
  {
    id: "demo-solar",
    projectTypeLabel: "Solar panels",
    description: "Sixteen roof-mounted panels on the rear slope, black frames, no visible conduit.",
    status: "submitted",
    submitted: 9,
    updated: 9,
    recommendation: "approve-with-conditions",
    applicant: homeowner,
    meetingId: "demo-meeting-next"
  },
  {
    id: "demo-landscaping",
    projectTypeLabel: "Landscaping",
    description: "Replace the front lawn with native plantings and a gravel path.",
    status: "decided",
    submitted: 38,
    updated: 21,
    recommendation: "approve-with-conditions",
    decided: { outcome: "approved-with-conditions", daysAgo: 21 },
    applicant: homeowner,
    meetingId: null
  },
  {
    id: "demo-porch",
    projectTypeLabel: "Porch or patio",
    description: "Screened porch over the existing rear patio, roof to match the house.",
    status: "submitted",
    submitted: 19,
    updated: 19,
    recommendation: "refer-to-committee",
    applicant: { name: "Elena Ortiz", address: "27 Heron Court" },
    meetingId: "demo-meeting-next"
  },
  {
    id: "demo-fence",
    projectTypeLabel: "Fence",
    description: "Replace the rear wood fence with a 6-foot black aluminum fence.",
    status: "submitted",
    submitted: 12,
    updated: 12,
    recommendation: "approve",
    applicant: { name: "Marcus Bell", address: "1150 Quarry Ridge Road" },
    meetingId: "demo-meeting-next"
  },
  {
    id: "demo-windows",
    projectTypeLabel: "Windows",
    description: "Replace the front windows with black-framed casements.",
    status: "submitted",
    submitted: 3,
    updated: 3,
    recommendation: "request-information",
    applicant: { name: "Nora Kim", address: "9 Wren Way" },
    meetingId: null
  },
  {
    id: "demo-tree",
    projectTypeLabel: "Tree removal",
    description: "Remove two dead oaks from the front yard and grind the stumps.",
    status: "submitted",
    submitted: 1,
    updated: 1,
    recommendation: "approve",
    applicant: { name: "Theo Lang", address: "302 Aspen Hollow" },
    meetingId: null
  },
  {
    id: "demo-paint",
    projectTypeLabel: "Exterior paint",
    description: "Repaint the body a deep green with white trim.",
    status: "information-requested",
    submitted: 14,
    updated: 8,
    recommendation: "request-information",
    requested: { text: "Send the manufacturer's color names and paint chips.", daysAgo: 8 },
    applicant: { name: "Dana Whitfield", address: "418 Larkspur Lane" },
    meetingId: null
  },
  {
    id: "demo-shed",
    projectTypeLabel: "Shed",
    description: "An 8 by 10 foot storage shed behind the garage, siding to match the house.",
    status: "decided",
    submitted: 17,
    updated: 6,
    recommendation: "approve",
    decided: { outcome: "approved", daysAgo: 6 },
    applicant: { name: "Samir Haddad", address: "75 Birch Terrace" },
    meetingId: null
  },
  {
    id: "demo-pool",
    projectTypeLabel: "Pool",
    description: "An above-ground pool in the side yard.",
    status: "decided",
    submitted: 30,
    updated: 10,
    recommendation: "deny",
    decided: { outcome: "disapproved", daysAgo: 10 },
    applicant: { name: "Lucia Moreno", address: "12 Fernhill Drive" },
    meetingId: null
  }
]

/** The demo's dashboards as of a moment: the homeowner's (the demo role's user) and the committee's. */
export function loadDemoDashboards(asOf: Date): {
  homeowner: HomeownerDashboardData
  committee: CommitteeDashboardData
} {
  // Days count from midnight UTC, so the demo's dates don't shift through the day.
  const midnight = Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), asOf.getUTCDate())
  const daysAgo = (days: number, atHour = 15) => new Date(midnight - days * day + atHour * hour).toISOString()

  const applications = drafts.map(({ submitted, updated, decided, requested, ...application }) => ({
    ...application,
    submittedAt: submitted === null ? null : daysAgo(submitted),
    updatedAt: daysAgo(updated),
    decision: decided ? { outcome: decided.outcome, decidedAt: daysAgo(decided.daysAgo, 20) } : null,
    informationRequest: requested ? { text: requested.text, requestedAt: daysAgo(requested.daysAgo) } : null
  }))
  const meetings: CommitteeMeeting[] = [
    {
      id: "demo-meeting-next",
      title: "Architectural committee",
      startsAt: daysAgo(-5, 19),
      location: "Clubhouse",
      submissionDeadline: daysAgo(-1, 23)
    },
    {
      id: "demo-meeting-following",
      title: "Architectural committee",
      startsAt: daysAgo(-33, 19),
      location: "Clubhouse and video call",
      submissionDeadline: daysAgo(-26, 23)
    }
  ]
  const activity: ActivityEvent[] = [
    {
      id: "demo-1",
      at: new Date(asOf.getTime() - 2 * hour).toISOString(),
      summary: "Theo Lang applied to remove two trees at 302 Aspen Hollow."
    },
    {
      id: "demo-2",
      at: daysAgo(2, 10),
      summary: `${administrator} asked ${homeowner.name} for the deck's railing color.`
    },
    { id: "demo-3", at: daysAgo(3), summary: "Nora Kim applied to replace windows at 9 Wren Way." },
    { id: "demo-4", at: daysAgo(6, 20), summary: "The committee approved Samir Haddad's shed at 75 Birch Terrace." },
    { id: "demo-5", at: daysAgo(8), summary: `${administrator} asked Dana Whitfield for paint chips.` }
  ]
  return {
    homeowner: {
      applications: applications.filter((application) => application.applicant.name === homeowner.name),
      nextMeeting: meetings[0] ?? null
    },
    committee: { applications, meetings, activity }
  }
}
