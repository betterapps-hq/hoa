import { describe, expect, it } from "vitest"
import { outcomeOrder } from "@/features/applications/applicationDisplay"
import { fenceReview } from "@/tests/fenceReview"
import { createReviewContext } from "../reviewContext"
import { resultCounts, ruleResults } from "./RuleResults.utils"

const fence = fenceReview()
const context = createReviewContext({
  review: fence.review,
  rules: fence.rules,
  terms: fence.terms,
  files: fence.files,
  audience: "committee",
  entityEvidence: []
})
const { results, notApplying } = ruleResults(fence.review, context.rules)

describe("ruleResults on the sample fence application's expected result", () => {
  it("has a row for each check that applies, and none for a rule against a part it doesn't apply to", () => {
    const applying = fence.review.findings.filter((finding) => finding.outcome !== "not-applicable")
    expect(results).toHaveLength(applying.length)
    expect(results.some((result) => result.finding.outcome === "not-applicable")).toBe(false)
    expect(results.find((result) => result.id === "guidelines:5.4.2(i)#colors run-1")?.finding.outcome).toBe("not-met")
  })

  it("puts the worst results first", () => {
    const ranks = results.map((result) => outcomeOrder.indexOf(result.finding.outcome))
    expect(ranks).toEqual(ranks.toSorted((a, b) => a - b))
  })

  it("lists apart the rules that apply to nothing in the project", () => {
    const shown = new Set(results.map((result) => result.ruleKey))
    expect(notApplying.length).toBeGreaterThan(0)
    expect(notApplying.some((ruleKey) => shown.has(ruleKey))).toBe(false)
    for (const ruleKey of notApplying) {
      const findings = fence.review.findings.filter((finding) => finding.ruleKey === ruleKey)
      expect(findings.every((finding) => finding.outcome === "not-applicable")).toBe(true)
    }
  })

  it("counts results by outcome, in the order people act on them", () => {
    const counts = resultCounts(results)
    expect(counts.map((count) => count.outcome)).toEqual(
      outcomeOrder.filter((outcome) => counts.some((count) => count.outcome === outcome))
    )
    expect(counts.reduce((total, count) => total + count.count, 0)).toBe(results.length)
  })
})
