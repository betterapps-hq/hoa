import type { ReactNode } from "react"
import type { RuleKey } from "@/schema/types"
import { RuleReference } from "../../rulebook/RuleReference/RuleReference"
import type { ReviewContext } from "../reviewContext"

export type ReviewRuleReferenceProps = {
  ruleKey: RuleKey
  context: Pick<ReviewContext, "rules" | "source">
  /** Replaces the title, as RuleReference's own prop does. */
  title?: ReactNode
}

/** A rule the review names, as a RuleReference; a rule the review's rules file couldn't give shows its key. */
export function ReviewRuleReference({ ruleKey, context, title }: ReviewRuleReferenceProps) {
  const rule = context.rules.get(ruleKey)
  return rule ? (
    <RuleReference rule={rule} source={context.source} title={title} />
  ) : (
    <span className="font-medium break-all">{ruleKey}</span>
  )
}
