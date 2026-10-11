import { citationHref } from "@/features/documents/citationLink"
import type { BuildResult } from "@/rulebook/buildResults"
import type { BuildDocument } from "@/rulebook/buildResults.server"
import { citationLabel } from "../rulebookRecords"

// The build's results as sentences (encoding.md, UX, Results as they arrive). Nothing here is reviewable.

const counted = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`

/** The reader's address for a provision, when the build knows which upload holds it. */
export function provisionHref(provisionKey: string, documents: readonly BuildDocument[]) {
  const documentKey = provisionKey.slice(0, provisionKey.indexOf(":"))
  const document = documents.find((item) => item.key === documentKey)
  return document ? citationHref(document.documentId, provisionKey) : null
}

/** The provision a batch of rules is named by: its first rule's main citation. */
const batchProvision = (batchId: string) => batchId.split("#")[0] ?? batchId

/** What one result says, in a sentence. A section, or a group of them, is named by its first provision. */
export function resultSentence(result: BuildResult, documents: readonly BuildDocument[]) {
  switch (result.kind) {
    case "terms": {
      const title = documents.find((document) => document.key === result.documentKey)?.title ?? "a document"
      return `Found ${counted(result.labels.length, "defined term", "defined terms")} in ${title}`
    }
    case "outlines": {
      const section = citationLabel(result.unitId)
      const found = result.rules.length === 0 ? "no rules" : counted(result.rules.length, "rule", "rules")
      return result.isRerun ? `Looked at ${section} again: ${found}` : `Found ${found} in ${section}`
    }
    case "checked-together":
      return result.problems === 0
        ? "Checked every section’s rules together: no problems"
        : `Checked every section’s rules together: ${counted(result.problems, "problem", "problems")} in ${counted(result.unitsWithProblems, "section", "sections")} to look at again`
    case "vocabulary":
      return result.labels.length === 0
        ? `Built the vocabulary for the rules from ${citationLabel(result.unitId)}: no new terms`
        : `Built the vocabulary for the rules from ${citationLabel(result.unitId)}: ${counted(result.labels.length, "term", "terms")}`
    case "rules": {
      const from = citationLabel(batchProvision(result.batchId))
      if (result.round > 0) {
        return `Redrafted ${counted(result.rules.length, "rule", "rules")} from ${from} that had problems`
      }
      return result.rules.length === 0
        ? `No rules drafted from ${from}`
        : `Drafted ${counted(result.rules.length, "rule", "rules")} from ${from}`
    }
    case "rules-checked":
      return result.rulesWithProblems === 0
        ? "Checked the drafted rules together: no problems"
        : `Checked the drafted rules together: ${counted(result.rulesWithProblems, "rule", "rules")} with problems to fix`
    case "combined":
      return result.conflicts === 0
        ? "Combined every section into one draft"
        : `Combined every section into one draft: ${counted(result.conflicts, "conflict", "conflicts")} between sections`
    case "consolidated":
      return result.conflicts === 0
        ? "Checked the whole draft for duplicates and conflicts: none to decide"
        : `Checked the whole draft for duplicates and conflicts: ${counted(result.conflicts, "conflict", "conflicts")} to decide in the review`
  }
}

/** Newest first: the order the feed shows. */
export const newestFirst = (results: Iterable<BuildResult>) =>
  [...results].toSorted((a, b) => b.at.localeCompare(a.at) || b.id.localeCompare(a.id))
