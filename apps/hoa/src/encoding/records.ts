import type { Citation } from "@/schema/types"
import type { TermContent } from "@/schema/zod"
import { labelForms } from "@/text/normalize"

// Combining records' parts, shared by merge and consolidation (schema.md, Editing terms).

/** Citations without repeats of a provision, the first kept, in order. */
export function uniqueCitations(citations: readonly Citation[]) {
  return [...new Map(citations.map((citation) => [citation.provisionKey, citation])).values()]
}

/**
 * Adds labels to a term: a wording it already has (or its plural) is skipped, an incoming preferred label becomes an
 * alternative, and hidden and avoided labels keep their role.
 */
export function mergeLabels(term: TermContent, labels: readonly TermContent["labels"][number][]) {
  const known = new Set(term.labels.flatMap(labelForms))
  for (const label of labels) {
    const forms = labelForms(label)
    if (forms.some((form) => known.has(form))) {
      continue
    }
    forms.forEach((form) => known.add(form))
    term.labels.push({ ...label, role: label.role === "preferred" ? "alternative" : label.role, plural: null })
  }
}
