import type * as T from "@/schema/types"
import { referencedRule } from "../rulebookRecords"
import { RuleReference } from "../RuleReference/RuleReference"
import { useRulebookWorkspace } from "../useRulebookWorkspace"

export type RuleLinkProps = { ruleKey: T.RuleKey }

/** A rule named in the rules UX: its title opens its card, and its citation links to the provision. */
export function RuleLink({ ruleKey }: RuleLinkProps) {
  const { records, citations, source, openRule } = useRulebookWorkspace()
  const rule = records.rules.find((item) => item.key === ruleKey)
  if (!rule) {
    return <span className="font-mono text-xs text-muted-foreground">{ruleKey} (not in this rulebook)</span>
  }
  return (
    <RuleReference
      rule={referencedRule(citations, rule)}
      source={source}
      title={
        <button
          type="button"
          className="min-w-0 rounded-sm text-left font-medium text-foreground underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          onClick={() => openRule(rule.key)}
        >
          {rule.title}
        </button>
      }
    />
  )
}
