import { describe, expect, it } from "vitest"
import { recommendations, type ActionItem, type Recommendation } from "@/review/reviewModel"
import { verdictHeadline, verdictReason } from "./ReviewVerdict.utils"

const items = (count: number): ActionItem[] =>
  Array.from({ length: count }, (_, index) => ({ id: `item-${index}`, ruleKey: "r", entities: [], text: "t" }))

const review = (recommendation: Recommendation, counts = { changes: 2, missing: 1, questions: 3 }) => ({
  recommendation,
  changes: items(counts.changes),
  missingInformation: items(counts.missing),
  committeeDecisions: items(counts.questions)
})

describe("verdictHeadline and verdictReason", () => {
  it("word every recommendation for both readers, counting what it rests on", () => {
    const said = recommendations.map((recommendation) => ({
      recommendation,
      homeowner: [verdictHeadline(recommendation, "homeowner"), verdictReason(review(recommendation), "homeowner")],
      committee: [verdictHeadline(recommendation, "committee"), verdictReason(review(recommendation), "committee")]
    }))
    expect(said).toEqual([
      {
        recommendation: "approve",
        homeowner: ["Ready for approval", "Your packet meets every rule the review checked."],
        committee: ["Approve", "Every rule the review checked is met."]
      },
      {
        recommendation: "approve-with-conditions",
        homeowner: [
          "Approvable with conditions",
          "It meets the rules except for 2 details, which the committee can make conditions of approval."
        ],
        committee: [
          "Approve with conditions",
          "2 details don't meet the rules; you can make them conditions of approval."
        ]
      },
      {
        recommendation: "request-information",
        homeowner: ["More information needed", "Your packet doesn't yet show 1 thing the rules ask for."],
        committee: ["Request more information", "The packet doesn't show 1 thing the rules ask for."]
      },
      {
        recommendation: "refer-to-committee",
        homeowner: ["Needs the committee's judgment", "The rules leave 3 questions to the committee's judgment."],
        committee: ["Your judgment needed", "The rules leave 3 questions to your judgment."]
      },
      {
        recommendation: "deny",
        homeowner: [
          "Likely to be denied as planned",
          "Part of the project doesn't meet the rules, and a condition of approval can't fix it."
        ],
        committee: [
          "Deny",
          "Part of the project doesn't meet the rules, and the decision policy denies that rather than setting a condition."
        ]
      }
    ])
  })

  it("says one item in the singular", () => {
    expect(
      verdictReason(review("approve-with-conditions", { changes: 1, missing: 0, questions: 0 }), "committee")
    ).toBe("1 detail doesn't meet the rules; you can make it a condition of approval.")
  })
})
