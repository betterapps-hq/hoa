import { coreTerms } from "./coreTerms"
import type { TermKey } from "./types"
import type { TermContent } from "./zod"

// Looking up a key finds the organization's term first, then the core one (schema.md, Core and organization terms).

export type Vocabulary = {
  get: (key: TermKey) => TermContent | undefined
  /** The preferred label, or its plural; the key itself when the term is unknown. */
  label: (key: TermKey, plural?: boolean) => string
}

export function createVocabulary(organizationTerms: TermContent[]): Vocabulary {
  const byKey = new Map<TermKey, TermContent>()
  for (const term of [...coreTerms, ...organizationTerms]) {
    byKey.set(term.key, term)
  }
  return {
    get: (key) => byKey.get(key),
    label: (key, plural = false) => {
      const preferred = byKey.get(key)?.labels.find((label) => label.role === "preferred")
      if (!preferred) {
        return key
      }
      return plural ? (preferred.plural ?? pluralize(preferred.text)) : preferred.text
    }
  }
}

function pluralize(text: string) {
  if (/(s|x|z|ch|sh)$/.test(text)) {
    return `${text}es`
  }
  if (/[^aeiou]y$/.test(text)) {
    return `${text.slice(0, -1)}ies`
  }
  return `${text}s`
}
