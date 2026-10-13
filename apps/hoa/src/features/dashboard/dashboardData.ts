import type { Application } from "@/applications/application"
import type { Recommendation } from "@/review/reviewModel"

/** An application as the dashboards list it: the record's own fields, its reviews and what the latest one asks for. */
export type DashboardApplication = Pick<
  Application,
  "id" | "description" | "status" | "createdAt" | "updatedAt" | "revisedAt" | "submittedAt"
> & {
  /** The organization's project type; null for "Something else". */
  projectTypeLabel: string | null
  /** The committee's decision; "information requested" carries what it asked for in its note. */
  decision: Pick<NonNullable<Application["decision"]>, "outcome" | "note" | "decidedAt"> | null
  /** Every review, newest first. */
  reviews: { recommendation: Recommendation; createdAt: string }[]
  /** What the latest review asks the homeowner to add to the packet, as its action items say it. */
  missingInformation: string[]
}

/** Something that happened to an application, for the committee's recent activity. */
export type ActivityEvent = {
  /** Unique among the events. */
  id: string
  application: DashboardApplication
  at: string
  /** What happened, as a short phrase: "Submitted to the committee". */
  summary: string
}
