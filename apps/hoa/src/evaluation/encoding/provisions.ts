import { normalizeForMatching } from "@/ocr/page"
import type { NoRule, Provision, ProvisionKey } from "@/schema/types"
import { ratio } from "@/text/match"

// Structure and coverage scores (implementation-plan.md, Evaluation round 1): how many of the golden encoding's
// provision keys the pipeline found, how close each matched provision's text is, whether every provision the pipeline
// encoded is cited or given a reason, and whether its no-rule reasons agree with the golden's.

type ProvisionLike = Pick<Provision, "key" | "kind" | "heading" | "text" | "intro" | "wrapUp">

const marker =
  /^\s*(?:(?:article|part|exhibit)\s+["“]?[a-z0-9]+["”]?:?|section\s+[\d.]+|\d+(?:[.\s-]\d+)*\.?|\([a-z0-9]+\))\s*/i

/** What a provision says: its heading (unless its text repeats it), text, intro and wrap-up, without the number. */
export function provisionContent(provision: ProvisionLike) {
  const text = normalizeForMatching(provision.text.replace(marker, ""))
  const heading = provision.kind === "definition" ? "" : normalizeForMatching(provision.heading ?? "")
  const body = heading && !text.startsWith(heading) ? `${heading} ${text}` : text
  return [body, provision.intro, provision.wrapUp]
    .map((part) => normalizeForMatching(part ?? ""))
    .filter(Boolean)
    .join(" ")
}

const share = (count: number, of: number) => (of === 0 ? 1 : count / of)

/** Golden provisions found by key in the pipeline's, and the text similarity of each match. */
export function compareProvisions<P extends ProvisionLike>(golden: readonly P[], ours: readonly P[]) {
  const byKey = new Map(ours.map((provision) => [provision.key, provision]))
  const goldenKeys = new Set(golden.map((provision) => provision.key))
  const matched = golden.flatMap((provision) => {
    const found = byKey.get(provision.key)
    return found
      ? [{ golden: provision, ours: found, score: ratio(provisionContent(provision), provisionContent(found)) }]
      : []
  })
  return {
    matched,
    missing: golden.filter((provision) => !byKey.has(provision.key)).map((provision) => provision.key),
    extra: ours.filter((provision) => !goldenKeys.has(provision.key)).map((provision) => provision.key),
    keyMatch: share(matched.length, golden.length),
    similarity: matched.length === 0 ? 0 : matched.reduce((sum, { score }) => sum + score, 0) / matched.length
  }
}

type ReasonDisagreement = { key: ProvisionKey; golden: NoRule["reason"]; pipeline: NoRule["reason"] | null }

/**
 * Coverage of the pipeline's provisions (cited, or given a no-rule reason), and agreement with the golden's reasons:
 * of the golden provisions with a reason that the pipeline also has, the share it gives the same reason.
 */
export function coverageScores(
  golden: readonly Pick<Provision, "key" | "noRule">[],
  ours: readonly Pick<Provision, "key" | "noRule">[],
  coverage: { provisions: number; uncovered: readonly ProvisionKey[] }
) {
  const byKey = new Map(ours.map((provision) => [provision.key, provision]))
  const compared = golden.flatMap((provision) => {
    const found = byKey.get(provision.key)
    return provision.noRule && found ? [{ key: provision.key, golden: provision.noRule.reason, found }] : []
  })
  const disagreements: ReasonDisagreement[] = compared
    .filter(({ golden: reason, found }) => found.noRule?.reason !== reason)
    .map(({ key, golden: reason, found }) => ({ key, golden: reason, pipeline: found.noRule?.reason ?? null }))
  return {
    coverage: share(coverage.provisions - coverage.uncovered.length, coverage.provisions),
    uncovered: [...coverage.uncovered],
    reasonAgreement: share(compared.length - disagreements.length, compared.length),
    reasonsCompared: compared.length,
    disagreements
  }
}

/**
 * Which provisions belong to a split: a provision is in it when its document key, or the key of its topmost ancestor
 * (an article), is one of the split's selectors.
 */
export function splitMembership(
  provisions: readonly Pick<Provision, "key" | "parentLabel">[],
  selectors: readonly string[]
) {
  const wanted = new Set(selectors)
  const byKey = new Map(provisions.map((provision) => [provision.key, provision]))
  const documentOf = (key: ProvisionKey) => key.slice(0, Math.max(0, key.indexOf(":")))
  const rootOf = (key: ProvisionKey) => {
    const seen = new Set<string>()
    let current = byKey.get(key)
    while (current?.parentLabel && !seen.has(current.key)) {
      seen.add(current.key)
      const parent = byKey.get(`${documentOf(current.key)}:${current.parentLabel}`)
      if (!parent) {
        break
      }
      current = parent
    }
    return current?.key ?? key
  }
  return (key: ProvisionKey) => wanted.has(documentOf(key)) || wanted.has(rootOf(key))
}
