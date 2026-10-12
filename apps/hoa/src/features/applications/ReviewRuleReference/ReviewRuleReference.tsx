import type { ReactNode } from "react"
import type { RuleKey } from "@/schema/types"
import { ProvisionReference } from "../../rulebook/ProvisionReference/ProvisionReference"
import { RuleReference } from "../../rulebook/RuleReference/RuleReference"
import { ruleName, type ReviewContext } from "../reviewContext"

export type ReviewRuleReferenceProps = {
  ruleKey: RuleKey
  context: Pick<ReviewContext, "rules" | "source">
  /** Replaces the title, as RuleReference's own prop does. */
  title?: ReactNode
}

/** A rule the review names, as a RuleReference; a rule the page has no record of shows its key in words. */
export function ReviewRuleReference({ ruleKey, context, title }: ReviewRuleReferenceProps) {
  const rule = context.rules.get(ruleKey)
  return rule ? (
    <RuleReference rule={rule} source={context.source} title={title} />
  ) : (
    <span className="font-medium">{ruleName(context.rules, ruleKey)}</span>
  )
}

/**
 * A rule named in running text: its name as the link to its main citation, which shows the provision's text on hover
 * and opens the document at it. A rule without a citation, or that the page has no record of, is its name alone.
 */
export function InlineRuleReference({ ruleKey, context }: Omit<ReviewRuleReferenceProps, "title">) {
  const rule = context.rules.get(ruleKey)
  const [main] = rule?.citations ?? []
  if (!rule || !main) {
    return <span className="font-medium">{ruleName(context.rules, ruleKey)}</span>
  }
  return (
    <ProvisionReference
      citation={main}
      source={context.source}
      cites={rule.citations.map((citation) => citation.provisionKey)}
    >
      {rule.title}
    </ProvisionReference>
  )
}
