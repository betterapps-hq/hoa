import type { ReactNode } from "react"
import type { RuleKey } from "@/schema/types"
import { ProvisionReference } from "../../rulebook/ProvisionReference/ProvisionReference"
import { RuleReference } from "../../rulebook/RuleReference/RuleReference"
import { sentenceCase } from "../applicationDisplay"
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

export type InlineRuleReferenceProps = Omit<ReviewRuleReferenceProps, "title"> & {
  /** Shown on its own, as in a table's row, rather than inside a sentence: its first letter capitalized. */
  isStandalone?: boolean
}

/**
 * A rule by its name alone, linked to its main citation, which shows the provision's text on hover and opens the
 * document at it. A rule the page has no record of is its key in words, unlinked: nothing says where it's written.
 */
export function InlineRuleReference({ ruleKey, context, isStandalone = false }: InlineRuleReferenceProps) {
  const rule = context.rules.get(ruleKey)
  const [main] = rule?.citations ?? []
  const written = ruleName(context.rules, ruleKey)
  const name = isStandalone ? sentenceCase(written) : written
  if (rule && main) {
    return (
      <ProvisionReference
        citation={main}
        source={context.source}
        cites={rule.citations.map((citation) => citation.provisionKey)}
      >
        {name}
      </ProvisionReference>
    )
  }
  return <span className="font-medium">{name}</span>
}
