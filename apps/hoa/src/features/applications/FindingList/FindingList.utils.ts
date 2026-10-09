import type { Finding } from "@/schema/types"
import { groupFindings } from "../applicationDisplay"

/** Findings by outcome, then by rule and reason, so a rule found the same way on four runs is one item. */
export function findingGroups(findings: readonly Finding[]) {
  return groupFindings(findings).map(({ outcome, findings: grouped }) => ({
    outcome,
    count: grouped.length,
    items: [...Map.groupBy(grouped, (finding) => `${finding.ruleKey} ${finding.reason}`).values()].flatMap(
      ([first, ...rest]) =>
        first
          ? [{ ruleKey: first.ruleKey, reason: first.reason, entities: [first, ...rest].map((item) => item.entity) }]
          : []
    )
  }))
}
