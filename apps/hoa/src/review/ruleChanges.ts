import { ruleContentHash } from "@/rulebook/carryForward"
import type * as T from "@/schema/types"
import type { Review } from "./reviewModel"
import { selectRules } from "./select"

// What a newer rulebook changes for an application already reviewed (application-review.md, Rulebook versions): the
// rules its review applied against the rules the newer rulebook selects for the same request (its entities, its form's
// cited passages, today), by key and content. Code alone; no model reads anything. A kind of thing the review never
// identified can't be matched, so a newer rulebook's rules about it show only once the review runs again.

export type RuleChange = { key: T.RuleKey; title: string; change: "added" | "changed" | "removed" }

/** What a newer rulebook changes for an application: its version and publish date, and the rules it changes. */
export type RulesUpdate = { version: number | null; publishedAt: string | null; changes: RuleChange[] }

export async function ruleChangesSince(
  review: Pick<Review, "selected" | "request">,
  before: T.RulesFile,
  after: T.RulesFile,
  input: { cited: readonly T.ProvisionKey[]; on: T.IsoDate }
): Promise<RuleChange[]> {
  const selected = new Set(
    selectRules(after, {
      type: review.request.type,
      governingDate: input.on,
      entityTypes: review.request.entities.map((entity) => entity.type),
      lotRef: null,
      cited: input.cited
    })
  )
  const applied = new Set(review.selected)
  const earlier = new Map(before.rules.filter((rule) => applied.has(rule.key)).map((rule) => [rule.key, rule]))
  const later = after.rules.filter((rule) => selected.has(rule.key))
  const changed = await Promise.all(
    later.map(async (rule) => {
      const was = earlier.get(rule.key)
      return was && (await ruleContentHash(was)) !== (await ruleContentHash(rule)) ? [rule] : []
    })
  )
  const change = (kind: RuleChange["change"]) => (rule: T.Rule) => ({ key: rule.key, title: rule.title, change: kind })
  return [
    ...later.filter((rule) => !earlier.has(rule.key)).map(change("added")),
    ...changed.flat().map(change("changed")),
    ...[...earlier.values()].filter((rule) => !selected.has(rule.key)).map(change("removed"))
  ]
}
