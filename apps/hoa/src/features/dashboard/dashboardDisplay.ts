import { match } from "ts-pattern"
import { reviewCoversLatest, type ApplicationStatus } from "@/applications/application"
import { outcomeLabels, recommendationLabels, statusLabels } from "@/features/applications/applicationDisplay"
import type { DashboardSummary } from "@/features/rulebook/rulebook.functions"
import { counted, listNames } from "@/lib/text"
import type { ActivityEvent } from "./activity"
import type { AreaId } from "./areas"
import type { NextRulebook } from "./dashboard.functions"
import type { DashboardApplication } from "./dashboardData"

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

/** "Since today", "Waiting 19 days": how long something has waited, as a list says it beside the thing. */
export function waitedText(since: string, asOf: string) {
  const days = daysBetween(since, asOf)
  return days === 0 ? "Since today" : `Waiting ${daysText(days)}`
}

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
export const projectLabel = (application: Pick<DashboardApplication, "projectTypeLabel">) =>
  application.projectTypeLabel ?? "Something else"

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
          () => application.rulesChanged,
          () => "The rules changed since your review. Run the review again, then submit it."
        )
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
 * "Of your 3 applications, 1 waits on you, 1 is with the committee and 1 is decided.": where a homeowner's applications
 * stand.
 */
export function yourApplicationsText(applications: readonly DashboardApplication[]) {
  const ofStatus = (status: ApplicationStatus) => applications.filter((application) => application.status === status)
  const standings = [
    { count: waitingOnHomeowner(applications).length, one: "waits on you", many: "wait on you" },
    { count: ofStatus("reviewing").length, one: "is being reviewed", many: "are being reviewed" },
    { count: ofStatus("submitted").length, one: "is with the committee", many: "are with the committee" },
    { count: ofStatus("decided").length, one: "is decided", many: "are decided" }
  ].filter(({ count }) => count > 0)
  const [only] = standings
  if (!only) {
    return "You haven't started an application yet."
  }
  if (applications.length === 1) {
    return `Your application ${only.one}.`
  }
  const parts = standings.map(({ count, one, many }) => `${count} ${count === 1 ? one : many}`)
  return `Of your ${applications.length} applications, ${listNames(parts)}.`
}

/** "42 rules from 2 governing documents, in force since Oct 7.": the rules a homeowner's projects must meet. */
export const homeownerRulebookText = ({ publishedAt, ruleCount, documentTitles }: DashboardSummary) =>
  publishedAt === null
    ? "The HOA hasn't published its rules yet."
    : `${counted(ruleCount, "rule", "rules")} from ${counted(documentTitles.length, "governing document", "governing documents")}, in force since ${dateText(publishedAt)}.`

