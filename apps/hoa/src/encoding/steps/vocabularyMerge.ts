import { z } from "zod"
import type { PromptVariables } from "@/ai/prompts"
import { compareCodeUnits } from "@/rulebook/canonical"
import { coreTerms } from "@/schema/coreTerms"
import type { TermKey } from "@/schema/types"
import { createVocabulary } from "@/schema/vocabulary"
import { termDraft, type TermContent } from "@/schema/zod"
import { matchLabel } from "@/text/match"
import { labelForms } from "@/text/normalize"
import { valueTypeText } from "../promptVariables"
import { mergeLabels, uniqueCitations } from "../records"
import { segment } from "./drafts"
import type { stepPrompts } from "./prompts"
import { signatureOf } from "./vocabulary"

// C-merge (hoa-vocabulary-merge, prompt drafts v2): code merges the groups' exact keys (same key, kind and value
// type), then lists clusters as term lines: terms of one kind and scope whose labels match exactly or fuzzily, and
// lines that share a key but differ in kind or value type. One call decides them from the lines alone: merges,
// renames of collisions, and contexts for lookalikes. Code applies the answer and freezes the vocabulary. The same
// step reconciles F's proposed terms against the frozen vocabulary.

/** Where a term comes from: core, B's defined terms, the previous vocabulary, the frozen one, a C group or F. */
export type TermOrigin = "core" | "defined" | "previous" | "frozen" | `group ${number}` | "proposed"

/** One term as C-merge sees it: the term, the outlines it serves and its origin. */
export type VocabularyEntry = { term: TermContent; serves: string[]; origin: TermOrigin }

/** Origins whose terms are never renamed or merged into another. */
const fixedOrigins = new Set<TermOrigin>(["core", "defined", "previous", "frozen"])
const isFixed = (entry: VocabularyEntry) => fixedOrigins.has(entry.origin)

/**
 * The groups' terms with exact keys merged: the same key, kind and value type is one entry (labels, citations and
 * outlines joined, the first origin kept); the same key with another kind or value type stays a separate entry, a
 * collision for C-merge.
 */
export function mergeExactKeys(entries: readonly VocabularyEntry[]): VocabularyEntry[] {
  const merged: VocabularyEntry[] = []
  for (const entry of entries) {
    const same = merged.find(
      (item) => item.term.key === entry.term.key && signatureOf(item.term) === signatureOf(entry.term)
    )
    if (!same) {
      merged.push({ term: structuredClone(entry.term), serves: [...entry.serves], origin: entry.origin })
      continue
    }
    mergeLabels(same.term, entry.term.labels)
    same.term.citations = uniqueCitations([...same.term.citations, ...entry.term.citations])
    same.term.definition ??= entry.term.definition
    same.serves = [...new Set([...same.serves, ...entry.serves])]
  }
  return merged
}

function parentOf(term: TermContent) {
  if (term.kind === "property" || term.kind === "category") {
    return term.of
  }
  return term.kind === "value" ? term.set : null
}

/** What a term is about: two terms can be one only within the same scope. */
function scopeOf(term: TermContent, vocabulary: ReturnType<typeof createVocabulary>) {
  if (term.kind === "property") {
    return `property:${vocabulary.thingOf(term.of)}`
  }
  return term.kind === "value" ? `value:${term.set}` : term.kind
}

const shown = (term: TermContent) => term.labels.filter((label) => label.role !== "avoid")

/**
 * Clusters of entries (by index) that may be one term or are colliding: the same key with another kind or value type;
 * the same kind and scope with labels that match; or one kind in different scopes sharing a label exactly. Only
 * clusters holding a group's or a proposed term are kept.
 */
