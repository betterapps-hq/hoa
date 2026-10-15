import { match } from "ts-pattern"
import type * as T from "@/schema/types"
import { createEngineVocabulary } from "./vocabulary"

// From findings to a recommendation (schema.md; application-review.md, Decide): the findings that count against the
// applicant each become an action, and the most serious action is the recommendation. Everything that counts is listed,
// grouped by rule with the entities it covers.

export type Recommendation = "approve" | T.RecommendedAction

/** One rule's findings of one kind, with every entity they cover. */
export type ActionGroup = { ruleKey: T.RuleKey; entities: string[]; remedy: T.Remedy | null }

export type Decision = {
  recommendation: Recommendation
  changes: ActionGroup[] // not met: what to change
  missingInformation: ActionGroup[] // what to provide
  committeeDecisions: ActionGroup[] // for the committee
  suggestions: ActionGroup[] // advisory
}

// Deny first, since no added information fixes it; request information before the committee, which can't weigh an
// incomplete application; the committee before conditions, which are the committee's to set.
const severity: Recommendation[] = [
  "deny",
  "request-information",
  "refer-to-committee",
  "approve-with-conditions",
  "approve"
]

// The parties an application binds: findings on rules borne by anyone else (the committee's own deadlines) are shown,
// but never count against the applicant.
const applicants = ["owner", "applicant"]

export function decide(findings: T.Finding[], rulesFile: T.RulesFile, requestType: T.TermKey): Decision {
  const vocabulary = createEngineVocabulary([...rulesFile.proposedCore, ...rulesFile.terms])
  const rules = new Map(rulesFile.rules.map((rule) => [rule.key, rule]))
  const { deciders } = rulesFile.settings.clauses
  const { decisionPolicy } = rulesFile.settings.policy
  const decider = deciders.find((found) => found.requestType === requestType)?.party ?? null

  // An approval the decider's own approval would satisfy is the decision the application asks for.
  const isTheDecision = (check: T.Check | null) =>
    check?.type === "approval" &&
    decider !== null &&
    (check.needs === "any" ? check.by.includes(decider) : check.by.every((party) => party === decider))

  const counts = (finding: T.Finding) => {
    const rule = rules.get(finding.ruleKey)
    if (rule?.kind !== "norm" || isTheDecision(rule.check)) {
      return false
    }
    const { bearer } = rule
    return (
      bearer.length === 0 || applicants.some((party) => bearer.some((bearing) => vocabulary.isKindOf(bearing, party)))
    )
  }

  const groups = (outcome: T.Outcome) => {
    const byRule = new Map<T.RuleKey, ActionGroup>()
    for (const finding of findings.filter((found) => found.outcome === outcome && counts(found))) {
      const group = byRule.get(finding.ruleKey) ?? { ruleKey: finding.ruleKey, entities: [], remedy: finding.remedy }
      group.entities.push(finding.entity)
      byRule.set(finding.ruleKey, group)
    }
    return [...byRule.values()]
  }

  const changes = groups("not-met")
  const missingInformation = groups("missing-information")
  const committeeDecisions = groups("committee")
  // A not-met requirement has no remedy: nothing the applicant changes in the design fixes it.
  const actions: Recommendation[] = [
    ...changes.map((group) =>
      match(group.remedy)
        .with("change-detail", "redesign", "none", (remedy) => decisionPolicy[remedy])
        .otherwise(() => decisionPolicy.none)
    ),
    ...missingInformation.map((): Recommendation => "request-information"),
    ...committeeDecisions.map((): Recommendation => "refer-to-committee")
  ]
  return {
    recommendation: severity.find((action) => actions.includes(action)) ?? "approve",
    changes,
    missingInformation,
    committeeDecisions,
    suggestions: groups("advisory")
  }
}