/** What an application waiting on its homeowner says: where it stands, and what they do next. */
export function homeownerAttentionLine(application: DashboardApplication, asOf: string) {
  const date = standingDateText(application, asOf)
  return {
    subject: projectLabel(application),
    aside: standingText(application),
    detail: application.description,
    note: date ? `${nextStepText(application)} ${date}` : nextStepText(application)
  }
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

// The HOA management dashboard (docs/dashboard.md) lists what waits on the HOA's management and what happened across
// the HOA's areas. Each line says what it's about, a detail that tells it apart, and what's needed or what happened.

/** A line on the HOA management dashboard: what it's about, a detail that tells it apart, and what to know of it. */
export type DashboardLine = { subject: string; detail: string | null; note: string }

/** Something waiting on the committee, in one of the HOA's areas. */
export type AttentionItem = { id: string; area: AreaId; since: string } & (
  | { kind: "decision"; application: DashboardApplication }
  | { kind: "rulebook-draft"; rulesToReview: number; openQuestions: number }
  | { kind: "project-types"; count: number }
)

type AttentionSources = {
  /** The applications the committee sees. */
  applications: readonly DashboardApplication[]
  nextRulebook: NextRulebook | null
  /** How many active project types are out of date with the rulebook in force. */
  projectTypesToUpdate: number
  /** When the rulebook in force was published, which those project types have waited since. */
  publishedAt: string | null
}

/** What waits on the committee across the HOA's areas, longest waiting first. */
export function attentionItems({
  applications,
  nextRulebook,
  projectTypesToUpdate,
  publishedAt
}: AttentionSources): AttentionItem[] {
  const items: AttentionItem[] = awaitingDecision(applications).map((application) => ({
    id: `decision:${application.id}`,
    area: "architectural-review",
    since: waitingSince(application),
    kind: "decision",
    application
  }))
  if (nextRulebook?.status === "draft") {
    const { createdAt, rulesToReview, openQuestions } = nextRulebook
    items.push({
      id: "rulebook-draft",
      area: "rulebook",
      since: createdAt,
      kind: "rulebook-draft",
      rulesToReview,
      openQuestions
    })
  }
  if (projectTypesToUpdate > 0 && publishedAt !== null) {
    items.push({
      id: "project-types",
      area: "architectural-review",
      since: publishedAt,
      kind: "project-types",
      count: projectTypesToUpdate
    })
  }
  return items.toSorted((a, b) => Date.parse(a.since) - Date.parse(b.since))
}

/** What an item waiting on the committee says, its note what's needed. */
export const attentionLine = (item: AttentionItem): DashboardLine =>
  match(item)
    .with({ kind: "decision" }, ({ application }) => ({
      subject: projectLabel(application),
      detail: application.description,
      note: `Ready for your decision. ${recommendationText(application)}.`
    }))
    .with({ kind: "rulebook-draft" }, ({ rulesToReview, openQuestions }) => {
      const work = [
        ...(rulesToReview > 0 ? [counted(rulesToReview, "rule", "rules")] : []),
        ...(openQuestions > 0 ? [counted(openQuestions, "question", "questions")] : [])
      ]
      return {
        subject: "Draft rulebook",
        detail: null,
        note: work.length > 0 ? `${listNames(work)} to review before you publish it.` : "Ready to publish."
      }
    })
    .with({ kind: "project-types" }, ({ count }) => ({
      subject: "Project types",
      detail: null,
      note: `${count === 1 ? "1 is" : `${count} are`} out of date with the rulebook in force.`
    }))
    .exhaustive()

/** What an event says, its note what happened and who did it. */
export function eventLine(event: ActivityEvent): DashboardLine {
  const { subject, detail, happened } = match(event)
    .with({ type: "application-submitted" }, ({ application, again }) => ({
      subject: projectLabel(application),
      detail: application.description,
      happened: again ? "Submitted again" : "Submitted to the committee"
    }))
    .with({ type: "application-decided" }, ({ application, outcome }) => ({
      subject: projectLabel(application),
      detail: application.description,
      happened: outcomeLabels[outcome]
    }))
    .with({ type: "project-type-added" }, ({ projectType }) => ({
      subject: projectType.label,
      detail: null,
      happened: "Added to the project types"
    }))
    .with({ type: "rulebook-published" }, ({ version }) => ({
      subject: `Version ${version}`,
      detail: null,
      happened: "Published"
    }))
    .with({ type: "documents-added" }, ({ documents }) => ({
      ...documentsSubject(documents),
      happened: documents.every(({ version }) => version > 1)
        ? `New ${documents.length === 1 ? "version" : "versions"} added`
        : "Added to the governing documents"
    }))
    .with({ type: "documents-removed" }, ({ documents }) => ({
      ...documentsSubject(documents),
      happened: "Removed from the governing documents"
    }))
    .exhaustive()
  return { subject, detail, note: event.by ? `${happened} by ${event.by}` : happened }
}

/** One document by its title; several by their count, their titles the detail. */
function documentsSubject(documents: readonly { title: string }[]) {
  const [only, ...others] = documents
  return only && others.length === 0
    ? { subject: only.title, detail: null }
    : {
        subject: counted(documents.length, "document", "documents"),
        detail: listNames(documents.map(({ title }) => title))
      }
}

/** "2 applications wait for a decision, and 1 waits on its homeowner.": where architectural review stands. */
export function reviewStandingText(applications: readonly DashboardApplication[]) {
  const deciding = awaitingDecision(applications).length
  const asked = awaitingHomeowner(applications).length
  const onHomeowners = asked === 1 ? "on its homeowner" : "on their homeowners"
  const waiting = (count: number) => counted(count, "application waits", "applications wait")
  if (deciding > 0 && asked > 0) {
    return `${waiting(deciding)} for a decision, and ${asked} ${asked === 1 ? "waits" : "wait"} ${onHomeowners}.`
  }
  if (deciding > 0) {
    return `${waiting(deciding)} for a decision.`
  }
  return asked > 0 ? `${waiting(asked)} ${onHomeowners}.` : "No application is waiting."
}

/** "Version 3, with 42 rules, in force since Oct 7.": where the rulebook stands, and what's coming. */
export function rulebookStandingText(summary: DashboardSummary, nextRulebook: NextRulebook | null) {
  const { publishedVersion, publishedAt, ruleCount } = summary
  const inForce =
    publishedVersion !== null && publishedAt !== null
      ? `Version ${publishedVersion}, with ${counted(ruleCount, "rule", "rules")}, in force since ${dateText(publishedAt)}.`
      : "No rulebook is in force yet."
  const next = match(nextRulebook?.status)
    .with("building", () => "Your documents are being processed into a new draft.")
    .with("draft", () => null)
    .with(undefined, () => (publishedVersion === null ? "Process the governing documents to make one." : null))
    .exhaustive()
  return next ? `${inForce} ${next}` : inForce
}
