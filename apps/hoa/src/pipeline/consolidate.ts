import { z } from "zod"
import { authorityRank, type GoverningDocumentKind } from "@/documents/governingDocument"
import { candidateRuleSchema, ruleSchema, type Rule } from "@/rules/rule"
import { assignUniqueKeys, generateRuleKey } from "@/rules/ruleKey"

type CandidateRule = z.infer<typeof candidateRuleSchema>
type Citation = Rule["citations"][number]
type RuleIssue = Rule["issues"][number]

/** A candidate after Verify: its citations located and checked, with the document it came from. */
export type VerifiedCandidate = {
  /** Stable within a build: "{sectionId}:{index}". */
  candidateId: string
  sectionId: string
  documentKind: GoverningDocumentKind
  candidate: CandidateRule
  citations: Citation[]
  issues: RuleIssue[]
  provenance: Extract<Rule["provenance"], { source: "extraction" }>
}

/** The consolidation model's proposal (docs/design/extraction.md, "6. Consolidate"). */
export const consolidationResultSchema = z.object({
  duplicates: z.array(z.object({ keep: z.string(), merge: z.array(z.string()) })),
  conflicts: z.array(z.object({ candidateIds: z.array(z.string()).min(2), description: z.string() })),
  exceptions: z.array(z.object({ exceptionId: z.string(), modifiesId: z.string() }))
})
export type ConsolidationResult = z.infer<typeof consolidationResultSchema>

/** A stable hash of the candidate as extracted, so a rebuild can tell an unchanged source from a changed one. */
export async function hashCandidate(candidate: CandidateRule) {
  const bytes = new TextEncoder().encode(JSON.stringify(candidate))
  const digest = await crypto.subtle.digest("SHA-256", bytes)
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("")
}

const issue = (code: RuleIssue["code"], message: string, relatedRuleIds?: string[]): RuleIssue => ({
  code,
  message,
  resolution: null,
  ...(relatedRuleIds ? { relatedRuleIds } : {})
})

/**
 * Applies the model's proposal in code: merges duplicates (keeping every citation), flags conflicts on each rule with
 * the higher-authority document first, links exceptions, and generates ids, unique rule keys and text condition ids.
 * Rules come out pending; Save draft carries earlier work forward.
 */
export async function applyConsolidation(
  candidates: readonly VerifiedCandidate[],
  result: ConsolidationResult,
  context: { rulebookId: string; createId?: () => string }
): Promise<Rule[]> {
  const createId = context.createId ?? (() => crypto.randomUUID())
  const byId = new Map(candidates.map((candidate) => [candidate.candidateId, candidate]))
  const mergedInto = new Map<string, string>()
  for (const duplicate of result.duplicates) {
    if (!byId.has(duplicate.keep)) {
      continue
    }
    for (const id of duplicate.merge) {
      if (id !== duplicate.keep && byId.has(id)) {
        mergedInto.set(id, duplicate.keep)
      }
    }
  }
  const kept = candidates.filter((candidate) => !mergedInto.has(candidate.candidateId))
  const ruleIds = new Map(kept.map((candidate) => [candidate.candidateId, createId()]))
  const ruleIdFor = (candidateId: string) => ruleIds.get(mergedInto.get(candidateId) ?? candidateId)

  const keyed = assignUniqueKeys(
    kept.map((candidate) => ({
      candidate,
      key: generateRuleKey(candidate.candidate),
      section: candidate.citations[0]?.section ?? candidate.sectionId
    }))
  )
  const keysByCandidate = new Map(keyed.map((item) => [item.candidate.candidateId, item]))

  return Promise.all(
    kept.map(async (verified): Promise<Rule> => {
      const id = ruleIdFor(verified.candidateId) ?? createId()
      const keyedRule = keysByCandidate.get(verified.candidateId)
      const merged = candidates.filter((candidate) => mergedInto.get(candidate.candidateId) === verified.candidateId)
      const issues: RuleIssue[] = [...verified.issues, ...merged.flatMap((candidate) => candidate.issues)]
      if (keyedRule?.isDuplicate) {
        issues.push(issue("duplicate-key", "Another rule in this rulebook has the same subject and conditions."))
      }
      for (const conflict of result.conflicts) {
        if (!conflict.candidateIds.includes(verified.candidateId)) {
          continue
        }
        const others = conflict.candidateIds.filter((other) => other !== verified.candidateId)
        const ranked = conflict.candidateIds
          .flatMap((candidateId) => byId.get(candidateId) ?? [])
          .toSorted((a, b) => authorityRank[a.documentKind] - authorityRank[b.documentKind])
        const winner = ranked[0]
        const note = winner ? ` The ${winner.documentKind.replace(/-/g, " ")} has the highest authority.` : ""
        issues.push(
          issue(
            "conflict",
            `${conflict.description}${note}`,
            others.flatMap((other) => ruleIdFor(other) ?? [])
          )
        )
      }
      const exception = result.exceptions.find((link) => link.exceptionId === verified.candidateId)
      const modifiesCandidate = exception ? (mergedInto.get(exception.modifiesId) ?? exception.modifiesId) : undefined
      const { appliesWhen, citations: _citations, ...content } = verified.candidate
      return ruleSchema.parse({
        ...content,
        id,
        ruleKey: keyedRule?.key ?? generateRuleKey(verified.candidate),
        rulebookId: context.rulebookId,
        appliesWhen: appliesWhen.map((condition, index) =>
          condition.type === "text" ? { ...condition, id: `${id}:c${index}` } : condition
        ),
        modifies: modifiesCandidate ? (keysByCandidate.get(modifiesCandidate)?.key ?? null) : null,
        citations: [...verified.citations, ...merged.flatMap((candidate) => candidate.citations)],
        issues,
        extractedHash: await hashCandidate(verified.candidate),
        change: "new",
        provenance: verified.provenance,
        review: { status: "pending", isEdited: false, reviewedBy: null, reviewedAt: null, note: null }
      })
    })
  )
}
