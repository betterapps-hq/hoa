import { match } from "ts-pattern"
import { reviewCoversLatest, type ApplicationStatus } from "@/applications/application"
import { outcomeLabels, recommendationLabels, statusLabels } from "@/features/applications/applicationDisplay"
import { listNames } from "@/lib/text"
import type { ActivityEvent, DashboardApplication } from "./dashboardData"

// Labels, groupings and date phrasing for the dashboards. Dates format in UTC so the server's render and the
// browser's agree.

const day = 24 * 60 * 60 * 1000
const hour = 60 * 60 * 1000

const dateFormat = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" })
const relativeFormat = new Intl.RelativeTimeFormat("en-US", { numeric: "auto" })

/** "Oct 7". */
export const dateText = (at: string) => dateFormat.format(new Date(at))

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
  application.decision && application.status === "decided"
    ? outcomeLabels[application.decision.outcome]
    : statusLabels[application.status]

/** The latest review's recommendation. */
const latestRecommendation = (application: DashboardApplication) => application.reviews[0]?.recommendation ?? null

/** "Review: approve with conditions", as the committee reads it. */
const reviewText = (recommendation: DashboardApplication["reviews"][number]["recommendation"]) =>
  `Review: ${recommendationLabels[recommendation].toLowerCase()}`

/** The latest review's recommendation, as the committee reads it. */
export const recommendationText = (application: DashboardApplication) => {
  const recommendation = latestRecommendation(application)
  return recommendation ? reviewText(recommendation) : "Not reviewed"
}

/** Whether the homeowner changed the application after its latest review. */
const isChangedSinceReview = (application: DashboardApplication) => {
  const [latest] = application.reviews
  return latest !== undefined && !reviewCoversLatest(application, latest)
}

/** "Add the 2 things the review asks for": what the latest review's missing information asks of the homeowner. */
const addMissing = (count: number) => `Add the ${count === 1 ? "one thing" : `${count} things`} the review asks for`

/** What the homeowner does next, or what happens next for them. */
export function nextStepText(application: DashboardApplication) {
  const missing = application.missingInformation.length
  return match(application.status)
    .with("draft", () => "Finish your draft and run the review.")
    .with("reviewing", () => "The review is running. It takes a few minutes.")
    .with("reviewed", () =>
      match({ missing, recommendation: latestRecommendation(application) })
        .when(
          () => isChangedSinceReview(application),
          () => "You changed it after the review. Run the review again, then submit it."
        )
        .when(
          ({ missing: count }) => count > 0,
          () => `${addMissing(missing)}, then submit it to the committee.`
        )
        .with({ recommendation: "approve" }, () => "The review found no problems. Submit it to the committee.")
        .otherwise(() => "Check what the review found, then submit it to the committee.")
    )
    .with("submitted", () => "With the committee for a decision.")
    .with(
      "information-requested",
      () =>
        application.decision?.note ??
        (missing > 0 ? `${addMissing(missing)}, then submit it again.` : "The committee needs more information.")
    )
    .with("decided", () =>
      match(application.decision?.outcome)
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

/** "Submitted Oct 7.", "Asked 2 days ago.": the date that goes with where the application stands. */
export function standingDateText(application: DashboardApplication, asOf: string) {
  const reviewed = application.reviews[0]?.createdAt
  return match(application.status)
    .with("reviewed", () => (reviewed ? `Reviewed ${dateText(reviewed)}.` : null))
    .with("submitted", () => (application.submittedAt ? `Submitted ${dateText(application.submittedAt)}.` : null))
    .with("information-requested", () =>
      application.decision ? `Asked ${agoText(application.decision.decidedAt, asOf)}.` : null
    )
    .with("decided", () => (application.decision ? `Decided ${dateText(application.decision.decidedAt)}.` : null))
    .with("draft", "reviewing", () => `Started ${dateText(application.createdAt)}.`)
    .exhaustive()
}

/** Where the next step is the homeowner's: what the committee asked for, then a reviewed draft, then a new one. */
const waitingStatuses = ["information-requested", "reviewed", "draft"] as const satisfies readonly ApplicationStatus[]

/** A homeowner's applications whose next step is theirs, what the committee asked for first. */
export const waitingOnHomeowner = (applications: readonly DashboardApplication[]) =>
  waitingStatuses.flatMap((status) => applications.filter((application) => application.status === status))

/**
 * "Of your other applications, 1 is with the committee and 2 are decided.": where the homeowner's applications that
 * don't wait on them stand; null when there are none.
 */
export function elsewhereText(applications: readonly DashboardApplication[]) {
  const phrase = (status: ApplicationStatus, where: string) => {
    const count = applications.filter((application) => application.status === status).length
    return count === 0 ? [] : [`${count} ${count === 1 ? "is" : "are"} ${where}`]
  }
  const parts = [
    ...phrase("reviewing", "being reviewed"),
    ...phrase("submitted", "with the committee"),
    ...phrase("decided", "decided")
  ]
  if (parts.length === 0) {
    return null
  }
  return `Of your ${waitingOnHomeowner(applications).length > 0 ? "other " : ""}applications, ${listNames(parts)}.`
}

/** When the application started waiting where it is now. */
export const waitingSince = (application: DashboardApplication) =>
  match(application.status)
    .with("information-requested", () => application.decision?.decidedAt ?? application.updatedAt)
    .with("submitted", () => application.submittedAt ?? application.updatedAt)
    .otherwise(() => application.updatedAt)

const longestWaitingFirst = (a: DashboardApplication, b: DashboardApplication) =>
  Date.parse(waitingSince(a)) - Date.parse(waitingSince(b))

/** Submitted applications waiting for the committee's decision, longest-waiting first. */
export const awaitingDecision = (applications: readonly DashboardApplication[]) =>
  applications.filter((application) => application.status === "submitted").toSorted(longestWaitingFirst)

/** Applications waiting on the homeowner's answer, longest-waiting first. */
export const awaitingHomeowner = (applications: readonly DashboardApplication[]) =>
  applications.filter((application) => application.status === "information-requested").toSorted(longestWaitingFirst)

/** The latest things that happened to the applications: started, reviewed, submitted, decided; newest first. */
export function recentActivity(applications: readonly DashboardApplication[], limit = 6): ActivityEvent[] {
  return applications
    .flatMap((application): ActivityEvent[] => [
      { id: `${application.id}:created`, application, at: application.createdAt, summary: "Started" },
      ...application.reviews.map((review) => ({
        id: `${application.id}:review:${review.createdAt}`,
        application,
        at: review.createdAt,
        summary: reviewText(review.recommendation)
      })),
      ...(application.submittedAt
        ? [
            {
              id: `${application.id}:submitted`,
              application,
              at: application.submittedAt,
              summary: "Submitted to the committee"
            }
          ]
        : []),
      ...(application.decision
        ? [
            {
              id: `${application.id}:decided`,
              application,
              at: application.decision.decidedAt,
              summary: `Committee: ${outcomeLabels[application.decision.outcome].toLowerCase()}`
            }
          ]
        : [])
    ])
    .toSorted((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .slice(0, limit)
}
