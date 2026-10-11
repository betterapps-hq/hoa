import { isPresent } from "ts-extras"
import { match } from "ts-pattern"
import type { SearchSetup } from "@/lib/search"
import { termKeysOf } from "@/rulebook/review"
import { coreTerms } from "@/schema/coreTerms"
import type * as T from "@/schema/types"
import type { Vocabulary } from "@/schema/vocabulary"
import type { TermContent } from "@/schema/zod"

// The terms tab (encoding.md, UX, Terms): the terms grouped under what they describe, where each is used, the review
// filter and the search the tab finds words with.

/** The rules that read each term, rejected rules left out. */
export function termUsage(rules: T.Rule[]) {
  const usage = new Map<T.TermKey, T.RuleKey[]>()
  for (const rule of rules.filter((item) => item.review.status !== "rejected")) {
    for (const key of termKeysOf(rule)) {
      usage.set(key, [...(usage.get(key) ?? []), rule.key])
    }
  }
  return usage
}

export type TermFilters = {
  query: string
  status: T.Review["status"] | "all"
}

/** The terms' search: a label counts most, then the key, then the definition. */
export const termSearchSetup: SearchSetup<T.Term> = {
  id: (term) => term.key,
  fields: {
    labels: { text: (term) => term.labels.map((label) => label.text).join(" "), boost: 3 },
    key: { text: (term) => term.key, boost: 2 },
    definition: { text: (term) => term.definition ?? "" }
  }
}

/** Where a subject is listed: things by their nature, then the lists of choices no property uses, then the units. */
export type TermSectionId = "object" | "request" | "party" | "event" | "document" | "list" | "unit" | "other"

export const termSections: { id: TermSectionId; title: string; noun: string }[] = [
  { id: "object", title: "Things", noun: "things" },
  { id: "request", title: "Requests", noun: "requests" },
  { id: "party", title: "People and organizations", noun: "people and organizations" },
  { id: "event", title: "Events", noun: "events" },
  { id: "document", title: "Documents", noun: "documents" },
  { id: "list", title: "Lists of choices", noun: "lists" },
  { id: "unit", title: "Units", noun: "units" },
  { id: "other", title: "Other terms", noun: "terms" }
]

/** A term and the terms that hang off it: its kinds (categories), its details (properties) and a list's choices. */
export type TermNode = {
  key: T.TermKey
  /** The organization's term, with its review; null for a core term, which isn't reviewed here. */
  term: T.Term | null
  /** The term as the vocabulary knows it; undefined when nothing has the key. */
  content: TermContent | undefined
  label: string
  /** The rules that read this term itself. */
  usedBy: T.RuleKey[]
  kinds: TermNode[]
  details: TermNode[]
  /** A choice property's list of choices. */
  choices: TermNode | null
  /** A list's choices. */
  values: TermNode[]
}

/** A term nothing else holds, listed at the top of its section. */
export type TermSubject = TermNode & {
  section: TermSectionId
  /** Every rule that reads the subject or a term under it. */
  rules: T.RuleKey[]
}

/** The node and every term under it, each once. */
export function termsUnder(node: TermNode): TermNode[] {
  const seen = new Map<T.TermKey, TermNode>()
  const visit = (item: TermNode) => {
    if (seen.has(item.key)) {
      return
    }
    seen.set(item.key, item)
    for (const child of [...item.kinds, ...item.details, ...(item.choices ? [item.choices] : []), ...item.values]) {
      visit(child)
    }
  }
  visit(node)
  return [...seen.values()]
}

const leadingMarks = /^[^\p{L}\p{N}]+/u

/** Labels in alphabetical order, ignoring case and leading quotes or punctuation. */
const compareText = (a: string, b: string) =>
  a.replace(leadingMarks, "").localeCompare(b.replace(leadingMarks, ""), undefined, { sensitivity: "base" })

const sectionOf = (content: TermContent | undefined): TermSectionId =>
  match(content)
    .with({ kind: "thing" }, ({ nature }) => nature)
    .with({ kind: "value-set" }, () => "list" as const)
    .with({ kind: "unit" }, () => "unit" as const)
    .otherwise(() => "other" as const)

/**
 * The organization's terms grouped under what they describe: each property and category under its thing (or
 * category), each value in its list, and each choice property with its list. A core term the organization's terms
 * hang off joins the tree, and a core list a property chooses from brings its choices, but nothing else of the core
 * vocabulary does. Subjects, kinds and details come most used first.
 */
