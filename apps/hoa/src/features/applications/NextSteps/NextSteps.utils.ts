import type { ActionItem, Review } from "@/review/reviewModel"
import type { ActionListKey, ReviewAudience } from "../reviewContext"

// The next steps under the recommendation (application-review.md, UX): the review's action items, grouped by what
// they ask, in the order that changes the outcome, and worded for whoever reads them.

export type StepKey = ActionListKey

export type StepGroup = { key: StepKey; title: string; items: readonly ActionItem[] }

const titles: Record<ReviewAudience, Record<StepKey, string>> = {
  homeowner: {
    missingInformation: "Add to your packet",
    changes: "Change in your plans",
    committeeDecisions: "Left to the committee",
    suggestions: "Suggestions"
  },
  committee: {
    missingInformation: "Missing from the packet",
    changes: "Doesn't meet the rules",
    committeeDecisions: "For your judgment",
    suggestions: "Suggestions"
  }
}

/** Changes the committee can set as conditions, when that's what the review recommends. */
const conditionTitles: Record<ReviewAudience, string> = {
  homeowner: "Change, or expect as conditions",
  committee: "Possible conditions of approval"
}

/** A group's heading, for this reader and this recommendation. */
export function stepTitle(key: StepKey, review: Pick<Review, "recommendation">, audience: ReviewAudience) {
  return key === "changes" && review.recommendation === "approve-with-conditions"
    ? conditionTitles[audience]
    : titles[audience][key]
}

/**
 * What to provide, then what to change, then what the committee decides itself; suggestions last, since they don't
 * affect the decision. A denial rests on changes no information fixes, so they come first.
 */
const stepOrder = (review: Pick<Review, "recommendation">): StepKey[] =>
  review.recommendation === "deny"
    ? ["changes", "missingInformation", "committeeDecisions", "suggestions"]
    : ["missingInformation", "changes", "committeeDecisions", "suggestions"]

/** The groups that have items, in the order to act on them. */
export function stepGroups(review: Review, audience: ReviewAudience): StepGroup[] {
  return stepOrder(review).flatMap((key) =>
    review[key].length > 0 ? [{ key, title: stepTitle(key, review, audience), items: review[key] }] : []
  )
}

/** How many items a group shows before "Show more"; suggestions start hidden. */
export const visibleCount = (key: StepKey) => (key === "suggestions" ? 0 : 5)

/** The items a group shows: all of them once expanded, or when only one would be left over. */
export function shownItems(group: StepGroup, isExpanded: boolean) {
  const limit = visibleCount(group.key)
  return isExpanded || group.items.length <= limit + (limit === 0 ? 0 : 1) ? group.items : group.items.slice(0, limit)
}

/** The next steps' heading: what to do for whoever acts on the review now, otherwise what it found. */
export function stepsHeading(audience: ReviewAudience, isActing: boolean) {
  if (!isActing) {
    return "What the review found"
  }
  return audience === "homeowner" ? "What to do next" : "Before you decide"
}