export function mergeClusters(entries: readonly VocabularyEntry[]) {
  const vocabulary = createVocabulary(entries.map((entry) => entry.term))
  const parent = entries.map((_entry, index) => index)
  const find = (index: number): number => {
    const up = parent[index] ?? index
    return up === index ? index : find(up)
  }
  const join = (a: number, b: number) => {
    parent[find(a)] = find(b)
  }
  const forms = entries.map((entry) => new Set(shown(entry.term).flatMap(labelForms)))
  entries.forEach((a, i) => {
    entries.forEach((b, j) => {
      if (j <= i || (isFixed(a) && isFixed(b))) {
        return
      }
      if (a.term.key === b.term.key) {
        join(i, j)
        return
      }
      if (a.term.kind !== b.term.kind) {
        return
      }
      if (scopeOf(a.term, vocabulary) === scopeOf(b.term, vocabulary)) {
        const matches = shown(a.term).some((left) =>
          shown(b.term).some((right) => matchLabel(left.text, right) !== null || matchLabel(right.text, left) !== null)
        )
        if (matches) {
          join(i, j)
        }
      } else if ([...(forms[i] ?? [])].some((form) => forms[j]?.has(form))) {
        join(i, j)
      }
    })
  })
  const clusters = new Map<number, number[]>()
  entries.forEach((_entry, index) => {
    const root = find(index)
    clusters.set(root, [...(clusters.get(root) ?? []), index])
  })
  return [...clusters.values()]
    .filter((indexes) => indexes.length > 1 && indexes.some((index) => !isFixed(entries[index] as VocabularyEntry)))
    .toSorted((a, b) => (a[0] ?? 0) - (b[0] ?? 0))
}

/** One term line: id | key | kind | of or set | value type | labels | outlines served | origin. */
function termLine(id: string, entry: VocabularyEntry) {
  const { term } = entry
  const type = term.kind === "property" ? valueTypeText(term.valueType) : ""
  const labels = shown(term)
    .map((label) => `"${label.text}"`)
    .join(", ")
  return [id, term.key, term.kind, parentOf(term) ?? "", type, labels, String(entry.serves.length), entry.origin].join(
    " | "
  )
}

/** hoa-vocabulary-merge's variable, and which entry each line id names. */
export function vocabularyMergeVariables(entries: readonly VocabularyEntry[], clusters: readonly number[][]) {
  const ids = new Map<string, number>()
  const blocks = clusters.map((indexes) =>
    indexes
      .map((index) => {
        const id = `t${ids.size + 1}`
        ids.set(id, index)
        return termLine(id, entries[index] as VocabularyEntry)
      })
      .join("\n")
  )
  const variables: PromptVariables<typeof stepPrompts.vocabularyMerge> = { clusters: blocks.join("\n\n") || "none" }
  return { variables, ids }
}

const lineId = z.string().regex(/^t\d+$/, "a line id like t4")

/** C-merge's answer: one fixed format; code checks that every id is a line of the call. */
export const vocabularyMergeAnswer = z.object({
  merges: z.array(z.object({ keep: lineId, merge: z.array(lineId).min(1), why: z.string().min(1) })),
  renames: z.array(z.object({ id: lineId, name: segment, why: z.string().min(1) })),
  distinct: z.array(z.object({ terms: z.array(z.object({ id: lineId, context: z.string().min(1) })).min(2) })),
  notes: z.array(z.string())
})
export type VocabularyMergeAnswer = z.output<typeof vocabularyMergeAnswer>

export type MergeProblem = { recordKey: string; code: string; message: string; path: [] }

/** Every string in a value equal to a renamed key, or under it, rewritten. */
function renamed<T>(value: T, renames: ReadonlyMap<TermKey, TermKey>): T {
  const rename = (text: string) => {
    for (const [from, to] of renames) {
      if (text === from || text.startsWith(`${from}.`)) {
        return to + text.slice(from.length)
      }
    }
    return text
  }
  return JSON.parse(JSON.stringify(value, (_key, item: unknown) => (typeof item === "string" ? rename(item) : item)))
}

const dimensionOf = (term: TermContent, vocabulary: ReturnType<typeof createVocabulary>) => {
  if (term.kind !== "property" || term.valueType.type !== "quantity") {
    return null
  }
  const unit = vocabulary.get(term.valueType.unit)
  return unit?.kind === "unit" ? unit.dimension : null
}

/** Whether two terms may be merged: one kind and scope, and for properties one value type (and dimension). */
function mergeable(a: TermContent, b: TermContent, vocabulary: ReturnType<typeof createVocabulary>) {
  if (a.kind !== b.kind || scopeOf(a, vocabulary) !== scopeOf(b, vocabulary)) {
    return false
  }
  if (a.kind === "property" && b.kind === "property") {
    return a.valueType.type === b.valueType.type && dimensionOf(a, vocabulary) === dimensionOf(b, vocabulary)
  }
  return true
}

/**
 * Applies C-merge's answer: a merge folds entries of one kind, scope and value type into the kept one (labels,
 * citations and outlines join; every reference to a merged key is rewritten, so values of a merged set move to the kept
 * set); a rename gives a colliding entry a new last key segment (references from the same origin follow); a distinct
 * entry gets its context. Anything else (an unknown id, a merge across kinds or value types, a fixed term merged away
 * or renamed) is refused. Then exact keys merge again and the vocabulary is frozen.
 */
