import { compareCodeUnits } from "@/rulebook/canonical"
import { coreTerms } from "@/schema/coreTerms"
import type { Provision, ProvisionKey, TermKey } from "@/schema/types"
import type { TermContent } from "@/schema/zod"
import { findLabels, type MatchKind } from "@/text/match"

// Plan (encoding.md, Plan): each document divides into encoding units within a token budget of provision text. An
// article that fits stays whole; a larger one splits by section, and a large section by its items. Neighbouring pieces
// of one document, articles included, pack together up to the budget, and no provision's subtree is divided unless it
// alone is over the budget. Each unit carries the context finding its rules needs: its references and vocabulary slice
// cover all of its provisions.

export type UnitAncestor = Pick<Provision, "key" | "kind" | "label" | "heading" | "intro" | "wrapUp">
export type UnitReference = Pick<Provision, "key" | "label" | "heading"> & { text: string; isTruncated: boolean }
export type TermMatch = { key: TermKey; kind: MatchKind; score: number; found: string }

export type EncodingUnit = {
  id: string
  documentKey: string
  provisions: Provision[]
  /** The ancestors of the unit's provisions, outermost first: headings, intros and wrap-ups. */
  context: UnitAncestor[]
  references: UnitReference[]
  /** The vocabulary slice: terms whose labels the unit's text or references mention, and their related terms. */
  terms: TermContent[]
  matches: TermMatch[]
  /** The core request types with their properties. */
  requestTypes: TermContent[]
}

export type PlanInput = {
  documents: readonly { key: string; provisions: readonly Provision[] }[]
  /** The provisions each provision cites (references.ts). */
  references: ReadonlyMap<ProvisionKey, readonly ProvisionKey[]>
  /** The organization's vocabulary from the vocabulary stage. */
  vocabulary: readonly TermContent[]
}

export type PlanOptions = { maxTokens?: number; referenceTokens?: number }

/** The most provision text one unit holds, in estimated tokens (encoding.md, Cost and scale). */
export const unitTokenBudget = 3000

const charactersPerToken = 4

export const estimateTokens = (text: string) => Math.ceil(text.length / charactersPerToken)

const provisionText = (provision: Provision) =>
  [provision.heading, provision.text, provision.intro, provision.wrapUp].filter(Boolean).join("\n")

/** A provision on its own (`whole: false`) or with all its descendants. */
type Member = { provision: Provision; whole: boolean }

function planDocument(provisions: readonly Provision[], maxTokens: number) {
  const children = new Map<string | null, Provision[]>()
  for (const provision of provisions) {
    children.set(provision.parentLabel, [...(children.get(provision.parentLabel) ?? []), provision])
  }
  const kids = (provision: Provision) => children.get(provision.label) ?? []
  const sizes = new Map<Provision, number>()
  const size = (provision: Provision): number => {
    let found = sizes.get(provision)
    if (found === undefined) {
      found = estimateTokens(provisionText(provision)) + kids(provision).reduce((sum, kid) => sum + size(kid), 0)
      sizes.set(provision, found)
    }
    return found
  }
  const groupSize = (group: readonly Member[]) =>
    group.reduce(
      (sum, { provision, whole }) => sum + (whole ? size(provision) : estimateTokens(provisionText(provision))),
      0
    )

  /** Packs neighbouring pieces, in order, while their sum stays within the budget. A piece is never divided. */
  const pack = (pieces: readonly Member[][]) => {
    const packed: Member[][] = []
    for (const piece of pieces) {
      const last = packed.at(-1)
      if (last && groupSize(last) + groupSize(piece) <= maxTokens) {
        last.push(...piece)
      } else {
        packed.push([...piece])
      }
    }
    return packed
  }

  const split = (provision: Provision): Member[][] =>
    size(provision) <= maxTokens || kids(provision).length === 0
      ? [[{ provision, whole: true }]]
      : pack([[{ provision, whole: false }], ...kids(provision).flatMap(split)])

  const expand = ({ provision, whole }: Member): Provision[] =>
    whole ? [provision, ...kids(provision).flatMap((kid) => expand({ provision: kid, whole: true }))] : [provision]
  // Small top-level sections (and the last pieces of a split one) pack with their neighbours too, so a document of
  // many short articles makes a few units, not one each.
  return pack((children.get(null) ?? []).flatMap(split)).map((group) => group.flatMap(expand))
}

