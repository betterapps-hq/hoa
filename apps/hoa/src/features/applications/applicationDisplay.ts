import type { ApplicationFile, ApplicationStatus, decisionOutcomes } from "@/applications/application"
import type { Finding, FindingStatus, Recommendation, Review } from "@/review/reviewModel"

// Labels and groupings for the application pages.

export const statusLabels: Record<ApplicationStatus, string> = {
  draft: "Draft",
  reviewing: "Reviewing",
  reviewed: "Reviewed",
  submitted: "With the committee",
  "information-requested": "Information requested",
  decided: "Decided"
}

export const recommendationLabels: Record<Recommendation, string> = {
  approve: "Approve",
  "approve-with-conditions": "Approve with conditions",
  "request-information": "More information needed",
  reject: "Changes required"
}

export type DecisionOutcome = (typeof decisionOutcomes)[number]

export const outcomeLabels: Record<DecisionOutcome, string> = {
  approved: "Approved",
  "approved-with-conditions": "Approved with conditions",
  "approved-in-part": "Approved in part",
  disapproved: "Disapproved",
  "information-requested": "Information requested"
}

export const findingLabels: Record<FindingStatus, string> = {
  "not-met": "Not met",
  unclear: "Needs information",
  "needs-committee": "For the committee",
  met: "Met",
  "not-applicable": "Doesn't apply"
}

export const fileStatusLabels: Record<ApplicationFile["status"], string> = {
  uploading: "Uploading",
  processing: "Read at the next review",
  ready: "Read",
  unreadable: "Couldn't be read"
}

/** Findings grouped in the order people act on them; the groups that have findings. */
export function groupFindings(findings: readonly Finding[]) {
  const order: FindingStatus[] = ["not-met", "unclear", "needs-committee", "met", "not-applicable"]
  const byStatus = Map.groupBy(findings, (finding) => finding.status)
  return order.flatMap((status) => {
    const group = byStatus.get(status)
    return group ? [{ status, findings: group }] : []
  })
}

/** Files the homeowner uploaded, each with the pictures taken from it. */
export function packetFiles(files: readonly ApplicationFile[]) {
  return files
    .filter((file) => file.parentFileId === null)
    .map((file) => ({ file, pictures: files.filter((child) => child.parentFileId === file.id) }))
}

/** The component a finding is about, as the review named it. */
export function componentLabel(review: Pick<Review, "components">, componentId: string | null) {
  if (componentId === null) {
    return "Whole project"
  }
  return review.components.find((component) => component.id === componentId)?.label ?? componentId
}