export function applyVocabularyMerge(input: {
  entries: readonly VocabularyEntry[]
  ids: ReadonlyMap<string, number>
  answer: VocabularyMergeAnswer
}) {
  const problems: MergeProblem[] = []
  const refuse = (recordKey: string, message: string) =>
    problems.push({ recordKey, code: "invalid-merge", message, path: [] })
  let entries = input.entries.map((entry) => ({
    ...entry,
    term: structuredClone(entry.term),
    serves: [...entry.serves]
  }))
  const vocabulary = createVocabulary(entries.map((entry) => entry.term))
  const at = (id: string) => {
    const index = input.ids.get(id)
    return index === undefined ? undefined : entries[index]
  }
  const removed = new Set<VocabularyEntry>()
  const merges: { keep: TermKey; merge: TermKey[] }[] = []
  for (const { keep, merge } of input.answer.merges) {
    const kept = at(keep)
    const absorbed = merge.filter((id) => id !== keep).map(at)
    if (!kept || absorbed.some((entry) => entry === undefined)) {
      refuse(keep, `the merge into ${keep} names a line that isn't in the clusters`)
      continue
    }
    const found = absorbed.filter((entry): entry is (typeof entries)[number] => entry !== undefined)
    const fixed = found.find(isFixed)
    if (fixed) {
      refuse(fixed.term.key, `${fixed.term.key} is ${fixed.origin}, so it can't be merged into ${kept.term.key}`)
      continue
    }
    const other = found.find((entry) => !mergeable(entry.term, kept.term, vocabulary))
    if (other) {
      refuse(other.term.key, `${other.term.key} isn't of ${kept.term.key}'s kind, scope and value type`)
      continue
    }
    for (const entry of found) {
      mergeLabels(kept.term, entry.term.labels)
      kept.term.citations = uniqueCitations([...kept.term.citations, ...entry.term.citations])
      kept.serves = [...new Set([...kept.serves, ...entry.serves])]
      removed.add(entry)
    }
    const renames = new Map(
      found.filter((entry) => entry.term.key !== kept.term.key).map((entry) => [entry.term.key, kept.term.key])
    )
    entries = entries.map((entry) => (removed.has(entry) ? entry : { ...entry, term: renamed(entry.term, renames) }))
    merges.push({ keep: kept.term.key, merge: found.map((entry) => entry.term.key) })
  }
  const renamedEntries: { key: TermKey; origin: TermOrigin; to: TermKey }[] = []
  for (const { id, name } of input.answer.renames) {
    const entry = at(id)
    if (!entry || removed.has(entry)) {
      refuse(id, `${id} isn't a line of the clusters`)
      continue
    }
    if (isFixed(entry)) {
      refuse(entry.term.key, `${entry.term.key} is ${entry.origin}, so it keeps its key`)
      continue
    }
    const parent = parentOf(entry.term)
    const to = entry.term.kind === "property" || entry.term.kind === "value" ? `${parent}.${name}` : name
    const from = entry.term.key
    renamedEntries.push({ key: from, origin: entry.origin, to })
    const renames = new Map([[from, to]])
    entries = entries.map((item) => {
      if (item === entry) {
        return { ...item, term: termDraft.parse({ ...item.term, key: to }) }
      }
      return item.origin === entry.origin && item.term.key !== from
        ? { ...item, term: renamed(item.term, renames) }
        : item
    })
  }
  for (const { terms } of input.answer.distinct) {
    for (const { id, context } of terms) {
      const entry = at(id)
      if (entry) {
        entry.term.context = context
      }
    }
  }
  const frozen = mergeExactKeys(
    entries.filter((entry) => !removed.has(entry)).map((entry) => ({ ...entry, term: termDraft.parse(entry.term) }))
  )
  const coreKeys = new Set(coreTerms.map((term) => term.key))
  return {
    terms: frozen
      .filter((entry) => entry.origin !== "core" || !coreKeys.has(entry.term.key))
      .map((entry) => entry.term)
      .toSorted((a, b) => compareCodeUnits(a.key, b.key)),
    serves: new Map(frozen.map((entry) => [entry.term.key, entry.serves])),
    merges,
    renames: renamedEntries,
    problems
  }
}
