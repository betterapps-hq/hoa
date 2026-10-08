import type { FindingStatus, Recommendation, Review } from "@/review/review"
import type { Rule } from "@/rules/rules"

export const recommendationBadge: Record<Recommendation, "default" | "secondary" | "outline" | "destructive"> = {
  approve: "default",
  "approve-with-conditions": "secondary",
  "request-information": "outline",
  reject: "destructive"
}

type Finding = Review["findings"][number] & { rule: Rule | undefined }

/** Groups findings by status and attaches each finding's rule, so the UI can show its title and citation. */
export function groupFindings(findings: Review["findings"], rules: Rule[]) {
  const groups: Record<FindingStatus, Finding[]> = { "not-met": [], unclear: [], met: [] }
  for (const finding of findings) {
    groups[finding.status].push({ ...finding, rule: rules.find((rule) => rule.id === finding.ruleId) })
  }
  return groups
}
