import type { ApplicationStatus, decisionOutcomes } from "@/applications/application"
import type { Recommendation } from "@/review/reviewModel"

// What the dashboards read. These are the shapes the real queries will return; demoData.ts fills them until those
// queries exist.

/** An application as the dashboards list it: the application's own fields, plus who applied and where. */
export type DashboardApplication = {
  id: string
  /** The organization's project type; null for "Something else". */
  projectTypeLabel: string | null
  description: string
  status: ApplicationStatus
  updatedAt: string
  submittedAt: string | null
  /** The latest review's recommendation. */
  recommendation: Recommendation | null
  decision: { outcome: (typeof decisionOutcomes)[number]; decidedAt: string } | null
  /** What the committee asked the homeowner for, while it waits on them. */
  informationRequest: { text: string; requestedAt: string } | null
  applicant: { name: string; address: string }
  /** The committee meeting whose agenda it's on. */
  meetingId: string | null
}

export type CommitteeMeeting = {
  id: string
  title: string
  startsAt: string
  location: string
  /** The last day an application can be submitted to make this meeting's agenda. */
  submissionDeadline: string | null
}

/** Something that happened, phrased as one sentence. */
export type ActivityEvent = { id: string; at: string; summary: string }

/** A homeowner's own applications and the next meeting that could decide them. */
export type HomeownerDashboardData = {
  applications: DashboardApplication[]
  nextMeeting: CommitteeMeeting | null
}

/** The organization's applications, the committee's upcoming meetings and what happened lately. */
export type CommitteeDashboardData = {
  applications: DashboardApplication[]
  meetings: CommitteeMeeting[]
  activity: ActivityEvent[]
}
