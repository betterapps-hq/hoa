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

/** What one result says, in a sentence. A section is named by its first provision. */
export function resultSentence(result: BuildResult, documents: readonly BuildDocument[]) {
  switch (result.kind) {
    case "terms": {
      const title = documents.find((document) => document.documentId === result.documentId)?.title ?? "a document"
      return result.isReused
        ? `Kept ${counted(result.labels.length, "defined term", "defined terms")} from ${title}: its definitions haven’t changed`
        : `Found ${counted(result.labels.length, "defined term", "defined terms")} in ${title}`
    }
    case "rules":
      return result.rules.length === 0
        ? `No rules from ${citationLabel(result.unitId)}`
        : `Drafted ${counted(result.rules.length, "rule", "rules")} from ${citationLabel(result.unitId)}`
    case "checked":
      return result.problems === 0
        ? `Checked ${citationLabel(result.unitId)}: no problems`
        : `Checked ${citationLabel(result.unitId)}: ${counted(result.problems, "problem", "problems")} to fix`
    case "repaired":
      if (result.problemsLeft === null) {
        return `A fix for ${citationLabel(result.unitId)} didn’t help, so its draft stays as it was`
      }
      return result.problemsLeft === 0
        ? `Fixed the problems in ${citationLabel(result.unitId)}`
        : `Fixed what it could in ${citationLabel(result.unitId)}: ${counted(result.problemsLeft, "problem", "problems")} left for review`
    case "checked-together":
      return result.problems === 0
        ? "Checked every section together: no problems between them"
        : `Checked every section together: ${counted(result.problems, "problem", "problems")} in ${counted(result.unitsWithProblems, "section", "sections")}`
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