function truncate(text: string, tokens: number) {
  const limit = tokens * charactersPerToken
  return text.length <= limit ? { text, isTruncated: false } : { text: `${text.slice(0, limit)}…`, isTruncated: true }
}

/** Terms the slice needs beside those mentioned: a thing's properties, a property's thing, a set's values. */
function related(term: TermContent, vocabulary: readonly TermContent[]) {
  return vocabulary.filter(
    (other) =>
      (other.kind === "property" && other.of === term.key) ||
      (other.kind === "value" && other.set === term.key) ||
      (term.kind === "property" && other.key === term.of) ||
      (term.kind === "value" && other.key === term.set)
  )
}

/** The value sets the slice's choice properties choose from, with their values, so the model can name each value. */
function choiceSets(slice: readonly TermContent[], vocabulary: readonly TermContent[]) {
  const sets = new Set(
    slice.flatMap((term) => (term.kind === "property" && term.valueType.type === "choice" ? [term.valueType.set] : []))
  )
  return vocabulary.filter((term) => sets.has(term.key) || (term.kind === "value" && sets.has(term.set)))
}

/** The core request types and their properties. */
export function coreRequestTypes(): TermContent[] {
  const requests = new Set(
    coreTerms.filter((term) => term.kind === "thing" && term.nature === "request").map((term) => term.key)
  )
  return coreTerms.filter((term) => requests.has(term.key) || (term.kind === "property" && requests.has(term.of)))
}

/** Divides the documents into encoding units with their context (encoding.md, Plan). */
export function planUnits(input: PlanInput, options: PlanOptions = {}): EncodingUnit[] {
  const maxTokens = options.maxTokens ?? unitTokenBudget
  const referenceTokens = options.referenceTokens ?? 1500
  const byKey = new Map(input.documents.flatMap((document) => document.provisions.map((p) => [p.key, p] as const)))
  const labels = input.vocabulary.flatMap((term) =>
    term.labels
      .filter((label) => label.role !== "avoid")
      .map((label) => ({ item: term, text: label.text, plural: label.plural }))
  )
  const requests = coreRequestTypes()

  return input.documents.flatMap((document) =>
    planDocument(document.provisions, maxTokens).map((provisions): EncodingUnit => {
      const inUnit = new Set(provisions.map((provision) => provision.key))
      const ancestorKeys = new Set<ProvisionKey>()
      for (const provision of provisions) {
        for (let label = provision.parentLabel; label !== null;) {
          const parent = byKey.get(`${document.key}:${label}`)
          if (!parent || inUnit.has(parent.key)) {
            break
          }
          ancestorKeys.add(parent.key)
          label = parent.parentLabel
        }
      }
      const context = document.provisions
        .filter((provision) => ancestorKeys.has(provision.key))
        .map(({ key, kind, label, heading, intro, wrapUp }) => ({ key, kind, label, heading, intro, wrapUp }))
      const cited = [...new Set(provisions.flatMap((provision) => input.references.get(provision.key) ?? []))]
      const references = cited
        .filter((key) => !inUnit.has(key))
        .flatMap((key) => {
          const found = byKey.get(key)
          return found
            ? [{ key, label: found.label, heading: found.heading, ...truncate(provisionText(found), referenceTokens) }]
            : []
        })
      const hits = findLabels(
        [...provisions.map(provisionText), ...references.map((reference) => reference.text)].join("\n"),
        labels
      )
      const mentioned = new Map<TermKey, TermContent>()
      for (const hit of hits) {
        mentioned.set(hit.item.key, hit.item)
        for (const term of related(hit.item, input.vocabulary)) {
          mentioned.set(term.key, term)
        }
      }
      for (const term of choiceSets([...mentioned.values()], input.vocabulary)) {
        mentioned.set(term.key, term)
      }
      const bestHits = new Map<TermKey, TermMatch>()
      for (const hit of hits) {
        const previous = bestHits.get(hit.item.key)
        if (!previous || hit.score > previous.score) {
          bestHits.set(hit.item.key, { key: hit.item.key, kind: hit.kind, score: hit.score, found: hit.found })
        }
      }
      return {
        id: provisions[0]?.key ?? document.key,
        documentKey: document.key,
        provisions,
        context,
        references,
        terms: [...mentioned.values()].toSorted((a, b) => compareCodeUnits(a.key, b.key)),
        matches: [...bestHits.values()].toSorted((a, b) => compareCodeUnits(a.key, b.key)),
        requestTypes: requests
      }
    })
  )
}
