import type { HoaSettings } from "@/hoa/hoa"
import type { ActionItem, Finding, Recommendation } from "@/review/reviewModel"
import type { Rule } from "@/rules/rule"

export type Decision = {
  recommendation: Recommendation
  /** One per unmet rule; the conditions when the recommendation is approve with conditions. */
  changes: ActionItem[]
  /** One per rule with unclear findings: what the homeowner must provide. */
  missingInformation: ActionItem[]
  /** One per rule the committee must judge. Never changes the recommendation. */
  committeeDecisions: ActionItem[]
}

function itemsFor(kind: string, findings: readonly Finding[], rules: ReadonlyMap<string, Rule>): ActionItem[] {
  const byRule = Map.groupBy(findings, (finding) => finding.ruleId)
  return [...byRule].map(([ruleId, group]) => {
    const rule = rules.get(ruleId)
    const details = [...new Set(group.map((finding) => finding.explanation))].join(" ")
    return {
      id: `${kind}:${ruleId}`,
      findingIds: group.map((finding) => finding.id),
      text: rule ? `${rule.title}: ${details}` : details
    }
  })
}

/**
 * The decision policy (docs/design/review.md, "8. Decide"): code, not a model, so the same findings always give the
 * same recommendation. The writer only phrases the action items.
 */
export function decide(findings: readonly Finding[], rules: readonly Rule[], settings: HoaSettings): Decision {
  const rulesById = new Map(rules.map((rule) => [rule.id, rule]))
  const unclear = findings.filter((finding) => finding.status === "unclear")
  const unmet = findings.filter((finding) => finding.status === "not-met")
  const committee = findings.filter((finding) => finding.status === "needs-committee")

  const changes = itemsFor("change", unmet, rulesById)
  const missingInformation = itemsFor("provide", unclear, rulesById)
  const committeeDecisions = itemsFor("committee", committee, rulesById)

  let recommendation: Recommendation
  if (unclear.length > 0) {
    recommendation = "request-information"
  } else if (unmet.length > 0) {
    const isEveryUnmetRuleCurable = unmet.every((finding) => rulesById.get(finding.ruleId)?.isCurable === true)
    recommendation =
      isEveryUnmetRuleCurable && settings.curableOutcome === "approve-with-conditions"
        ? "approve-with-conditions"
        : "reject"
  } else {
    recommendation = "approve"
  }
  return { recommendation, changes, missingInformation, committeeDecisions }
}