export function termSubjects(
  terms: T.Term[],
  { vocabulary, usage }: { vocabulary: Vocabulary; usage: Map<T.TermKey, T.RuleKey[]> }
): TermSubject[] {
  const own = new Map(terms.map((term) => [term.key, term]))
  const nodes = new Map<T.TermKey, TermNode>()
  const queue: TermNode[] = []
  const held = new Set<T.TermKey>()
  const node = (key: T.TermKey) => {
    const found = nodes.get(key)
    if (found) {
      return found
    }
    const created: TermNode = {
      key,
      term: own.get(key) ?? null,
      content: vocabulary.get(key),
      label: vocabulary.label(key),
      usedBy: usage.get(key) ?? [],
      kinds: [],
      details: [],
      choices: null,
      values: []
    }
    nodes.set(key, created)
    queue.push(created)
    return created
  }
  const hold = (parent: T.TermKey, child: TermNode, place: "kinds" | "details" | "values") => {
    node(parent)[place].push(child)
    held.add(child.key)
  }

  for (const term of terms) {
    node(term.key)
  }
  // Placing a term can bring in the core term it hangs off, which is placed in turn.
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index]!
    match(current.content)
      .with({ kind: "category" }, ({ of }) => hold(of, current, "kinds"))
      .with({ kind: "property" }, ({ of, valueType }) => {
        hold(of, current, "details")
        if (valueType.type === "choice") {
          current.choices = node(valueType.set)
          held.add(valueType.set)
        }
      })
      .with({ kind: "value" }, ({ set }) => hold(set, current, "values"))
      .with({ kind: "value-set" }, () => {
        if (current.term === null) {
          for (const value of coreTerms) {
            if (value.kind === "value" && value.set === current.key) {
              node(value.key)
            }
          }
        }
      })
      .otherwise(() => undefined)
  }

  // Kinds and details come most used first, then by the names they're shown by; choices keep their list's order.
  const byUse = (holder: TermNode) => (a: TermNode, b: TermNode) =>
    b.usedBy.length - a.usedBy.length ||
    compareText(labelWithin(a.label, holder.label), labelWithin(b.label, holder.label))
  for (const item of nodes.values()) {
    item.kinds.sort(byUse(item))
    item.details.sort(byUse(item))
  }

  return [...nodes.values()]
    .filter((item) => !held.has(item.key))
    .map((item) => ({
      ...item,
      section: sectionOf(item.content),
      rules: [...new Set(termsUnder(item).flatMap((under) => under.usedBy))]
    }))
    .toSorted((a, b) => b.rules.length - a.rules.length || compareText(a.label, b.label))
}

/** A subject as the filters leave it: the terms under it that match, or that hold one that does. */
export type ShownSubject = {
  subject: TermSubject
  /** The subject with only the kinds and details the filters keep; a kept list keeps all its choices. */
  shown: TermNode
  /** The organization's terms in it that match the filters themselves. */
  matched: T.Term[]
  /** Its best place in the search's order. */
  rank: number
}

/**
 * The subjects the filters keep. A term matches by its review and the search's words; once a term matches the words,
 * everything under it does, so finding a thing shows all of it.
 */
export function filterSubjects(
  subjects: TermSubject[],
  filters: Pick<TermFilters, "status">,
  found: string[] | null
): ShownSubject[] {
  const ranks = new Map((found ?? []).map((key, index) => [key, index]))
  const hasStatus = (item: TermNode) =>
    filters.status === "all" || (item.term !== null && item.term.review.status === filters.status)

  function prune(item: TermNode, words: Map<string, number> | null, matched: T.Term[]): TermNode | null {
    const isFound = words === null || words.has(item.key)
    const below = isFound ? null : words
    const isMatch = isFound && hasStatus(item)
    if (isMatch && item.term) {
      matched.push(item.term)
    }
    const kinds = item.kinds.map((kind) => prune(kind, below, matched)).filter(isPresent)
    const details = item.details.map((detail) => prune(detail, below, matched)).filter(isPresent)
    const choices = [...(item.choices ? [item.choices, ...item.choices.values] : []), ...item.values].filter(
      (choice) => (below === null || below.has(choice.key)) && hasStatus(choice)
    )
    for (const choice of choices) {
      if (choice.term) {
        matched.push(choice.term)
      }
    }
    if (!isMatch && kinds.length === 0 && details.length === 0 && choices.length === 0) {
      return null
    }
    return { ...item, kinds, details }
  }

  return subjects.flatMap((subject) => {
    const matched: T.Term[] = []
    const shown = prune(subject, found ? ranks : null, matched)
    if (!shown) {
      return []
    }
    const rank = Math.min(...termsUnder(subject).map((item) => ranks.get(item.key) ?? Number.POSITIVE_INFINITY))
    return [{ subject, shown, matched: [...new Set(matched)], rank }]
  })
}

/** "37 details", "3 of 37 details"; nothing for none. */
const counted = (count: number, of: number, one: string, many: string) =>
  count === 0 ? null : `${count < of ? `${count} of ${of}` : count} ${of === 1 ? one : many}`

/** What a subject holds, in words: "37 details and 3 kinds", "3 of 37 details", "4 choices". */
export function subjectSummary(shown: TermNode, subject: TermNode) {
  return [
    counted(shown.details.length, subject.details.length, "detail", "details"),
    counted(shown.kinds.length, subject.kinds.length, "kind", "kinds"),
    counted(subject.values.length, subject.values.length, "choice", "choices")
  ]
    .filter(isPresent)
    .join(" and ")
}

/** A term's label under its holder, without the holder's name it repeats: "gate height" under gate is "height". */
export function labelWithin(label: string, holder: string) {
  const prefix = `${holder} `
  return label.length > prefix.length && label.toLowerCase().startsWith(prefix.toLowerCase())
    ? label.slice(prefix.length)
    : label
}
