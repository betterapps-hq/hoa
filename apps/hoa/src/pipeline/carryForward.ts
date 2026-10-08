import type { Rule } from "@/rules/rule"

export type RemovedRule = Pick<Rule, "ruleKey" | "title" | "citations">

export type CarriedForward = { rules: Rule[]; removed: RemovedRule[] }

/**
 * Keeps the administrator's work when a new draft is built (docs/design/rules.md, "Versioning"). Rules are matched by
 * key to the previous draft or published rulebook:
 * - the same extracted content: the previous rule as it was, edits and approval included;
 * - different content: the new rule, pending, marked changed;
 * - no match: new. Hand-added rules come forward, pending only when a document they cite was replaced.
 */
export function carryForward(
  extracted: readonly Rule[],
  previous: readonly Rule[],
  context: { rulebookId: string; sourceDocumentIds: readonly string[] }
): CarriedForward {
  const previousByKey = new Map(previous.map((rule) => [rule.ruleKey, rule]))
  const extractedKeys = new Set(extracted.map((rule) => rule.ruleKey))
  const sources = new Set(context.sourceDocumentIds)

  const rules = extracted.map((rule): Rule => {
    const earlier = previousByKey.get(rule.ruleKey)
    if (!earlier) {
      return { ...rule, change: "new" }
    }
    if (earlier.extractedHash !== null && earlier.extractedHash === rule.extractedHash) {
      return { ...earlier, id: rule.id, rulebookId: context.rulebookId, change: "unchanged" }
    }
    return { ...rule, change: "changed" }
  })

  const handAdded = previous
    .filter((rule) => rule.provenance.source === "administrator" && !extractedKeys.has(rule.ruleKey))
    .map((rule): Rule => {
      const isSourceReplaced = rule.citations.some((citation) => !sources.has(citation.documentId))
      return {
        ...rule,
        id: crypto.randomUUID(),
        rulebookId: context.rulebookId,
        change: isSourceReplaced ? "changed" : "unchanged",
        review: isSourceReplaced
          ? { ...rule.review, status: "pending", reviewedBy: null, reviewedAt: null }
          : rule.review
      }
    })

  const removed = previous
    .filter((rule) => rule.provenance.source === "extraction" && !extractedKeys.has(rule.ruleKey))
    .map(({ ruleKey, title, citations }) => ({ ruleKey, title, citations }))

  return { rules: [...rules, ...handAdded], removed }
}
