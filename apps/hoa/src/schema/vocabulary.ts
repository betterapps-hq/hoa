import { coreTerms } from "./coreTerms"
import type { RequestType, TermKey } from "./types"
import type { TermContent } from "./zod"

// Looking up a key finds the organization's term first, then the core one (schema.md, Core and organization terms).

export type Vocabulary = {
  get: (key: TermKey) => TermContent | undefined
  /** The preferred label, or its plural; the key itself when the term is unknown. */
  label: (key: TermKey, plural?: boolean) => string
  /** A category's underlying thing: categories of categories end at a thing. Any other key is its own. */
  thingOf: (key: TermKey) => TermKey
  /** Whether the key is the ancestor itself or a category under it, however deep. */
  isKindOf: (key: TermKey, ancestor: TermKey) => boolean
  /** A thing of nature party, or a category of one. */
  isParty: (key: TermKey) => boolean
  /** A request type's data; null for anything else. */
  requestOf: (key: TermKey) => RequestType | null
}

// Category chains are short; the cap only stops a cycle an unvalidated rulebook might hold.
const maxDepth = 10

export function createVocabulary(organizationTerms: TermContent[]): Vocabulary {
  const byKey = new Map<TermKey, TermContent>()
  for (const term of [...coreTerms, ...organizationTerms]) {
    byKey.set(term.key, term)
  }

  function chain(key: TermKey) {
    const keys = [key]
    for (let depth = 0; depth < maxDepth; depth += 1) {
      const found = byKey.get(keys.at(-1) ?? key)
      if (found?.kind !== "category") {
        break
      }
      keys.push(found.of)
    }
    return keys
  }

  const thingOf = (key: TermKey) => chain(key).at(-1) ?? key

  return {
    get: (key) => byKey.get(key),
    label: (key, plural = false) => {
      const preferred = byKey.get(key)?.labels.find((label) => label.role === "preferred")
      if (!preferred) {
        return key
      }
      return plural ? (preferred.plural ?? pluralize(preferred.text)) : preferred.text
    },
    thingOf,
    isKindOf: (key, ancestor) => chain(key).includes(ancestor),
    isParty: (key) => {
      const found = byKey.get(thingOf(key))
      return found?.kind === "thing" && found.nature === "party"
    },
    requestOf: (key) => {
      const found = byKey.get(key)
      return found?.kind === "thing" ? found.request : null
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
