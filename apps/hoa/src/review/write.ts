import { z } from "zod"
import type { Decision } from "@/engine/decide"
import type { EngineVocabulary } from "@/engine/vocabulary"
import { renderStatement } from "@/schema/statement"
import type * as T from "@/schema/types"
import type { ActionItem } from "./reviewModel"
import { unknownRuleMarkers } from "./ruleMarkers"

// Decide's groups as action items, and what the writer (hoa-review-summary) gets and returns (application-review.md,
// Decide and Write). The writer sees only the findings, their rules and cited provisions, and the action items, so it
// can't introduce a requirement; code checks every rule marker it writes.

export type ActionItems = Pick<Decision, "changes" | "missingInformation" | "committeeDecisions" | "suggestions">
export type PhrasedItems = Record<keyof ActionItems, ActionItem[]>

type Kind = { key: keyof ActionItems; prefix: string; label: string }

const changes: Kind = { key: "changes", prefix: "change", label: "what to change" }
const provide: Kind = { key: "missingInformation", prefix: "provide", label: "what to provide" }
const committee: Kind = { key: "committeeDecisions", prefix: "committee", label: "for the committee" }
const suggestion: Kind = { key: "suggestions", prefix: "suggestion", label: "suggestion" }

type WriterContext = {
  rules: ReadonlyMap<T.RuleKey, T.Rule>
  entities: readonly T.EvaluationRequest["entities"][number][]
  findings: readonly T.Finding[]
  vocabulary: EngineVocabulary
}

const entityLabel = (context: WriterContext, id: string) =>
  context.entities.find((entity) => entity.id === id)?.label ?? id

const outcomeOf: Record<keyof ActionItems, T.Outcome> = {
  changes: "not-met",
  missingInformation: "missing-information",
  committeeDecisions: "committee",
  suggestions: "advisory"
}

/** Each group of findings as an action item, worded by code until the writer phrases it. */
export function actionItems(decision: ActionItems, context: WriterContext): PhrasedItems {
  const items = (kind: Kind) =>
    decision[kind.key].map((group, index): ActionItem => {
      const reasons = new Set(
        context.findings
          .filter(
            (finding) =>
              finding.ruleKey === group.ruleKey &&
              finding.outcome === outcomeOf[kind.key] &&
              group.entities.includes(finding.entity)
          )
          .map((finding) => finding.reason)
      )
      const title = context.rules.get(group.ruleKey)?.title ?? group.ruleKey
      const entities = group.entities.map((id) => entityLabel(context, id)).join(", ")
      return {
        id: `${kind.prefix}-${index + 1}`,
        ruleKey: group.ruleKey,
        entities: group.entities,
        text: `${title} (${entities}): ${[...reasons].join(" ")}`
      }
    })
  return {
    changes: items(changes),
    missingInformation: items(provide),
    committeeDecisions: items(committee),
    suggestions: items(suggestion)
  }
}

const markerHelp =
  "Refer to a rule only with its rule marker: two opening braces, then rule: and the rule key the findings give, then " +
  "two closing braces, such as {{rule:guidelines:5.4.2(i)#colors}}. Never write a section number or quote a provision."

/**
 * The rules the writer may refer to: those with findings, the rules that modified them, and any selected rule a
 * finding's reason names (an override whose applicability it waits on).
 */
export function markableRules(findings: readonly T.Finding[], selected: Iterable<T.RuleKey>) {
  const reasons = findings.map((finding) => finding.reason).join("\n")
  return new Set([
    ...findings.map((finding) => finding.ruleKey),
    ...findings.flatMap((finding) => finding.modifiedBy.map((modifier) => modifier.ruleKey)),
    ...[...selected].filter((key) => reasons.includes(key))
  ])
}

/**
 * hoa-review-summary's answer. A marker naming any other rule fails the answer's check, so the call is retried and the
 * answer never cached.
 */
export function summaryAnswerSchema(known: ReadonlySet<T.RuleKey>) {
  return z
    .object({
      assessment: z.string().describe(`For the committee. ${markerHelp}`),
      feedback: z.string().describe(`For the homeowner. ${markerHelp}`),
      items: z.array(
        z.object({ id: z.string().describe("The action item's id."), text: z.string().describe(markerHelp) })
      )
    })
    .superRefine((answer, context) => {
      const unknown = unknownRuleMarkers(
        [answer.assessment, answer.feedback, ...answer.items.map((item) => item.text)],
        known
      )
      if (unknown.length > 0) {
        context.addIssue({ code: "custom", message: `Refers to rules outside the findings: ${unknown.join(", ")}.` })
      }
    })
}
export type SummaryAnswer = z.infer<ReturnType<typeof summaryAnswerSchema>>

function provisionText(rulesFile: T.RulesFile, rule: T.Rule | undefined) {
  const key = rule?.citations[0]?.provisionKey
  const provision = rulesFile.provisions.find((item) => item.key === key)
  const text = [provision?.intro, provision?.text].filter(Boolean).join(" ")
  return text.length > 800 ? `${text.slice(0, 800)}…` : text
}

/** The writer's variables: the recommendation, the findings by rule, the action items and the suggestions. */
export function summaryVariables(
  rulesFile: T.RulesFile,
  recommendation: string,
  items: PhrasedItems,
  context: WriterContext
) {
  const label = (key: T.TermKey, plural: boolean) => context.vocabulary.label(key, plural)
  const shown = context.findings.filter((finding) => finding.outcome !== "not-applicable")
  const groups = Map.groupBy(shown, (finding) => `${finding.ruleKey} ${finding.outcome} ${finding.reason}`)
  const findings = [...groups.values()].flatMap(([first, ...rest]) => {
    if (!first) {
      return []
    }
    const rule = context.rules.get(first.ruleKey)
    return [
      {
        rule: first.ruleKey,
        title: rule?.title ?? first.ruleKey,
        statement: rule ? renderStatement(rule.statement, label) : "",
        outcome: first.outcome,
        things: [first, ...rest].map((finding) => entityLabel(context, finding.entity)),
        reason: first.reason,
        provision: provisionText(rulesFile, rule)
      }
    ]
  })
  const listed = (kind: Kind) =>
    items[kind.key].map((item) => ({
      id: item.id,
      kind: kind.label,
      rule: item.ruleKey,
      things: item.entities.map((id) => entityLabel(context, id)),
      text: item.text
    }))
  const suggestions = listed(suggestion)
  return {
    recommendation,
    findings: JSON.stringify(findings),
    actionItems: JSON.stringify([changes, provide, committee].flatMap(listed)),
    suggestions: suggestions.length > 0 ? JSON.stringify(suggestions) : "none"
  }
}

/** The writer's phrasing applied to the items; an item it skipped keeps code's text. */
export function applySummary(answer: SummaryAnswer, items: PhrasedItems) {
  const phrased = new Map(answer.items.map((item) => [item.id, item.text.trim()]))
  const phrase = (list: ActionItem[]) => list.map((item) => ({ ...item, text: phrased.get(item.id) || item.text }))
  return {
    assessment: answer.assessment,
    feedback: answer.feedback,
    changes: phrase(items.changes),
    missingInformation: phrase(items.missingInformation),
    committeeDecisions: phrase(items.committeeDecisions),
    suggestions: phrase(items.suggestions)
  }
}
