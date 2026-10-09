import { match } from "ts-pattern"
import type { ApplicationStatus } from "@/applications/application"
import { outcomeLabels, recommendationLabels, statusLabels } from "@/features/applications/applicationDisplay"
import type { CommitteeMeeting, DashboardApplication } from "./dashboardData"

// Labels, groupings and date phrasing for the dashboards. Dates format in UTC so the server's render and the
// browser's agree.

const day = 24 * 60 * 60 * 1000
const hour = 60 * 60 * 1000

const dateFormat = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" })
const weekdayFormat = new Intl.DateTimeFormat("en-US", {
  weekday: "long",
  month: "short",
  day: "numeric",
  timeZone: "UTC"
})
const timeFormat = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: "UTC" })
const relativeFormat = new Intl.RelativeTimeFormat("en-US", { numeric: "auto" })

/** "Oct 7". */
export const dateText = (at: string) => dateFormat.format(new Date(at))

/** "Tuesday, Oct 14". */
export const weekdayText = (at: string) => weekdayFormat.format(new Date(at))

/** "7:00 PM". */
export const timeText = (at: string) => timeFormat.format(new Date(at))

/** Midnight UTC on the moment's day. */
const dayOf = (at: string) => Math.floor(Date.parse(at) / day)

/** Calendar days from one moment to a later one: 1 from any time yesterday. */
export const daysBetween = (from: string, to: string) => Math.max(0, dayOf(to) - dayOf(from))

/** "Today", "1 day", "19 days": how long something has waited. */
export const daysText = (days: number) =>
  match(days)
    .with(0, () => "Today")
    .with(1, () => "1 day")
    .otherwise(() => `${days} days`)

/** "just now", "2 hours ago" earlier today, then "yesterday", "6 days ago". */
export function agoText(at: string, asOf: string) {
  const days = daysBetween(at, asOf)
  if (days > 0) {
    return relativeFormat.format(-days, "day")
  }
  const hours = Math.floor((Date.parse(asOf) - Date.parse(at)) / hour)
  return hours < 1 ? "just now" : relativeFormat.format(-hours, "hour")
}

/** The project type, or "Something else". */
export const projectLabel = (application: DashboardApplication) => application.projectTypeLabel ?? "Something else"

/** Where the application stands: its decision once decided, otherwise its status. */
export const standingText = (application: DashboardApplication) =>
  application.decision ? outcomeLabels[application.decision.outcome] : statusLabels[application.status]

/** The latest review's recommendation, as the committee reads it. */
export const recommendationText = (application: DashboardApplication) =>
  application.recommendation
    ? `Review: ${recommendationLabels[application.recommendation].toLowerCase()}`
    : "Not reviewed"

/** What the homeowner does next, or what happens next for them. */
export function nextStepText(application: DashboardApplication, meeting: CommitteeMeeting | null) {
  return match(application)
    .with({ status: "draft" }, () => "Add your plans and run the review.")
    .with({ status: "reviewing" }, () => "The review is running. It takes a few minutes.")
    .with(
      { status: "reviewed", recommendation: "approve" },
      () => "The review found no problems. Submit it to the committee."
    )
    .with({ status: "reviewed" }, () => "Check what the review found, then submit it to the committee.")
    .with({ status: "submitted" }, () =>
      meeting ? `On the agenda for ${weekdayText(meeting.startsAt)}.` : "With the committee for a decision."
    )
    .with(
      { status: "information-requested" },
      ({ informationRequest }) => informationRequest?.text ?? "The committee needs more information."
    )
    .with({ status: "decided" }, ({ decision }) =>
      match(decision?.outcome)
        .with(
          "approved-with-conditions",
          "approved-in-part",
          () => "Read the decision's conditions before work starts."
        )
        .with("approved", () => "You can start the work.")
        .with("disapproved", () => "Read the committee's reasons. You can apply again with changes.")
        .otherwise(() => "Read the committee's decision.")
    )
    .exhaustive()
}

const homeownerGroups = [
  { title: "Waiting on you", statuses: ["information-requested", "reviewed", "draft"] },
  { title: "In review", statuses: ["reviewing", "submitted"] },
  { title: "Decided", statuses: ["decided"] }
] as const satisfies { title: string; statuses: readonly ApplicationStatus[] }[]

/** A homeowner's applications, what waits on them first; groups with no applications are left out. */
export function groupForHomeowner(applications: readonly DashboardApplication[]) {
  return homeownerGroups.flatMap(({ title, statuses }) => {
    const group = statuses.flatMap((status) => applications.filter((application) => application.status === status))
    return group.length > 0 ? [{ title, applications: group }] : []
  })
}

const byTime =
  (time: (application: DashboardApplication) => string) => (a: DashboardApplication, b: DashboardApplication) =>
    Date.parse(time(a)) - Date.parse(time(b))

/** Submitted applications waiting for the committee's decision, longest-waiting first. */
export const awaitingDecision = (applications: readonly DashboardApplication[]) =>
  applications
    .filter((application) => application.status === "submitted")
    .toSorted(byTime((application) => application.submittedAt ?? application.updatedAt))

/** Applications waiting on the homeowner's answer, longest-waiting first. */
export const awaitingHomeowner = (applications: readonly DashboardApplication[]) =>
  applications
    .filter((application) => application.status === "information-requested")
    .toSorted(byTime((application) => application.informationRequest?.requestedAt ?? application.updatedAt))

/** When the application started waiting where it is now. */
export const waitingSince = (application: DashboardApplication) =>
  application.informationRequest?.requestedAt ?? application.submittedAt ?? application.updatedAt
