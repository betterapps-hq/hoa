import type { Review, Rule, Term } from "@/schema/types"
import { canonicalJson, sha256Hex } from "./canonical"

// Carrying approvals forward (encoding.md, Save draft): a record whose key and content equal a record approved in the
// organization's last published rulebook keeps that approval, so a rebuild only asks about what changed. A record's
// content is everything but its bookkeeping (provenance, review, issues): what extraction and the editor write.

export function ruleContentHash(rule: Rule) {
  const { provenance: _provenance, review: _review, issues: _issues, ...content } = rule
  return sha256Hex(canonicalJson(content))
}

export function termContentHash(term: Term) {
  const { provenance: _provenance, review: _review, issues: _issues, labels, ...content } = term
  const labelContent = labels.map(({ provenance: _labelProvenance, ...label }) => label)
  return sha256Hex(canonicalJson({ ...content, labels: labelContent }))
}

async function keepApprovals<R extends { key: string; review: Review }>(
  drafts: readonly R[],
  published: readonly R[],
  hash: (record: R) => Promise<string>
): Promise<R[]> {
  const approved = new Map<string, { review: Review; hash: string }>()
  for (const record of published) {
    if (record.review.status === "approved") {
      approved.set(record.key, { review: record.review, hash: await hash(record) })
    }
  }
  return Promise.all(
    drafts.map(async (draft) => {
      const match = approved.get(draft.key)
      return match && match.hash === (await hash(draft)) ? { ...draft, review: match.review } : draft
    })
  )
}

/** The draft's rules and terms, with the approvals of the published rulebook's unchanged records. */
export async function carryForward(
  draft: { rules: readonly Rule[]; terms: readonly Term[] },
  published: { rules: readonly Rule[]; terms: readonly Term[] }
) {
  const [rules, terms] = await Promise.all([
    keepApprovals(draft.rules, published.rules, ruleContentHash),
    keepApprovals(draft.terms, published.terms, termContentHash)
  ])
  return { rules, terms }
}
