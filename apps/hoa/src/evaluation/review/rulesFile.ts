import type * as T from "@/schema/types"
import { validateRulebook } from "@/schema/validate"
import { rulesFile } from "@/schema/zod"

// The rules file evaluation reviews against: the published sample Declaration plus rules it doesn't hold yet (the
// Design Guidelines' fence rules, until their encoding is committed). Records the base already has keep the base's
// version; documents take the addition's, which may complete a document the base only names.

const byKey = <R extends { key: string }>(base: readonly R[], extra: readonly R[], isExtraFirst = false) => {
  const merged = new Map<string, R>()
  for (const record of isExtraFirst ? [...base, ...extra] : [...extra, ...base]) {
    merged.set(record.key, record)
  }
  return [...merged.values()]
}

/** The two files as one, validated; throws with the validator's issues when they don't fit together. */
export function mergeRulesFiles(base: T.RulesFile, extra: T.RulesFile): T.RulesFile {
  const merged = rulesFile.parse({
    ...base,
    documents: byKey(base.documents, extra.documents, true),
    provisions: byKey(base.provisions, extra.provisions),
    terms: byKey(base.terms, extra.terms),
    proposedCore: byKey(base.proposedCore, extra.proposedCore),
    rules: byKey(base.rules, extra.rules)
  })
  const issues = validateRulebook(merged)
  if (issues.length > 0) {
    const shown = issues.slice(0, 5).map((issue) => `${issue.recordKey}: ${issue.message}`)
    throw new Error(`The merged rules file has ${issues.length} problem(s): ${shown.join("; ")}`)
  }
  return merged
}
