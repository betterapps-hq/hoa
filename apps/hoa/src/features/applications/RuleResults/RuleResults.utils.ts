import type { Review } from "@/review/reviewModel"
import type * as T from "@/schema/types"
import { outcomeOrder } from "../applicationDisplay"
import { ruleName } from "../reviewContext"

// How each rule was checked (application-review.md, UX, Rule results): a row for each check that applies, the rule
// against the part of the project it read, worst result first; the rules that apply to nothing in the project are
// listed apart, so the table never fills with "doesn't apply".

/** One check that applies: a rule against one part of the project, and its finding. */
export type RuleResult = { id: string; ruleKey: T.RuleKey; title: string; finding: T.Finding }

const rank = (outcome: T.Outcome) => outcomeOrder.indexOf(outcome)

export function ruleResults(
  review: Pick<Review, "findings">,
  rules: ReadonlyMap<T.RuleKey, { title: string }>
): { results: RuleResult[]; notApplying: T.RuleKey[] } {
  const results = review.findings
    .filter((finding) => finding.outcome !== "not-applicable")
    .map((finding) => ({
      id: `${finding.ruleKey} ${finding.entity}`,
      ruleKey: finding.ruleKey,
      title: ruleName(rules, finding.ruleKey),
      finding
    }))
    .toSorted(
      (a, b) =>
        rank(a.finding.outcome) - rank(b.finding.outcome) ||
        a.title.localeCompare(b.title, "en", { numeric: true }) ||
        a.finding.entity.localeCompare(b.finding.entity)
    )
  const applying = new Set(results.map((result) => result.ruleKey))
  const notApplying = [...new Set(review.findings.map((finding) => finding.ruleKey))]
    .filter((ruleKey) => !applying.has(ruleKey))
    .toSorted((a, b) => ruleName(rules, a).localeCompare(ruleName(rules, b), "en", { numeric: true }))
  return { results, notApplying }
}

/** How many results have each outcome, in the order people act on them. */
export function resultCounts(results: readonly RuleResult[]) {
  return outcomeOrder.flatMap((outcome) => {
    const count = results.filter((result) => result.finding.outcome === outcome).length
    return count > 0 ? [{ outcome, count }] : []
  })
}
