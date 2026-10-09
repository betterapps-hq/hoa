import type { Recommendation, Review } from "@/review/reviewModel"
import type { DecisionOutcome } from "../applicationDisplay"
import type { ReviewAudience } from "../reviewContext"

// The recommendation as the top of the application page says it (application-review.md, UX): a few plain words and
// one sentence of why, for the homeowner preparing the application or the committee deciding it.

/** How a verdict leans, for its icon. */
export type VerdictTone = "positive" | "caution" | "committee" | "negative"

export const recommendationTones: Record<Recommendation, VerdictTone> = {
  approve: "positive",
  "approve-with-conditions": "positive",
  "request-information": "caution",
  "refer-to-committee": "committee",
  deny: "negative"
}

export const decisionTones: Record<DecisionOutcome, VerdictTone> = {
  approved: "positive",
  "approved-with-conditions": "positive",
  "approved-in-part": "caution",
  disapproved: "negative",
  "information-requested": "caution"
}

/** The decision the committee would record to follow a recommendation; referral leaves the choice open. */
export const suggestedDecisions: Record<Recommendation, DecisionOutcome | null> = {
  approve: "approved",
  "approve-with-conditions": "approved-with-conditions",
  "request-information": "information-requested",
  "refer-to-committee": null,
  deny: "disapproved"
}

const headlines: Record<ReviewAudience, Record<Recommendation, string>> = {
  homeowner: {
    approve: "Ready for approval",
    "approve-with-conditions": "Approvable with conditions",
    "request-information": "More information needed",
    "refer-to-committee": "Needs the committee's judgment",
    deny: "Likely to be denied as planned"
  },
  committee: {
    approve: "Approve",
    "approve-with-conditions": "Approve with conditions",
    "request-information": "Request more information",
    "refer-to-committee": "Your judgment needed",
    deny: "Deny"
  }
}

export const verdictHeadline = (recommendation: Recommendation, audience: ReviewAudience) =>
  headlines[audience][recommendation]

/** "1 thing" or "3 things". */
export const countOf = (total: number, one: string, many: string) => `${total} ${total === 1 ? one : many}`

type Counts = { changes: number; missing: number; questions: number }

const reasons: Record<ReviewAudience, Record<Recommendation, (counts: Counts) => string>> = {
  homeowner: {
    approve: () => "Your packet meets every rule the review checked.",
    "approve-with-conditions": ({ changes }) =>
      `It meets the rules except for ${countOf(changes, "detail", "details")}, which the committee can make ${changes === 1 ? "a condition" : "conditions"} of approval.`,
    "request-information": ({ missing }) =>
      `Your packet doesn't yet show ${countOf(missing, "thing", "things")} the rules ask for.`,
    "refer-to-committee": ({ questions }) =>
      `The rules leave ${countOf(questions, "question", "questions")} to the committee's judgment.`,
    deny: () => "Part of the project doesn't meet the rules, and a condition of approval can't fix it."
  },
  committee: {
    approve: () => "Every rule the review checked is met.",
    "approve-with-conditions": ({ changes }) =>
      `${countOf(changes, "detail doesn't", "details don't")} meet the rules; you can make ${changes === 1 ? "it a condition" : "them conditions"} of approval.`,
    "request-information": ({ missing }) =>
      `The packet doesn't show ${countOf(missing, "thing", "things")} the rules ask for.`,
    "refer-to-committee": ({ questions }) =>
      `The rules leave ${countOf(questions, "question", "questions")} to your judgment.`,
    deny: () =>
      "Part of the project doesn't meet the rules, and the decision policy denies that rather than setting a condition."
  }
}

type ReasonReview = Pick<Review, "recommendation" | "changes" | "missingInformation" | "committeeDecisions">

/** One sentence of why the review recommends what it does, from the action items it rests on. */
export function verdictReason(review: ReasonReview, audience: ReviewAudience) {
  return reasons[audience][review.recommendation]({
    changes: review.changes.length,
    missing: review.missingInformation.length,
    questions: review.committeeDecisions.length
  })
}
