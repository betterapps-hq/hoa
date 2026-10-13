import type { RulebookRecords } from "@/rulebook/assemble"
import { proposedTermsOf, type ApprovalContext, type RecordRef } from "@/rulebook/review"

/**
 * What Approve says for a record still to review: "Approve", or for a rule approved with the terms it reads that are
 * still to review, "Approve, with its 2 terms" (encoding.md, UX, Rule card). With a name, for an accessible name:
 * "Approve Fence height, with its 2 terms".
 */
export function approveLabel(
  approval: ApprovalContext | null,
  records: RulebookRecords,
  record: RecordRef,
  name?: string
) {
  const rule = record.type === "rule" ? records.rules.find((item) => item.key === record.key) : undefined
  const terms = rule && approval ? proposedTermsOf(approval, rule).length : 0
  const approve = name ? `Approve ${name}` : "Approve"
  if (terms === 0) {
    return approve
  }
  return `${approve}, with ${terms === 1 ? "its term" : `its ${terms} terms`}`
}
