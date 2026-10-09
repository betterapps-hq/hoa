import type { ApplicationFile, ApplicationStatus, decisionOutcomes } from "@/applications/application"
import type { Recommendation, Review } from "@/review/reviewModel"
import type { Finding, Outcome } from "@/schema/types"

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
  "refer-to-committee": "Refer to the committee",
  deny: "Deny"
}

export type DecisionOutcome = (typeof decisionOutcomes)[number]

export const outcomeLabels: Record<DecisionOutcome, string> = {
  approved: "Approved",
  "approved-with-conditions": "Approved with conditions",
  "approved-in-part": "Approved in part",
  disapproved: "Disapproved",
  "information-requested": "Information requested"
}

export const findingLabels: Record<Outcome, string> = {
  "not-met": "Not met",
  "missing-information": "Missing information",
  committee: "For the committee",
  advisory: "Suggestions",
  pending: "Pending",
  met: "Met",
  exempt: "Exempt",
  "not-applicable": "Doesn't apply",
  available: "Available",
  blocked: "Blocked"
}

export const fileStatusLabels: Record<ApplicationFile["status"], string> = {
  uploading: "Uploading",
  processing: "Read at the next review",
  ready: "Read",
  unreadable: "Couldn't be read"
}

const findingOrder: Outcome[] = [
  "not-met",
  "missing-information",
  "committee",
  "advisory",
  "pending",
  "met",
  "exempt",
  "not-applicable",
  "available",
  "blocked"
]

/** Findings grouped in the order people act on them; the groups that have findings. */
export function groupFindings(findings: readonly Finding[]) {
  const byOutcome = Map.groupBy(findings, (finding) => finding.outcome)
  return findingOrder.flatMap((outcome) => {
    const group = byOutcome.get(outcome)
    return group ? [{ outcome, findings: group }] : []
  })
}

/** Files the homeowner uploaded, each with the pictures taken from it. */
export function packetFiles(files: readonly ApplicationFile[]) {
  return files
    .filter((file) => file.parentFileId === null)
    .map((file) => ({ file, pictures: files.filter((child) => child.parentFileId === file.id) }))
}

/** An entity the review identified, by its label. */
export function entityLabel(review: Pick<Review, "request">, entityId: string) {
  return review.request.entities.find((entity) => entity.id === entityId)?.label ?? entityId
}
