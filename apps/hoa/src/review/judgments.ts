import { z } from "zod"
import type { Judgment } from "@/engine/context"
import type { EngineVocabulary } from "@/engine/vocabulary"
import { renderStatement } from "@/schema/statement"
import type * as T from "@/schema/types"
import { modelEvidence, toEvidence } from "./factSchema"
import { pageTypeOf, type PageRef, type PageTypes } from "./packet"

// Judgments (application-review.md, Judgments): one call per judgment check and subject the engine can't decide
// without one, with the facts its evidence terms name and only the pages those facts cite or that are of the document
// types it names.

export const judgmentAnswerSchema = z.object({
  answer: z.enum(["yes", "no", "unclear"]),
  confidence: z.number().min(0).max(1),
  rationale: z.string(),
  evidence: z.array(modelEvidence)
})
export type JudgmentAnswer = z.infer<typeof judgmentAnswerSchema>

export type JudgmentCall = {
  ruleKey: T.RuleKey
  entity: string
  statement: string
  question: string
  evidenceTerms: T.TermKey[]
}

/**
 * The judgments a first evaluation couldn't decide for want of an answer: left to the committee, or waiting on
 * information that may yet make them apply.
 */
export function judgmentCalls(
  findings: readonly T.Finding[],
  rules: readonly T.Rule[],
  vocabulary: EngineVocabulary
): JudgmentCall[] {
  const byKey = new Map(rules.map((rule) => [rule.key, rule]))
  return findings.flatMap((finding) => {
    const rule = byKey.get(finding.ruleKey)
    const isOpen = finding.outcome === "committee" || finding.outcome === "missing-information"
    if (rule?.kind !== "norm" || rule.check?.type !== "judgment" || !isOpen || finding.judgment) {
      return []
    }
    return [
      {
        ruleKey: rule.key,
        entity: finding.entity,
        statement: renderStatement(rule.statement, (key, plural) => vocabulary.label(key, plural)),
        question: rule.check.question,
        evidenceTerms: rule.check.evidence
      }
    ]
  })
}

/** The facts a judgment reads: the subject's facts for the properties its evidence terms name. */
export function judgmentFacts(call: JudgmentCall, facts: readonly T.Fact[]) {
  return facts.filter((fact) => fact.entity === call.entity && call.evidenceTerms.includes(fact.property))
}

/**
 * The pages a judgment may look at: those its facts cite, those of a document type its evidence names, and drawings
 * and photos of a generic kind, which may be any of them. Every page when nothing narrows them.
 */
export function judgmentPages(
  call: JudgmentCall,
  facts: readonly T.Fact[],
  pageTypes: PageTypes,
  vocabulary: EngineVocabulary,
  visualKinds: ReadonlySet<string> = new Set()
): (page: PageRef) => boolean {
  const cited = new Set(facts.flatMap((fact) => fact.evidence.map((item) => `${item.fileId} ${item.page}`)))
  const isOfType = (page: PageRef) => {
    const type = pageTypeOf(pageTypes, page.fileId, page.pageIndex)
    return (
      type !== null && (visualKinds.has(type) || call.evidenceTerms.some((term) => vocabulary.isKindOf(type, term)))
    )
  }
  const narrowed = (page: PageRef) => cited.has(`${page.fileId} ${page.pageIndex}`) || isOfType(page)
  const hasAny = [...pageTypes].some(([fileId, types]) =>
    types.some((_, index) => narrowed({ fileId, pageIndex: index + 1 }))
  )
  return hasAny ? narrowed : () => true
}

export const toJudgment = (call: JudgmentCall, answer: JudgmentAnswer): Judgment => ({
  ruleKey: call.ruleKey,
  entity: call.entity,
  answer: answer.answer,
  confidence: answer.confidence,
  rationale: answer.rationale,
  evidence: answer.evidence.map(toEvidence)
})
