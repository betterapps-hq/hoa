import MiniSearch, { type SearchOptions } from "minisearch"

// Search for every list's search box: relevance ranked across words, with typo and prefix matching on each word.

/** A field to search: its text, and how much a match in it counts (1 by default; a title or label counts more). */
export type SearchField<Item> = { text: (item: Item) => string; boost?: number }

export type SearchSetup<Item> = {
  id: (item: Item) => string
  fields: Record<string, SearchField<Item>>
}

export type Search<Item> = {
  /** The ids of the items matching every word of the query, best first; null for a blank query. */
  ids: (query: string) => string[] | null
  /** The given items (any of the indexed ones, already filtered) that match the query, best first; all of them, in their order, for a blank query. */
  rank: (items: readonly Item[], query: string) => Item[]
}

// Words too common to narrow a search: dropped from a query that has other words, so "the fence" finds a fence.
const stopWords: ReadonlySet<string> = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "in",
  "is",
  "it",
  "of",
  "on",
  "or",
  "the",
  "to",
  "with"
])

/** Whether a word is too common to narrow a search or a match, such as "the" or "of". */
export const isStopWord = (word: string) => stopWords.has(word)

const tokenize: (text: string) => string[] = MiniSearch.getDefault("tokenize")

/** Lowercase, without accents, so "Façade" finds "facade". */
const normalize = (term: string) =>
  term
    .normalize("NFD")
    .replaceAll(/\p{Mark}/gu, "")
    .toLowerCase()

/**
 * How far a word may be from what's indexed: short words and numbers exactly, a word of four to seven letters within
 * one edit, a longer one within two.
 */
export function fuzziness(term: string) {
  if (term.length < 4 || /\d/.test(term)) {
    return 0
  }
  return term.length < 8 ? 1 : 2
}

const searchOptions: SearchOptions = { prefix: true, fuzzy: fuzziness, combineWith: "AND" }

/**
 * An index over items, built once per data set: each field's words, so a search ranks the items by relevance, matches
 * every word as a prefix and with typos scaled to its length, and needs all the words (more words narrow it).
 */
export function createSearch<Item>(items: readonly Item[], { id, fields }: SearchSetup<Item>): Search<Item> {
  const names = Object.keys(fields)
  const index = new MiniSearch<Item>({
    idField: "id",
    fields: names,
    extractField: (item, field) => (field === "id" ? id(item) : (fields[field]?.text(item) ?? "")),
    processTerm: (term) => normalize(term) || null,
    searchOptions: {
      ...searchOptions,
      boost: Object.fromEntries(names.map((name) => [name, fields[name]?.boost ?? 1]))
    }
  })
  index.addAll(items)

  const ids = (query: string) => {
    const words = tokenize(query).map(normalize).filter(Boolean)
    if (words.length === 0) {
      return null
    }
    const hasOtherWords = words.some((word) => !stopWords.has(word))
    return index
      .search(query, {
        processTerm: (term) => {
          const word = normalize(term)
          return word && !(hasOtherWords && stopWords.has(word)) ? word : null
        }
      })
      .map((result) => String(result.id))
  }

  return {
    ids,
    rank: (shown, query) => {
      const ranked = ids(query)
      if (ranked === null) {
        return [...shown]
      }
      const byId = new Map(shown.map((item) => [id(item), item]))
      return ranked.flatMap((key) => {
        const item = byId.get(key)
        return item === undefined ? [] : [item]
      })
    }
  }
}
